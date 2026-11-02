import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import backend as backend_module
from app import worker as worker_module
from app.backend import BackendClient, W1Outcome
from app.config import load_settings
from app.extract.prompt import PROMPT_VERSION
from app.extract.run import run_extract
from app.gms import Completion, GmsAuthError, GmsError
from app.main import app, get_redis, get_worker_status, worker_plan
from app.worker import GROUP, STREAM, Worker, WorkerStatus

GOOD = json.dumps(
    {
        "summary": "서울시가 새 교통 정책을 발표했다",
        "branches": [
            {
                "type": "CORE",
                "items": [{"text": "서울시, 새 교통 정책 발표", "evidence": ["s1"]}],
            },
            {"type": "REACTION", "items": [{"text": "시민: 환영", "evidence": ["s2"]}]},
        ],
        "primaryCoreIndex": 0,
        "eventTimeText": "6일",
    },
    ensure_ascii=False,
)
PAYLOAD = {
    "articleId": 456,
    "jobs": {"EXTRACT": 789, "EMBED": 790},
    "attempt": 1,
    "article": {
        "title": "서울시 새 교통 정책",
        "publisher": "가람일보",
        "publishedAt": "2026-10-07T10:12:00+09:00",
        "body": "서울시가 6일 새 교통 정책을 발표했다. 시민들은 대체로 환영했다.",
    },
}


class FakeLlm:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls = 0

    async def complete(self, system, user, deadline):
        self.calls += 1
        a = self.answers.pop(0)
        if isinstance(a, BaseException):
            raise a
        if isinstance(a, Completion):
            return a
        return Completion(a, "stop", {"prompt_tokens": 100, "completion_tokens": 50})


# --- run_extract: 메시지 → 봉투 -------------------------------------------------


async def test_success_envelope_has_result_and_versions():
    env, diag = await run_extract(PAYLOAD, FakeLlm(GOOD), "gpt-6-luna", 900)

    assert env["status"] == "SUCCEEDED"
    assert env["attempt"] == 1
    assert env["model"] == "gpt-6-luna"
    assert env["promptVersion"] == PROMPT_VERSION
    assert env["error"] is None
    assert env["startedAt"].endswith("+09:00") and env["finishedAt"].endswith("+09:00")
    r = env["result"]
    assert r["schemaVersion"] == "mindmap-v1"
    assert r["primaryCoreIndex"] == 0
    assert r["occurredAt"] == "2026-10-06T00:00:00+09:00"
    assert r["mindmap"]["branches"][0]["items"][0]["evidence"][0]["text"].startswith(
        "서울시가"
    )
    assert diag["calls"] == 1


async def test_nothing_to_analyze_fails_without_gms():
    llm = FakeLlm()
    payload = {
        **PAYLOAD,
        "article": {**PAYLOAD["article"], "body": "ⓒ 가람일보 무단전재 및 재배포 금지"},
    }

    env, _ = await run_extract(payload, llm, "gpt-6-luna", 900)

    assert env["status"] == "FAILED"
    assert env["error"]["code"] == "INPUT_NOT_ANALYZABLE"
    # GMS 를 안 불렀어도 쓸 예정이던 값을 채운다 — API 는 실패 결과의 두 칸을 저장하지 않는다
    assert env["model"] == "gpt-6-luna" and env["promptVersion"] == PROMPT_VERSION
    assert env["result"] is None
    assert llm.calls == 0


@pytest.mark.parametrize("code", ["LLM_UNAVAILABLE", "LLM_TIMEOUT", "LLM_RATE_LIMITED"])
async def test_gms_failure_becomes_its_code(code):
    env, _ = await run_extract(PAYLOAD, FakeLlm(GmsError(code, "m")), "gpt-6-luna", 900)

    assert env["status"] == "FAILED"
    assert env["error"] == {"code": code, "message": "m"}


async def test_bad_output_twice_is_output_invalid():
    llm = FakeLlm("not json", json.dumps({"branches": [], "primaryCoreIndex": None}))

    env, _ = await run_extract(PAYLOAD, llm, "gpt-6-luna", 900)

    assert env["error"]["code"] == "LLM_OUTPUT_INVALID"
    assert llm.calls == 2


async def test_bad_output_once_then_good_succeeds():
    out_of_range = json.loads(GOOD) | {"primaryCoreIndex": 5}
    llm = FakeLlm(json.dumps(out_of_range, ensure_ascii=False), GOOD)

    env, diag = await run_extract(PAYLOAD, llm, "gpt-6-luna", 900)

    assert env["status"] == "SUCCEEDED"
    assert diag["calls"] == 2


