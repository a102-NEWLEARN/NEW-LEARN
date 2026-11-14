"""MATCH_EVENT 판정 워커 — 메시지 → GMS → 검사 → W1 봉투(api-internal.md 4 · 5절, F06 스펙)."""

import json

import httpx
import pytest

from app.backend import BackendClient
from app.gms import Completion, GmsAuthError, GmsError
from app.match_event.mock import MockMatchGms
from app.match_event.prompt import PROMPT_VERSION
from app.match_event.run import (
    GROUP,
    STAGE,
    STREAM,
    match_event_stage,
    run_match_event,
)
from app.worker import QueueWorker, StageBlocked, WorkerStatus

MSG = {
    "articleId": 501,
    "jobId": 55,
    "attempt": 1,
    "article": {
        "title": "한빛반도체, 텍사스 공장 착공식",
        "publisher": "바른신문",
        "publishedAt": "2026-10-06T09:00:00+09:00",
    },
    "extracted": {
        "summary": "한빛반도체가 텍사스 공장 착공식을 열었다",
        "occurredAt": "2026-10-06T00:00:00+09:00",
        "mindmap": {"title": None, "branches": []},
        "primaryEvent": {
            "text": "한빛반도체, 텍사스 공장 착공식 개최",
            "evidence": [
                {
                    "text": "한빛반도체가 6일 텍사스 공장 착공식을 열었다.",
                    "paragraphIndex": 0,
                    "sentenceIndex": 0,
                }
            ],
        },
    },
    "candidates": [
        {
            "eventId": 97,
            "title": "한빛반도체 텍사스 공장 착공식",
            "label": "착공식",
            "summary": "한빛반도체가 착공식을 열었다.",
            "occurredAt": "2026-10-06T00:00:00+09:00",
            "evidence": ["한빛반도체가 착공식을 열었다."],
            "similarity": 0.91,
        },
        {
            "eventId": 91,
            "title": "한빛반도체, 텍사스 공장 투자 확대 발표",
            "label": "공식 발표",
            "summary": "투자 규모를 늘렸다.",
            "occurredAt": "2026-08-21T00:00:00+09:00",
            "evidence": [],
            "similarity": 0.62,
        },
    ],
}

NEW_MAIN = {
    "decision": "NEW",
    "eventId": None,
    "newEvent": {
        "title": "한빛반도체 텍사스 공장 착공식",
        "label": "착공식",
        "summary": "한빛반도체가 텍사스 공장 착공식을 열었다.",
        "role": "MAIN",
        "reactsTo": None,
        "reactsToEventId": None,
    },
    "reason": "후보와 다른 사건이다",
}


def answer(**changes) -> str:
    out = json.loads(json.dumps(NEW_MAIN))
    new = changes.pop("newEvent", {})
    out.update(changes)
    if new is None:
        out["newEvent"] = None
    elif out.get("newEvent") is not None:
        out["newEvent"].update(new)
    return json.dumps(out, ensure_ascii=False)


class FakeLlm:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls = 0
        self.users: list[str] = []

    async def complete(self, system, user, deadline):
        self.calls += 1
        self.users.append(user)
        a = self.answers.pop(0)
        if isinstance(a, BaseException):
            raise a
        if isinstance(a, Completion):
            return a
        return Completion(a, "stop", {"prompt_tokens": 100, "completion_tokens": 30})


async def run(llm, msg=MSG):
    return await run_match_event(msg, llm, "gpt-6-luna", deadline=1e12)


# --- 성공 -------------------------------------------------------------------------


async def test_new_event_envelope_has_result_and_versions():
    env, diag = await run(FakeLlm(answer()))

    assert env["status"] == "SUCCEEDED" and env["error"] is None
    assert env["attempt"] == 1
    assert (env["model"], env["promptVersion"]) == ("gpt-6-luna", PROMPT_VERSION)
    assert env["result"] == NEW_MAIN
    assert diag["calls"] == 1


