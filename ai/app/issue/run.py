"""ISSUE — 이슈 판정 메시지 한 건 → W1 봉투(api-internal.md 4 · 5절, F07, Jira S15P31A102-186).

흐름: 메시지(새 사건 · 후보 이슈 최대 5개 · 이슈 밖 앞선 사건 최대 10개)를 판정 글로 만든다 → GMS → 답 검사.
판정 워커(MATCH_EVENT)와 같은 규칙이다 — 답이 틀리면 한 번만 다시 묻고, 작업 번호가 있으면 내용이 깨져도
INTERNAL 실패 봉투로 끝낸다(이슈 판정도 한 번에 하나씩 돈다, 4절). 이슈 분야(issue_category)는 API 가 계산한다.
"""

import json
import logging
from typing import Any

from app.extract.postprocess import OutputInvalid
from app.extract.run import ChatClient, now_kst
from app.gms import GmsAuthError, GmsError
from app.issue.postprocess import CREATE_MIN_EVENTS, check_answer
from app.issue.prompt import PROMPT_VERSION, SYSTEM_PROMPT
from app.text_rules import private_names
from app.worker import Diag, Envelope, Stage, StageBlocked, single_job_id, warn_text

STAGE = "ISSUE"
STREAM = "analysis.issue"
GROUP = "issue"
OUTPUT_TRIES = 2
EVENT_KEYS = ("id", "title", "label", "summary", "occurredAt")
CANDIDATE_EVENT_KEYS = (
    "eventId",
    "title",
    "label",
    "summary",
    "occurredAt",
    "similarity",
)

log = logging.getLogger(__name__)


class MessageBroken(Exception):
    """메시지에 판정에 쓸 칸이 없다. 값은 칸 이름뿐이다."""


def make_envelope(
    payload: dict[str, Any],
    model: str,
    started: str,
    result: dict[str, Any] | None,
    code: str | None,
    message: str,
) -> Envelope:
    return {
        "attempt": payload["attempt"],
        "status": "FAILED" if code else "SUCCEEDED",
        "model": model,
        "promptVersion": PROMPT_VERSION,
        "startedAt": started,
        "finishedAt": now_kst(),
        "result": result,
        "error": {"code": code, "message": message} if code else None,
    }


def build_user(
    payload: dict[str, Any],
) -> tuple[str, int, set[int], set[int], list[str]]:
    """(판정 글, 이번 사건 번호, 후보 이슈 번호, 후보 사건 번호, 쓰면 안 되는 이름). 칸이 없으면 MessageBroken."""
    event, raw_issues, raw_events = (
        payload.get(k) for k in ("event", "candidateIssues", "candidateEvents")
    )
    if not isinstance(event, dict) or type(event.get("id")) is not int:
        raise MessageBroken("event.id")
    if not isinstance(raw_issues, list):
        raise MessageBroken("candidateIssues")
    if not isinstance(raw_events, list):
        raise MessageBroken("candidateEvents")
    issues, events = [], []
    for i in raw_issues:
        if not isinstance(i, dict) or type(i.get("issueId")) is not int:
            raise MessageBroken("candidateIssues[].issueId")
        recent = i.get("events") if isinstance(i.get("events"), list) else []
        issues.append(
            {
                "issueId": i["issueId"],
                "title": i.get("title"),
                "summary": i.get("summary"),
                "events": [
                    {k: e.get(k) for k in ("title", "label", "occurredAt")}
                    for e in recent
                    if isinstance(e, dict)
                ],
            }
        )
    for e in raw_events:
        if not isinstance(e, dict) or type(e.get("eventId")) is not int:
            raise MessageBroken("candidateEvents[].eventId")
        events.append({k: e.get(k) for k in CANDIDATE_EVENT_KEYS})
    texts = [event.get("title"), event.get("summary")]
    texts += [c.get(k) for c in events for k in ("title", "summary")]
    banned = private_names(t for t in texts if isinstance(t, str))
    user = {
        "event": {k: event.get(k) for k in EVENT_KEYS},
        "candidateIssues": issues,
        "candidateEvents": events,
        "doNotName": banned,
    }
    return (
        json.dumps(user, ensure_ascii=False),
        event["id"],
        {i["issueId"] for i in issues},
        {e["eventId"] for e in events},
        banned,
    )