async def test_cut_off_output_is_called_again():
    llm = FakeLlm(Completion(GOOD[:40], "length", {}), GOOD)

    env, _ = await run_extract(PAYLOAD, llm, "gpt-6-luna", 900)

    assert env["status"] == "SUCCEEDED"
    assert llm.calls == 2


async def test_unexpected_error_is_internal_without_article_text():
    payload = {**PAYLOAD, "article": {"title": "t"}}

    env, _ = await run_extract(payload, FakeLlm(), "gpt-6-luna", 900)

    assert env["error"]["code"] == "INTERNAL"
    assert "KeyError" in env["error"]["message"]


async def test_gms_auth_error_is_raised_not_reported():
    with pytest.raises(GmsAuthError):
        await run_extract(PAYLOAD, FakeLlm(GmsAuthError("GMS 401")), "gpt-6-luna", 900)


# --- W1 보내기 -------------------------------------------------------------------


def backend(statuses, slept=None) -> tuple[BackendClient, list]:
    seen = []
    it = iter(statuses)

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        s = next(it)
        if isinstance(s, Exception):
            raise s
        return httpx.Response(s, json={"code": "X"} if s != 204 else None)

    async def sleep(s):
        if slept is not None:
            slept.append(s)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return BackendClient(http, "http://backend:8080", "worker-key", sleep), seen


async def test_w1_posts_envelope_with_internal_key():
    b, seen = backend([204])

    outcome, status = await b.send_result(789, {"attempt": 1})

    assert (outcome, status) == (W1Outcome.ACK, 204)
    assert seen[0].url.path == "/internal/v1/analysis-jobs/789/result"
    assert seen[0].headers["X-Internal-Key"] == "worker-key"


@pytest.mark.parametrize("status", [400, 404, 409])
async def test_w1_client_errors_are_acked(status):
    b, seen = backend([status])

    assert (await b.send_result(1, {}))[0] is W1Outcome.ACK
    assert len(seen) == 1


async def test_w1_5xx_resends_with_backoff_then_gives_up():
    slept = []
    b, seen = backend([503, httpx.ConnectError("x"), 500, 502, 503, 504], slept)

    outcome, _ = await b.send_result(1, {})

    assert outcome is W1Outcome.UNREACHABLE
    assert len(seen) == 6
    assert slept == [2.0, 4.0, 8.0, 16.0, 32.0]


async def test_w1_recovers_after_deploy_blip():
    b, seen = backend([502, 204])

    assert (await b.send_result(1, {}))[0] is W1Outcome.ACK
    assert len(seen) == 2


@pytest.mark.parametrize("status", [401, 403])
async def test_w1_auth_failure(status):
    b, seen = backend([status])

    assert (await b.send_result(1, {}))[0] is W1Outcome.AUTH_FAILED
    assert len(seen) == 1


@pytest.mark.parametrize("status", [200, 302, 408, 429])
async def test_w1_status_outside_contract_is_not_acked(status):
    # 계약의 ack 는 204 · 400 · 404 · 409 뿐이다. 저장했는지 모르는 응답에 ack 하면 작업을 잃는다
    b, seen = backend([status] * 6)

    outcome, got = await b.send_result(1, {})

    assert (outcome, got) == (W1Outcome.UNREACHABLE, status)
    assert len(seen) == 6