async def test_existing_keeps_only_event_id():
    env, _ = await run(
        FakeLlm(answer(decision="EXISTING", eventId=97, reason="같은 착공식이다"))
    )

    assert env["result"] == {
        "decision": "EXISTING",
        "eventId": 97,
        "newEvent": None,
        "reason": "같은 착공식이다",
    }


async def test_reaction_keeps_candidate_target():
    env, _ = await run(
        FakeLlm(
            answer(
                newEvent={
                    "role": "REACTION",
                    "reactsTo": "착공식",
                    "reactsToEventId": 97,
                }
            )
        )
    )

    new = env["result"]["newEvent"]
    assert (new["role"], new["reactsTo"], new["reactsToEventId"]) == (
        "REACTION",
        "착공식",
        97,
    )


async def test_main_drops_reacts_to():
    env, _ = await run(
        FakeLlm(answer(newEvent={"reactsTo": "착공식", "reactsToEventId": 97}))
    )

    new = env["result"]["newEvent"]
    assert (new["reactsTo"], new["reactsToEventId"]) == (None, None)


async def test_reaction_target_outside_candidates_becomes_null():
    # 백엔드도 null 로 받는다(AC-13) — 워커가 먼저 지우고 경고만 남긴다
    env, diag = await run(
        FakeLlm(
            answer(
                newEvent={
                    "role": "REACTION",
                    "reactsTo": "이슈 전반",
                    "reactsToEventId": 12,
                }
            )
        )
    )

    assert env["result"]["newEvent"]["reactsToEventId"] is None
    assert diag["warnings"]


@pytest.mark.parametrize("label", ["가" * 11, "가" * 60, "가"])
async def test_label_outside_suggested_length_passes_with_warning(label):
    # 2 ~ 10자는 프롬프트에 주는 제안이고 API 는 막지 않는다(api-internal.md 5절 — 넘치면 화면이
    # 줄임표로 자른다). 버리면 다시 물어도 같은 답이 와서 그 기사가 사건에 영영 안 붙는다
    # (운영 2026-11-13 ~ 14 에 10건). 모델이 지은 글자를 그대로 두고 경고만 남긴다.
    env, diag = await run(FakeLlm(answer(newEvent={"label": label})))

    assert env["status"] == "SUCCEEDED"
    assert env["result"]["newEvent"]["label"] == label
    assert diag["warnings"]


async def test_no_candidates_still_judges():
    llm = FakeLlm(answer())

    env, _ = await run(llm, {**MSG, "candidates": []})

    assert env["status"] == "SUCCEEDED"
    assert json.loads(llm.users[0])["candidates"] == []


async def test_user_message_carries_evidence_text_and_names_not_to_use():
    msg = json.loads(json.dumps(MSG))
    msg["extracted"]["summary"] = "홍길동(51)이 공장 앞에서 시위했다"
    llm = FakeLlm(answer())

    await run(llm, msg)

    user = json.loads(llm.users[0])
    assert user["extracted"]["primaryEvent"]["evidence"] == [
        "한빛반도체가 6일 텍사스 공장 착공식을 열었다."
    ]
    assert user["doNotName"] == ["홍길동"]
    assert [c["eventId"] for c in user["candidates"]] == [97, 91]


# --- 다시 묻기 · 실패 ----------------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        answer(decision="new"),
        answer(decision="EXISTING", eventId="97"),
        answer(decision="EXISTING", eventId=97.5),
        answer(decision="EXISTING", eventId=12),
        answer(decision="EXISTING", eventId=True),
        answer(newEvent={"title": " "}),
        answer(newEvent={"label": ""}),
        answer(newEvent={"summary": None}),
        answer(newEvent={"role": "main"}),
        answer(newEvent={"role": None}),
        answer(reason=" "),
        answer(newEvent={"title": "착공\u0000식"}),
        answer(newEvent={"title": "가" * 41}),
        answer(newEvent={"summary": "착공식을 열었습니다."}),
        answer(newEvent=None),
        "not json",
    ],
)
async def test_match_rejects_answers_the_api_or_rules_would_refuse(bad):
    llm = FakeLlm(bad, bad)

    env, _ = await run(llm)

    assert env["status"] == "FAILED" and env["result"] is None
    assert env["error"]["code"] == "LLM_OUTPUT_INVALID"
    assert llm.calls == 2


