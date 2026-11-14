"""MATCH_EVENT — 판정 메시지 한 건 → W1 봉투(api-internal.md 4 · 5절, F06, Jira S15P31A102-186).

흐름: 메시지(기사 · EXTRACT 결과 · 후보 사건 최대 5개)를 판정 글로 만든다 → GMS → 답 검사.
답이 틀리면 한 번만 다시 묻고, 또 틀리면 LLM_OUTPUT_INVALID 다. 작업 번호(jobId)가 있는 메시지는 내용이 깨져도
INTERNAL 실패 봉투로 끝낸다 — 판정은 한 번에 하나씩 돌아서 W1 이 없으면 판정 줄 전체가 멈춘다(4절).
판정은 DB 를 읽지 않는다. 후보는 API 가 골라 메시지에 넣는다.
"""

import json
import logging
from typing import Any

from app.extract.postprocess import OutputInvalid
from app.extract.run import ChatClient, now_kst
from app.gms import GmsAuthError, GmsError
from app.match_event.postprocess import check_answer
from app.match_event.prompt import PROMPT_VERSION, SYSTEM_PROMPT
from app.text_rules import private_names
from app.worker import Diag, Envelope, Stage, StageBlocked, single_job_id

STAGE = "MATCH_EVENT"
STREAM = "analysis.match_event"
GROUP = "match_event"
OUTPUT_TRIES = 2
CANDIDATE_KEYS = (
    "eventId",
    "title",
    "label",
    "summary",
    "occurredAt",
    "evidence",
    "similarity",
)

log = logging.getLogger(__name__)


class MessageBroken(Exception):
    """메시지에 판정에 쓸 칸이 없다. 값은 칸 이름뿐이다 — 기사 글을 로그 · W1 에 싣지 않는다."""


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


def build_user(payload: dict[str, Any]) -> tuple[str, set[int], list[str]]:
    """(판정 글, 후보 사건 번호, 쓰면 안 되는 이름). 칸이 없으면 MessageBroken."""
    article, extracted, raw = (
        payload.get(k) for k in ("article", "extracted", "candidates")
    )
    if not isinstance(article, dict):
        raise MessageBroken("article")
    if not isinstance(extracted, dict):
        raise MessageBroken("extracted")
    primary = extracted.get("primaryEvent")
    if not isinstance(primary, dict) or not isinstance(primary.get("text"), str):
        raise MessageBroken("extracted.primaryEvent")
    if not isinstance(raw, list):
        raise MessageBroken("candidates")
    evidence = [
        e["text"]
        for e in primary.get("evidence") or []
        if isinstance(e, dict) and isinstance(e.get("text"), str)
    ]
    candidates = []
    for c in raw:
        if not isinstance(c, dict) or type(c.get("eventId")) is not int:
            raise MessageBroken("candidates[].eventId")
        candidates.append({k: c.get(k) for k in CANDIDATE_KEYS})
    texts = [article.get("title"), extracted.get("summary"), primary["text"], *evidence]
    banned = private_names(t for t in texts if isinstance(t, str))
    user = {
        "article": {k: article.get(k) for k in ("title", "publisher", "publishedAt")},
        "extracted": {
            "summary": extracted.get("summary"),
            "occurredAt": extracted.get("occurredAt"),
            "primaryEvent": {"text": primary["text"], "evidence": evidence},
        },
        "candidates": candidates,
        "doNotName": banned,
    }
    return (
        json.dumps(user, ensure_ascii=False),
        {c["eventId"] for c in candidates},
        banned,
    )


async def run_match_event(
    payload: dict[str, Any], llm: ChatClient, model: str, deadline: float
) -> tuple[Envelope, Diag]:
    """(W1 봉투, 로그용 진단). GMS 키 오류(GmsAuthError)만 밖으로 던진다 — 작업 실패가 아니라 설정 오류다."""
    started = now_kst()
    diag: Diag = {"calls": 0, "usage": [], "warnings": []}

    def envelope(
        result: dict[str, Any] | None, code: str | None, message: str
    ) -> Envelope:
        return make_envelope(payload, model, started, result, code, message)

    try:
        try:
            user, candidate_ids, banned = build_user(payload)
        except MessageBroken as e:
            return envelope(None, "INTERNAL", f"메시지 형식 오류({e})"), diag
        diag["candidates"] = len(candidate_ids)
        problem = ""
        for _ in range(OUTPUT_TRIES):
            out = await llm.complete(SYSTEM_PROMPT, user, deadline)
            diag["calls"] += 1
            diag["usage"].append(out.usage)
            if out.finish_reason == "length":
                problem = "출력이 길이 상한에서 잘림"
                continue
            try:
                result, warnings = check_answer(out.content, candidate_ids, banned)
            except OutputInvalid as e:
                problem = str(e)
                continue
            diag["warnings"] = warnings
            diag["decision"] = result["decision"]
            if result["newEvent"]:
                diag["role"] = result["newEvent"]["role"]
            return envelope(result, None, ""), diag
        return envelope(None, "LLM_OUTPUT_INVALID", problem[:200]), diag
    except GmsError as e:
        return envelope(None, e.code, e.message), diag
    except GmsAuthError:
        raise
    except Exception as e:
        # 기사 글이 로그 · W1 에 섞이지 않게 예외 이름만 싣는다. API 가 1분 뒤 한 번 더 건다(api.md 2절)
        log.exception("MATCH_EVENT 처리 중 예상 밖 오류")
        return envelope(None, "INTERNAL", f"워커 오류({type(e).__name__})"), diag


def match_event_stage(llm: ChatClient, model: str) -> Stage:
    async def process(
        payload: dict[str, Any], deadline: float
    ) -> tuple[Envelope, Diag]:
        try:
            return await run_match_event(payload, llm, model, deadline)
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
            f"MATCH_EVENT job={job_id} attempt={attempt} {envelope['status']}{code}"
            f" decision={diag.get('decision', '-')} role={diag.get('role', '-')}"
            f" candidates={diag.get('candidates', '?')} calls={diag.get('calls', '?')} tokens={tokens}"
            f" warnings={len(diag.get('warnings', []))} {seconds:.1f}초 W1={w1}"
        )

    return Stage(
        name=STAGE,
        stream=STREAM,
        group=GROUP,
        process=process,
        fail=fail,
        timeout_code="LLM_TIMEOUT",
        timeout_message="처리 시간 상한(15분) 안에 판정을 끝내지 못함",
        describe=describe,
        job_id=single_job_id,
    )