async def test_w1_slow_response_is_cut_by_wall_clock(monkeypatch):
    monkeypatch.setattr(backend_module, "W1_TIMEOUT_S", 0.05)
    seen = []

    async def slow(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        await asyncio.sleep(5)
        return httpx.Response(204)

    async def no_sleep(_):
        return None

    http = httpx.AsyncClient(transport=httpx.MockTransport(slow))
    b = BackendClient(http, "http://backend:8080", "worker-key", no_sleep)

    outcome, _ = await asyncio.wait_for(b.send_result(1, {}), timeout=2)

    assert outcome is W1Outcome.UNREACHABLE
    assert len(seen) == 6


async def test_w1_400_logs_only_the_error_code(caplog):
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400, json={"code": "RESULT_SCHEMA_INVALID", "detail": "body-secret-xyz"}
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    b = BackendClient(http, "http://backend:8080", "worker-key")

    assert (await b.send_result(1, {}))[0] is W1Outcome.ACK
    assert "RESULT_SCHEMA_INVALID" in caplog.text
    assert "body-secret-xyz" not in caplog.text


# --- 큐 메시지 한 건 ---------------------------------------------------------------


class FakeRedis:
    def __init__(self) -> None:
        self.acked: list[str] = []

    async def xack(self, stream, group, msg_id):
        assert (stream, group) == (STREAM, GROUP)
        self.acked.append(msg_id)


def worker(llm, statuses) -> tuple[Worker, FakeRedis, WorkerStatus, list]:
    redis = FakeRedis()
    status = WorkerStatus("RUNNING")
    b, seen = backend(statuses)
    return Worker(redis, llm, "gpt-6-luna", b, "w1", status), redis, status, seen


def fields(payload) -> dict:
    return {b"payload": json.dumps(payload, ensure_ascii=False).encode()}


async def test_handle_success_sends_w1_then_acks():
    w, redis, status, seen = worker(FakeLlm(GOOD), [204])

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == ["1-0"]
    assert json.loads(seen[0].content)["status"] == "SUCCEEDED"
    assert status.state == "RUNNING"


async def test_handle_skips_message_without_my_stage():
    llm = FakeLlm()
    w, redis, _, seen = worker(llm, [])

    await w.handle("1-0", fields({**PAYLOAD, "jobs": {"EMBED": 790}}))

    assert redis.acked == ["1-0"]
    assert llm.calls == 0 and seen == []


@pytest.mark.parametrize(
    "raw",
    [
        {b"payload": b"{not json"},
        {},
        fields({"articleId": 1, "attempt": 1}),
        fields({"jobs": {"EXTRACT": 1}}),
        fields({"jobs": {"EXTRACT": "789"}, "attempt": 1}),
        fields({"jobs": {"EXTRACT": 789}, "attempt": "1"}),
    ],
)
async def test_handle_drops_broken_message(raw):
    llm = FakeLlm()
    w, redis, _, seen = worker(llm, [])

    await w.handle("9-0", raw)

    assert redis.acked == ["9-0"]
    assert llm.calls == 0 and seen == []


async def test_handle_does_not_ack_when_w1_unreachable_and_does_not_recall_gms():
    llm = FakeLlm(GOOD)
    w, redis, status, seen = worker(llm, [503] * 6)

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == []
    assert llm.calls == 1 and len(seen) == 6
    assert status.state == "RUNNING"


async def test_handle_blocks_on_w1_auth_failure():
    w, redis, status, _ = worker(FakeLlm(GOOD), [401])

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == []
    assert status.state == "BLOCKED"


async def test_handle_blocks_on_gms_auth_failure_without_w1():
    w, redis, status, seen = worker(FakeLlm(GmsAuthError("GMS 401")), [])

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == [] and seen == []
    assert status.state == "BLOCKED"


async def test_handle_reports_failure_and_acks():
    w, redis, _, seen = worker(FakeLlm(GmsError("LLM_UNAVAILABLE", "GMS 502")), [204])

    await w.handle("1-0", fields(PAYLOAD))

    body = json.loads(seen[0].content)
    assert body["status"] == "FAILED" and body["error"]["code"] == "LLM_UNAVAILABLE"
    assert redis.acked == ["1-0"]


async def test_handle_acks_after_w1_saved_even_if_logging_breaks():
    # W1 이 저장한 뒤 진단 로그가 깨져도 ack 를 놓치면 재회수 때 GMS 를 또 부른다
    odd = Completion(GOOD, "stop", "not-a-dict")
    w, redis, _, seen = worker(FakeLlm(odd), [204])

    await w.handle("1-0", fields(PAYLOAD))

    assert len(seen) == 1
    assert redis.acked == ["1-0"]


class HangingLlm:
    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, system, user, deadline):
        self.calls += 1
        await asyncio.sleep(60)


async def test_handle_cuts_analysis_at_job_limit_and_still_reports(monkeypatch):
    # GMS 단계가 마감을 넘기면 끊고, W1 몫을 남긴 채 LLM_TIMEOUT 실패를 보낸다
    monkeypatch.setattr(worker_module, "JOB_LIMIT_S", worker_module.W1_RESERVE_S + 0.05)
    w, redis, _, seen = worker(HangingLlm(), [204])

    await asyncio.wait_for(w.handle("1-0", fields(PAYLOAD)), timeout=2)

    body = json.loads(seen[0].content)
    assert body["status"] == "FAILED" and body["error"]["code"] == "LLM_TIMEOUT"
    assert body["model"] == "gpt-6-luna" and body["attempt"] == 1
    assert redis.acked == ["1-0"]


# --- 큐 루프 -----------------------------------------------------------------------


