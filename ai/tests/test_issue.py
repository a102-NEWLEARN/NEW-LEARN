"""ISSUE 이슈 판정 워커 — 메시지 → GMS → 검사 → W1 봉투(api-internal.md 4 · 5절, F07 스펙)."""

import json

import httpx
import pytest

from app.backend import BackendClient
from app.gms import Completion, GmsAuthError, GmsError
from app.issue.mock import MockIssueGms
from app.issue.prompt import PROMPT_VERSION
from app.issue.run import GROUP, STAGE, STREAM, issue_stage, run_issue
from app.worker import QueueWorker, StageBlocked, WorkerStatus

MSG = {
    "articleId": 601,
    "jobId": 77,
    "attempt": 1,
    "event": {
        "id": 4013,
        "title": "부산 북항에 상어 재출현",
        "label": "재출현",
        "summary": "북항에 상어가 다시 나타났다.",
        "occurredAt": "2026-10-28T09:00:00+09:00",
    },
    "candidateIssues": [
        {
            "issueId": 4001,
            "title": "북항 상어 출몰",
            "summary": "상어가 나타나 해경이 나섰다.",
            "events": [
                {
                    "title": "부산 북항 상어 첫 목격",
                    "label": "첫 목격",
                    "occurredAt": "2026-10-21T08:00:00+09:00",
                }
            ],
        }
    ],
    "candidateEvents": [
        {
            "eventId": 4011,
            "title": "상어 유도 작전",
            "label": "유도 작전",
            "summary": "해경이 유도했다.",
            "occurredAt": "2026-10-25T09:00:00+09:00",
            "similarity": 0.8,
        },
        {
            "eventId": 4012,
            "title": "상어 행방 묘연",
            "label": "행방 묘연",
            "summary": "상어가 사라졌다.",
            "occurredAt": "2026-10-26T09:00:00+09:00",
            "similarity": 0.7,
        },
    ],
}

ATTACH = {
    "decision": "ATTACH",
    "issueId": 4001,
    "issueSummary": "부산 북항에 상어가 나타난 뒤 다시 출현했다.",
    "reason": "같은 흐름이다",
}
CREATE = {
    "decision": "CREATE",
    "eventIds": [4013, 4011, 4012],
    "issueTitle": "북항 상어 출몰과 추적",
    "issueSummary": "부산 북항에 나타난 상어를 해경이 유도했지만 다시 나타났다.",
    "reason": "한 흐름의 사건들이다",
}
NONE = {"decision": "NONE", "reason": "아직 이슈로 묶을 사건이 없다"}


def j(obj: dict, **changes) -> str:
    return json.dumps({**obj, **changes}, ensure_ascii=False)


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
    return await run_issue(msg, llm, "gpt-6-luna", deadline=1e12)


# --- 성공 -------------------------------------------------------------------------


async def test_attach_rewrites_summary_only():
    env, diag = await run(FakeLlm(j(ATTACH, issueTitle="무시할 이름", eventIds=[1])))

    assert env["status"] == "SUCCEEDED"
    assert (env["model"], env["promptVersion"]) == ("gpt-6-luna", PROMPT_VERSION)
    assert env["result"] == ATTACH
    assert diag["decision"] == "ATTACH"


async def test_create_names_issue_with_three_events_including_this():
    env, _ = await run(FakeLlm(j(CREATE)))

    assert env["result"] == CREATE


async def test_none_keeps_only_reason():
    env, _ = await run(FakeLlm(j(NONE, issueId=4001, issueSummary="x")))

    assert env["result"] == NONE


async def test_user_message_carries_candidates_and_names_not_to_use():
    msg = json.loads(json.dumps(MSG))
    msg["event"]["summary"] = "홍길동(40)이 상어를 처음 봤다."
    llm = FakeLlm(j(NONE))

    await run(llm, msg)

    user = json.loads(llm.users[0])
    assert user["event"]["id"] == 4013
    assert [i["issueId"] for i in user["candidateIssues"]] == [4001]
    assert [e["eventId"] for e in user["candidateEvents"]] == [4011, 4012]
    assert user["doNotName"] == ["홍길동"]


# 후보가 모자라면 ATTACH · CREATE 둘 다 될 수 없다(ATTACH 는 후보 이슈가, CREATE 는 이 사건 포함 3개가 필요하다).
# 그래도 물으면 모델이 ATTACH 로 답할 수 있고, 그러면 OutputInvalid → 두 번 시도 → 1분 재시도로 ISSUE 줄이 그만큼 막힌다
# (RetryPolicy · AnalysisJobRepository 가 재시도 대기를 진행 중으로 센다). 그래서 묻지 않고 NONE 으로 끝낸다.
async def test_no_candidates_ends_as_none_without_asking():
    llm = FakeLlm()

    env, diag = await run(llm, {**MSG, "candidateIssues": [], "candidateEvents": []})

    assert env["status"] == "SUCCEEDED"
    assert env["result"]["decision"] == "NONE"
    assert llm.calls == 0, "GMS 를 부르지 않는다"
    assert diag["decision"] == "NONE"


async def test_one_candidate_event_cannot_make_an_issue_so_none_without_asking():
    llm = FakeLlm()

    env, _ = await run(
        llm,
        {
            **MSG,
            "candidateIssues": [],
            "candidateEvents": [MSG["candidateEvents"][0]],
        },
    )

    assert env["result"]["decision"] == "NONE" and llm.calls == 0