async def test_name_not_to_use_is_rejected():
    msg = json.loads(json.dumps(MSG))
    msg["article"]["title"] = "홍길동(51) 공장 앞 시위"
    bad = answer(newEvent={"title": "홍길동 공장 앞 시위"})

    env, _ = await run(FakeLlm(bad, bad), msg)

    assert env["error"]["code"] == "LLM_OUTPUT_INVALID"


async def test_bad_answer_once_then_good_succeeds():
    env, diag = await run(FakeLlm(answer(decision="new"), answer()))

    assert env["status"] == "SUCCEEDED"
    assert diag["calls"] == 2


async def test_cut_off_answer_is_asked_again():
    env, _ = await run(FakeLlm(Completion(answer()[:20], "length", {}), answer()))

    assert env["status"] == "SUCCEEDED"


@pytest.mark.parametrize(
    "code", ["LLM_TIMEOUT", "LLM_RATE_LIMITED", "LLM_REFUSED", "LLM_INPUT_TOO_LONG"]
)
async def test_gms_failure_becomes_its_code(code):
    env, _ = await run(FakeLlm(GmsError(code, "x")))

    assert env["status"] == "FAILED" and env["error"]["code"] == code


@pytest.mark.parametrize(
    "broken",
    [
        {k: v for k, v in MSG.items() if k != "extracted"},
        {**MSG, "extracted": {**MSG["extracted"], "primaryEvent": None}},
        {**MSG, "candidates": "x"},
        {**MSG, "article": None},
    ],
)
async def test_broken_message_body_still_ends_with_failure_envelope(broken):
    # 작업 번호가 있으면 내용이 틀려도 W1 실패로 끝낸다 — 안 보내면 판정 줄 전체가 멈춘다(api-internal.md 4절)
    llm = FakeLlm()

    env, _ = await run(llm, broken)

    assert env["status"] == "FAILED" and env["error"]["code"] == "INTERNAL"
    assert llm.calls == 0


async def test_unexpected_error_is_internal_without_input_text():
    stage = match_event_stage(
        FakeLlm(RuntimeError("텍사스 공장 착공식 본문")), "gpt-6-luna"
    )

    env, _ = await stage.process(MSG, 1e12)

    assert env["error"]["code"] == "INTERNAL"
    assert "텍사스" not in env["error"]["message"]


async def test_gms_auth_error_blocks_the_stage():
    stage = match_event_stage(FakeLlm(GmsAuthError("401")), "gpt-6-luna")

    with pytest.raises(StageBlocked):
        await stage.process(MSG, 1e12)


async def test_mock_answer_passes_the_checks():
    env, _ = await run(MockMatchGms())

    assert env["status"] == "SUCCEEDED"
    assert env["result"]["decision"] == "NEW"


# --- 큐에서 한 건 ----------------------------------------------------------------------


class FakeRedis:
    def __init__(self) -> None:
        self.acked: list[str] = []

    async def xack(self, stream, group, msg_id):
        assert (stream, group) == (STREAM, GROUP)
        self.acked.append(msg_id)


async def test_queue_message_is_judged_reported_and_acked():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(204)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    redis = FakeRedis()
    stage = match_event_stage(FakeLlm(answer()), "gpt-6-luna")
    w = QueueWorker(
        redis,
        BackendClient(http, "http://backend:8080", "k"),
        "w1",
        WorkerStatus("RUNNING"),
        stage,
    )

    await w.handle("5-0", {b"payload": json.dumps(MSG, ensure_ascii=False).encode()})

    assert stage.name == STAGE == "MATCH_EVENT"
    assert seen[0].url.path == "/internal/v1/analysis-jobs/55/result"
    assert json.loads(seen[0].content)["result"]["decision"] == "NEW"
    assert redis.acked == ["5-0"]