class LoopRedis(FakeRedis):
    """xautoclaim · xreadgroup 응답을 차례로 돌려주는 Redis 대역."""

    def __init__(self, claims=(), reads=(), on_read=None) -> None:
        super().__init__()
        self.claims = list(claims)
        self.reads = list(reads)
        self.on_read = on_read
        self.claim_starts: list[str] = []

    async def xautoclaim(self, stream, group, consumer, min_idle, start_id, count):
        assert (stream, group) == (STREAM, GROUP)
        assert min_idle == 20 * 60 * 1000
        self.claim_starts.append(start_id)
        return self.claims.pop(0) if self.claims else [b"0-0", [], []]

    async def xreadgroup(self, group, consumer, streams, count, block):
        if self.on_read:
            self.on_read()
        if not self.reads:
            return []
        return [[STREAM.encode(), [self.reads.pop(0)]]]


def loop_worker(llm, statuses, redis) -> tuple[Worker, list]:
    b, seen = backend(statuses)
    return Worker(redis, llm, "gpt-6-luna", b, "w1", WorkerStatus("RUNNING")), seen


async def test_claim_follows_cursor_until_scan_ends():
    msg = (b"6-0", fields(PAYLOAD))
    redis = LoopRedis(claims=[[b"5-0", [], []], [b"0-0", [msg], []]])
    w, _ = loop_worker(FakeLlm(), [], redis)

    assert await w.next_message() == msg
    assert redis.claim_starts == ["0-0", "5-0"]

    # 한 바퀴를 다 돌았으면 다음에는 처음부터 다시 훑는다
    await w.next_message()
    assert redis.claim_starts[-1] == "0-0"


async def test_claim_scan_resumes_from_cursor_across_reads(monkeypatch):
    monkeypatch.setattr(worker_module, "CLAIM_SCAN_STEPS", 1)
    redis = LoopRedis(claims=[[b"5-0", [], []]])
    w, _ = loop_worker(FakeLlm(), [], redis)

    assert await w.next_message() is None
    await w.next_message()

    assert redis.claim_starts == ["0-0", "5-0"]


async def test_run_handles_a_message_then_stops():
    stop = asyncio.Event()
    redis = LoopRedis(reads=[(b"1-0", fields(PAYLOAD))])
    llm = FakeLlm(GOOD)
    w, seen = loop_worker(llm, [204], redis)
    redis.on_read = lambda: None if redis.reads else stop.set()

    await asyncio.wait_for(w.run(stop), timeout=2)

    assert redis.acked == ["1-0"]
    assert llm.calls == 1 and len(seen) == 1


async def test_run_does_not_start_gms_when_stop_arrives_during_read():
    stop = asyncio.Event()
    redis = LoopRedis(reads=[(b"1-0", fields(PAYLOAD))], on_read=stop.set)
    llm = FakeLlm(GOOD)
    w, seen = loop_worker(llm, [204], redis)

    await asyncio.wait_for(w.run(stop), timeout=2)

    # 읽은 메시지는 ack 하지 않고 둔다 — 다시 가져가기로 다른 워커가 처리한다
    assert llm.calls == 0 and seen == []
    assert redis.acked == []


# --- 워커를 띄울지 · 헬스 ------------------------------------------------------------

BASE = {"BACKEND_URL": "http://backend:8080", "INTERNAL_API_KEY": "k"}


@pytest.mark.parametrize(
    ("env", "state"),
    [
        ({}, "OFF"),
        (BASE, "OFF"),
        ({**BASE, "WORKER_ALLOW_MOCK": "true"}, "RUNNING"),
        ({"WORKER_ALLOW_MOCK": "true"}, "BLOCKED"),
        ({**BASE, "LLM_MODE": "gms"}, "BLOCKED"),
        (
            {
                **BASE,
                "LLM_MODE": "gms",
                "GMS_API_KEY": "g",
                "GMS_BASE_URL": "https://gms",
            },
            "RUNNING",
        ),
        (
            {"LLM_MODE": "gms", "GMS_API_KEY": "g", "GMS_BASE_URL": "https://gms"},
            "BLOCKED",
        ),
    ],
)
def test_worker_plan(env, state):
    _, _, status = worker_plan(load_settings(env))

    assert status.state == state


def test_mock_worker_reports_model_as_mock():
    _, model, _ = worker_plan(load_settings({**BASE, "WORKER_ALLOW_MOCK": "true"}))

    assert model == "mock"


class PingRedis:
    async def ping(self) -> bool:
        return True


def test_health_is_down_when_worker_blocked():
    app.dependency_overrides[get_redis] = lambda: PingRedis()
    app.dependency_overrides[get_worker_status] = lambda: WorkerStatus(
        "BLOCKED", "W1 401"
    )
    try:
        res = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 503
    assert res.json()["worker"] == "BLOCKED"