async def test_two_candidate_events_are_enough_to_ask():
    llm = FakeLlm(j(CREATE))

    env, _ = await run(llm, {**MSG, "candidateIssues": []})

    assert env["result"] == CREATE and llm.calls == 1


# --- 다시 묻기 · 실패 ----------------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        j(NONE, decision="none"),
        j(ATTACH, issueId=None),
        j(ATTACH, issueId="4001"),
        j(ATTACH, issueId=9999),
        j(ATTACH, issueSummary=" "),
        j(CREATE, eventIds="4011"),
        j(CREATE, eventIds=[4013, 4011]),
        j(CREATE, eventIds=[4011, 4012, 4011]),
        j(CREATE, eventIds=[4013, 4011, 9999]),
        j(CREATE, eventIds=[4013, 4011, 4012.0]),
        j(CREATE, eventIds=[4011, 4012, 4001]),
        j(CREATE, issueTitle=""),
        j(CREATE, issueSummary=None),
        j(CREATE, issueTitle="가" * 41),
        j(CREATE, issueSummary="상어가 나타나 해경이 나섰습니다."),
        j(CREATE, issueTitle="북항\u0000상어"),
        j(NONE, reason=""),
        "[]",
    ],
)
async def test_issue_rejects_answers_the_api_or_rules_would_refuse(bad):
    llm = FakeLlm(bad, bad)

    env, _ = await run(llm)

    assert env["status"] == "FAILED" and env["result"] is None
    assert env["error"]["code"] == "LLM_OUTPUT_INVALID"
    assert llm.calls == 2


async def test_name_not_to_use_is_rejected():
    msg = json.loads(json.dumps(MSG))
    msg["event"]["title"] = "홍길동(40) 상어 목격"
    bad = j(CREATE, issueTitle="홍길동의 상어 목격 논란")

    env, _ = await run(FakeLlm(bad, bad), msg)

    assert env["error"]["code"] == "LLM_OUTPUT_INVALID"


async def test_bad_answer_once_then_good_succeeds():
    env, diag = await run(FakeLlm(j(CREATE, eventIds=[4013]), j(CREATE)))

    assert env["status"] == "SUCCEEDED" and diag["calls"] == 2


@pytest.mark.parametrize("code", ["LLM_TIMEOUT", "LLM_UNAVAILABLE", "LLM_REFUSED"])
async def test_gms_failure_becomes_its_code(code):
    env, _ = await run(FakeLlm(GmsError(code, "x")))

    assert env["error"]["code"] == code


@pytest.mark.parametrize(
    "broken",
    [
        {k: v for k, v in MSG.items() if k != "event"},
        {**MSG, "event": {**MSG["event"], "id": "4013"}},
        {**MSG, "candidateIssues": None},
        {**MSG, "candidateEvents": [{"eventId": "4011"}]},
    ],
)
async def test_broken_message_body_still_ends_with_failure_envelope(broken):
    llm = FakeLlm()

    env, _ = await run(llm, broken)

    assert env["status"] == "FAILED" and env["error"]["code"] == "INTERNAL"
    assert llm.calls == 0


async def test_gms_auth_error_blocks_the_stage():
    stage = issue_stage(FakeLlm(GmsAuthError("401")), "gpt-6-luna")

    with pytest.raises(StageBlocked):
        await stage.process(MSG, 1e12)


async def test_mock_creates_issue_when_two_candidate_events():
    env, _ = await run(MockIssueGms())

    assert env["result"]["decision"] == "CREATE"
    assert env["result"]["eventIds"][0] == 4013 and len(env["result"]["eventIds"]) == 3


async def test_mock_leaves_event_alone_without_enough_candidates():
    env, _ = await run(
        MockIssueGms(), {**MSG, "candidateEvents": MSG["candidateEvents"][:1]}
    )

    assert env["result"]["decision"] == "NONE"


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
    stage = issue_stage(FakeLlm(j(CREATE)), "gpt-6-luna")
    w = QueueWorker(
        redis,
        BackendClient(http, "http://backend:8080", "k"),
        "w1",
        WorkerStatus("RUNNING"),
        stage,
    )

    await w.handle("6-0", {b"payload": json.dumps(MSG, ensure_ascii=False).encode()})

    assert stage.name == STAGE == "ISSUE"
    assert seen[0].url.path == "/internal/v1/analysis-jobs/77/result"
    assert json.loads(seen[0].content)["result"]["decision"] == "CREATE"
    assert redis.acked == ["6-0"]


# --- 지시문 ---------------------------------------------------------------------


# v4 5 · 6장을 지시문에 옮겼는지 글자로만 본다. 「옮겼더니 판정이 나아졌다」는 이 시험으로 말할 수 없다 —
# FakeLlm 이 정해진 답을 돌려주기 때문이다. 효과는 운영 판정을 다시 재서 말한다(infra/server/eval).
def test_prompt_carries_the_v4_rules_for_attach():
    from app.issue.prompt import SYSTEM_PROMPT

    for sentence in (
        "계기는 특정 사건",
        "한 타임라인에 이어 놓으면",
        "분야 · 인물 · 회사 · 낱말만 같으면",
        "애매하면 NONE",
    ):
        assert sentence in SYSTEM_PROMPT, sentence


def test_prompt_version_moved_up():
    assert PROMPT_VERSION == "issue-v2"