async def run_issue(
    payload: dict[str, Any], llm: ChatClient, model: str, deadline: float
) -> tuple[Envelope, Diag]:
    """(W1 봉투, 로그용 진단). GMS 키 오류(GmsAuthError)만 밖으로 던진다."""
    started = now_kst()
    diag: Diag = {"calls": 0, "usage": [], "warnings": []}

    def envelope(
        result: dict[str, Any] | None, code: str | None, message: str
    ) -> Envelope:
        return make_envelope(payload, model, started, result, code, message)

    try:
        try:
            user, event_id, issue_ids, event_ids, banned = build_user(payload)
        except MessageBroken as e:
            return envelope(None, "INTERNAL", f"메시지 형식 오류({e})"), diag
        diag["candidates"] = (len(issue_ids), len(event_ids))
        # 후보가 모자라면 ATTACH · CREATE 둘 다 될 수 없다 — ATTACH 는 후보 이슈가, CREATE 는 이 사건 포함
        # CREATE_MIN_EVENTS 개가 필요하다. 그래도 물으면 모델이 ATTACH 로 답할 수 있고, 그 답은 후보 밖이라
        # OutputInvalid → 두 번 시도 → 1분 재시도가 되어 그동안 ISSUE 줄이 막힌다. 묻지 않고 NONE 으로 끝낸다
        if not issue_ids and len(event_ids) < CREATE_MIN_EVENTS - 1:
            result = {
                "decision": "NONE",
                "reason": "후보 이슈가 없고 같이 묶을 후보 사건도 모자라 묶을 데가 없다",
            }
            diag["decision"] = "NONE"
            diag["skipped"] = "후보 없음"
            return envelope(result, None, ""), diag
        problem = ""
        for _ in range(OUTPUT_TRIES):
            out = await llm.complete(SYSTEM_PROMPT, user, deadline)
            diag["calls"] += 1
            diag["usage"].append(out.usage)
            if out.finish_reason == "length":
                problem = "출력이 길이 상한에서 잘림"
                continue
            try:
                result, warnings = check_answer(
                    out.content, event_id, issue_ids, event_ids, banned
                )
            except OutputInvalid as e:
                problem = str(e)
                continue
            diag["warnings"] = warnings
            diag["decision"] = result["decision"]
            return envelope(result, None, ""), diag
        return envelope(None, "LLM_OUTPUT_INVALID", problem[:200]), diag
    except GmsError as e:
        return envelope(None, e.code, e.message), diag
    except GmsAuthError:
        raise
    except Exception as e:
        log.exception("ISSUE 처리 중 예상 밖 오류")
        return envelope(None, "INTERNAL", f"워커 오류({type(e).__name__})"), diag


def issue_stage(llm: ChatClient, model: str) -> Stage:
    async def process(
        payload: dict[str, Any], deadline: float
    ) -> tuple[Envelope, Diag]:
        try:
            return await run_issue(payload, llm, model, deadline)
        except GmsAuthError as e:
            raise StageBlocked(f"{e} — GMS_API_KEY 확인") from e

    def fail(
        payload: dict[str, Any], started: str, code: str, message: str
    ) -> Envelope:
        return make_envelope(payload, model, started, None, code, message)

    def describe(job_id, attempt, envelope, diag, seconds, w1) -> str:
        error = envelope["error"] or {}
        code = f"({error['code']})" if error else ""
        tokens = [
            (u.get("prompt_tokens"), u.get("completion_tokens"))
            for u in diag.get("usage", [])
        ]
        return (
            f"ISSUE job={job_id} attempt={attempt} {envelope['status']}{code}"
            f" decision={diag.get('decision', '-')} candidates={diag.get('candidates', '?')}"
            f" calls={diag.get('calls', '?')} tokens={tokens}"
            f" {warn_text(diag)} {seconds:.1f}초 W1={w1}"
        )

    return Stage(
        name=STAGE,
        stream=STREAM,
        group=GROUP,
        process=process,
        fail=fail,
        timeout_code="LLM_TIMEOUT",
        timeout_message="처리 시간 상한(15분) 안에 이슈 판정을 끝내지 못함",
        describe=describe,
        job_id=single_job_id,
    )
