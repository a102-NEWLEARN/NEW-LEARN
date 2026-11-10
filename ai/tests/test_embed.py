"""EMBED 워커 — 덤프 벡터와 같은 입력 · W1 봉투 · ack · 시간 초과 (Jira S15P31A102-185).

실제 모델은 읽지 않는다. 인코더는 시험이 정하는 가짜다.
"""

import asyncio
import contextlib
import json
import math
import threading

import httpx
import pytest

from app import worker as worker_module
from app.backend import BackendClient
from app.embed.run import (
    DIMENSION,
    EMBED_GROUP,
    MODEL_NAME,
    EmbedRunner,
    embed_stage,
    embedding_text,
)
from app.extract.prompt import PROMPT_VERSION
from app.worker import STREAM, QueueWorker, WorkerStatus

ARTICLE = {
    "title": "서울시 새 교통 정책",
    "publisher": "가람일보",
    "publishedAt": "2026-10-07T10:12:00+09:00",
    "body": "서울시가 6일 새 교통 정책을 발표했다. 시민들은 대체로 환영했다.",
}
PAYLOAD = {
    "articleId": 456,
    "jobs": {"EXTRACT": 789, "EMBED": 790},
    "attempt": 1,
    "article": ARTICLE,
}


def unit(n: int = DIMENSION) -> list[float]:
    return [1.0 / math.sqrt(n)] * n


class FakeEncoder:
    """encode 를 부른 횟수와 받은 글을 남긴다. vector 로 돌려줄 값을 바꿀 수 있다."""

    def __init__(self, vector=None, error: BaseException | None = None) -> None:
        self.vector = unit() if vector is None else vector
        self.error = error
        self.texts: list[str] = []
        self.loaded = 0

    def load(self) -> None:
        self.loaded += 1

    def encode(self, text: str):
        self.texts.append(text)
        if self.error:
            raise self.error
        return self.vector


class SlowEncoder(FakeEncoder):
    """release 가 풀릴 때까지 계산이 끝나지 않는다 — 시간 초과 뒤 남은 계산을 흉내 낸다."""

    def __init__(self) -> None:
        super().__init__()
        self.release = threading.Event()

    def encode(self, text: str):
        self.texts.append(text)
        self.release.wait(5)
        return self.vector


class FakeRedis:
    def __init__(self) -> None:
        self.acked: list[str] = []

    async def xack(self, stream, group, msg_id):
        assert (stream, group) == (STREAM, EMBED_GROUP)
        self.acked.append(msg_id)


def backend(statuses) -> tuple[BackendClient, list]:
    seen = []
    it = iter(statuses)

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(next(it), json=None)

    async def no_sleep(_):
        return None

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return BackendClient(http, "http://backend:8080", "worker-key", no_sleep), seen


def make_worker(encoder, statuses) -> tuple[QueueWorker, FakeRedis, WorkerStatus, list]:
    redis = FakeRedis()
    status = WorkerStatus("RUNNING")
    b, seen = backend(statuses)
    runner = EmbedRunner(encoder)
    w = QueueWorker(redis, b, "w1", status, embed_stage(runner))
    return w, redis, status, seen


def fields(payload) -> dict:
    return {b"payload": json.dumps(payload, ensure_ascii=False).encode()}


def sent(seen, i=0) -> dict:
    return json.loads(seen[i].content)


# --- 입력 글: 덤프(issue_grouping.embedding_text)와 같게 -------------------------------


def test_text_is_title_newline_body_lead():
    assert embedding_text(ARTICLE) == ARTICLE["title"] + "\n" + ARTICLE["body"]


@pytest.mark.parametrize("n", [799, 800, 801])
def test_text_cuts_body_at_800_python_chars(n):
    body = "가" * n
    assert embedding_text({"title": "t", "body": body}) == "t\n" + "가" * min(n, 800)


def test_text_keeps_whitespace_crlf_and_html_as_is():
    # 덤프는 원문을 그대로 넣는다 — strip · 줄바꿈 정리 · EXTRACT 전처리를 하지 않는다
    a = {"title": "  제목 &amp; ", "body": "\r\n 본문 <b>굵게</b>  \r\n"}
    assert embedding_text(a) == "  제목 &amp; \n\r\n 본문 <b>굵게</b>  \r\n"


def test_text_cut_counts_emoji_as_one_char():
    body = "가" * 799 + "😀" + "나"
    assert embedding_text({"title": "", "body": body}) == "\n" + "가" * 799 + "😀"


@pytest.mark.parametrize(
    "article, expected",
    [
        ({"title": "", "body": "본문"}, "\n본문"),
        ({"title": None, "body": "본문"}, "\n본문"),
        ({"title": "제목", "body": None}, "제목\n"),
        ({"title": 12, "body": 3.5}, "\n"),
        ({}, "\n"),
    ],
)
def test_text_treats_missing_or_non_string_as_empty(article, expected):
    assert embedding_text(article) == expected


# --- 봉투 --------------------------------------------------------------------------


async def test_success_sends_vector_envelope_then_acks():
    enc = FakeEncoder()
    w, redis, status, seen = make_worker(enc, [204])

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == ["1-0"]
    assert seen[0].url.path == "/internal/v1/analysis-jobs/790/result"
    env = sent(seen)
    assert env["status"] == "SUCCEEDED"
    assert env["attempt"] == 1
    assert env["model"] == MODEL_NAME == "dragonkue/BGE-m3-ko"
    assert env["promptVersion"] is None
    assert env["error"] is None
    assert env["startedAt"].endswith("+09:00") and env["finishedAt"].endswith("+09:00")
    r = env["result"]
    assert r["model"] == MODEL_NAME
    assert r["dimension"] == 1024
    assert len(r["vector"]) == 1024 and all(type(x) is float for x in r["vector"])
    assert enc.texts == [ARTICLE["title"] + "\n" + ARTICLE["body"]]
    assert status.state == "RUNNING"


async def test_numpy_vector_becomes_json_numbers():
    np = pytest.importorskip("numpy")
    vec = np.asarray(unit(), dtype=np.float32)
    w, _, _, seen = make_worker(FakeEncoder(vector=vec), [204])

    await w.handle("1-0", fields(PAYLOAD))

    v = sent(seen)["result"]["vector"]
    assert len(v) == 1024 and all(type(x) is float for x in v)
    assert abs(math.fsum(x * x for x in v) - 1) < 1e-3


async def test_embed_envelope_never_carries_extract_prompt_version():
    w, _, _, seen = make_worker(FakeEncoder(error=RuntimeError("x")), [204])

    await w.handle("1-0", fields(PAYLOAD))

    env = sent(seen)
    assert env["promptVersion"] is None
    assert env["promptVersion"] != PROMPT_VERSION


@pytest.mark.parametrize(
    "vector",
    [
        unit(768),  # 차원 다름
        [float("nan")] + unit()[1:],
        [float("inf")] + unit()[1:],
        [3.5e38] + [0.0] * 1023,  # float4 범위 밖
        [0.5] * 1024,  # 길이 1 아님
        ["0.1"] * 1024,  # 숫자 아님
    ],
    ids=["dim", "nan", "inf", "float4", "norm", "str"],
)
async def test_bad_vector_fails_internal_without_sending_it(vector):
    w, redis, _, seen = make_worker(FakeEncoder(vector=vector), [204])

    await w.handle("1-0", fields(PAYLOAD))

    env = sent(seen)
    assert env["status"] == "FAILED"
    assert env["result"] is None
    assert env["error"]["code"] == "INTERNAL"
    assert redis.acked == ["1-0"]


async def test_encoder_error_fails_internal():
    w, redis, status, seen = make_worker(FakeEncoder(error=RuntimeError("oom")), [204])

    await w.handle("1-0", fields(PAYLOAD))

    env = sent(seen)
    assert (env["status"], env["error"]["code"]) == ("FAILED", "INTERNAL")
    assert env["model"] == MODEL_NAME
    assert redis.acked == ["1-0"]
    assert status.state == "RUNNING"


# --- 메시지 · ack ---------------------------------------------------------------------


async def test_skips_message_without_embed_job():
    enc = FakeEncoder()
    w, redis, _, seen = make_worker(enc, [])

    await w.handle("1-0", fields({**PAYLOAD, "jobs": {"EXTRACT": 789}}))

    assert redis.acked == ["1-0"]
    assert seen == [] and enc.texts == []


@pytest.mark.parametrize(
    "raw",
    [
        {b"payload": b"{not json"},
        fields({**PAYLOAD, "jobs": {"EMBED": "790"}}),
        fields({k: v for k, v in PAYLOAD.items() if k != "attempt"}),
    ],
    ids=["json", "job-type", "no-attempt"],
)
async def test_broken_message_is_acked_without_w1(raw):
    w, redis, _, seen = make_worker(FakeEncoder(), [])

    await w.handle("9-0", raw)

    assert redis.acked == ["9-0"] and seen == []


@pytest.mark.parametrize("code", [204, 400, 404, 409])
async def test_w1_contract_statuses_are_acked(code):
    w, redis, _, _ = make_worker(FakeEncoder(), [code])

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == ["1-0"]


@pytest.mark.parametrize("code", [401, 403])
async def test_w1_auth_failure_blocks_without_ack(code):
    w, redis, status, _ = make_worker(FakeEncoder(), [code])

    await w.handle("1-0", fields(PAYLOAD))

    assert redis.acked == []
    assert status.state == "BLOCKED"


async def test_w1_resend_does_not_encode_again():
    enc = FakeEncoder()
    w, redis, _, seen = make_worker(enc, [502, 503, 204])

    await w.handle("1-0", fields(PAYLOAD))

    assert len(seen) == 3 and len(enc.texts) == 1
    assert redis.acked == ["1-0"]


async def test_w1_unreachable_leaves_message_for_reclaim():
    w, redis, status, seen = make_worker(FakeEncoder(), [502] * 6)

    await w.handle("1-0", fields(PAYLOAD))

    assert len(seen) == 6
    assert redis.acked == []
    assert status.state == "RUNNING"


# --- 시간 초과 · 남은 계산 ------------------------------------------------------------


async def test_timeout_fails_internal_then_blocks_at_once_while_compute_runs(
    monkeypatch,
):
    monkeypatch.setattr(worker_module, "JOB_LIMIT_S", worker_module.W1_RESERVE_S + 0.05)
    enc = SlowEncoder()
    w, redis, status, seen = make_worker(enc, [204, 204])
    try:
        await asyncio.wait_for(w.handle("1-0", fields(PAYLOAD)), timeout=2)

        env = sent(seen)
        assert (env["status"], env["error"]["code"]) == ("FAILED", "INTERNAL")
        assert redis.acked == ["1-0"]
        # 다음 메시지가 오기 전에 바로 멈춘다 — /health 가 곧 알린다
        assert status.state == "BLOCKED" and "계산이 남음" in status.reason

        # 그래도 다음 메시지가 들어오면 새로 인코딩하지 않고 ack 하지 않는다
        await asyncio.wait_for(w.handle("2-0", fields(PAYLOAD)), timeout=2)
        assert len(enc.texts) == 1
        assert redis.acked == ["1-0"]
    finally:
        enc.release.set()


async def test_timeout_after_compute_finished_does_not_block(monkeypatch):
    # 계산은 끝났는데 W1 몫 계산으로 시간 초과가 난 경우 — 남은 계산이 없으니 멈추지 않는다
    monkeypatch.setattr(worker_module, "JOB_LIMIT_S", worker_module.W1_RESERVE_S + 0.05)
    enc = SlowEncoder()
    w, _, status, _ = make_worker(enc, [204])
    enc.release.set()

    async def late(payload, deadline):
        await asyncio.sleep(1)

    w.stage = w.stage.__class__(**{**w.stage.__dict__, "process": late})
    await asyncio.wait_for(w.handle("1-0", fields(PAYLOAD)), timeout=2)

    assert status.state == "RUNNING"


async def test_encodes_one_at_a_time():
    enc = SlowEncoder()
    runner = EmbedRunner(enc)
    try:
        first = asyncio.ensure_future(runner.embed("a"))
        await asyncio.sleep(0.05)
        with pytest.raises(Exception, match="아직"):
            await runner.embed("b")
        enc.release.set()
        assert len(await first) == 1024
        assert enc.texts == ["a"]
    finally:
        enc.release.set()
        runner.close()


async def test_prepare_loads_model_once_off_the_event_loop():
    loop_thread = threading.get_ident()
    seen = []

    class Recording(FakeEncoder):
        def load(self):
            super().load()
            seen.append(threading.get_ident())

    enc = Recording()
    runner = EmbedRunner(enc)

    await runner.prepare()

    assert enc.loaded == 1
    assert seen and seen[0] != loop_thread
    runner.close()


@pytest.mark.parametrize(
    "error",
    [KeyError("본문-비밀"), IndexError("본문-비밀"), AttributeError("본문-비밀")],
    ids=["key", "index", "attr"],
)
async def test_unexpected_encoder_error_still_fails_internal_without_its_text(error):
    w, redis, status, seen = make_worker(FakeEncoder(error=error), [204])

    await w.handle("1-0", fields(PAYLOAD))

    env = sent(seen)
    assert (env["status"], env["error"]["code"]) == ("FAILED", "INTERNAL")
    assert type(error).__name__ in env["error"]["message"]
    assert "본문-비밀" not in env["error"]["message"]
    assert redis.acked == ["1-0"]
    assert status.state == "RUNNING"


async def test_huge_int_in_vector_fails_internal():
    w, _, _, seen = make_worker(FakeEncoder(vector=[10**400] + [0] * 1023), [204])

    await w.handle("1-0", fields(PAYLOAD))

    assert sent(seen)["error"]["code"] == "INTERNAL"


def test_mock_encoder_gives_valid_unit_vector_per_text():
    from app.embed.model import MockEncoder
    from app.embed.run import checked_vector

    enc = MockEncoder()
    a, b = checked_vector(enc.encode("가")), checked_vector(enc.encode("나"))

    assert len(a) == DIMENSION
    assert a == checked_vector(enc.encode("가")) and a != b


# --- 설정 · 띄우기 · 멈추기 -----------------------------------------------------------


def settings(**env):
    from app.config import load_settings

    base = {"BACKEND_URL": "http://backend:8080", "INTERNAL_API_KEY": "k"}
    return load_settings({**base, **env})


def test_embed_is_off_unless_enabled():
    from app.main import embed_plan

    s = settings(LLM_MODE="gms")
    assert s.embed_worker_enabled is False
    enc, status = embed_plan(s)
    assert enc is None and status.state == "OFF"


def test_embed_settings_defaults_and_bad_thread_value():
    s = settings(EMBED_TORCH_THREADS="0")
    assert s.embed_model_path == "/models/BGE-m3-ko"
    assert s.embed_torch_threads == 2
    assert settings(EMBED_TORCH_THREADS="x").embed_torch_threads == 2
    assert settings(EMBED_TORCH_THREADS="4").embed_torch_threads == 4


def test_embed_plan_real_mode_uses_model_folder_and_threads():
    from app.embed.model import SentenceEncoder
    from app.main import embed_plan

    s = settings(
        LLM_MODE="gms",
        EMBED_WORKER_ENABLED="true",
        EMBED_MODEL_PATH="/m",
        EMBED_TORCH_THREADS="3",
    )
    enc, status = embed_plan(s)
    assert isinstance(enc, SentenceEncoder) and (enc.path, enc.threads) == ("/m", 3)
    assert status.state == "RUNNING"


def test_embed_plan_mock_needs_explicit_allow():
    from app.embed.model import MockEncoder
    from app.main import embed_plan

    enc, status = embed_plan(settings(LLM_MODE="mock", EMBED_WORKER_ENABLED="true"))
    assert enc is None and status.state == "OFF"
    enc, status = embed_plan(
        settings(LLM_MODE="mock", EMBED_WORKER_ENABLED="true", WORKER_ALLOW_MOCK="true")
    )
    assert isinstance(enc, MockEncoder) and status.state == "RUNNING"


def test_embed_plan_blocks_without_backend():
    from app.config import load_settings
    from app.main import embed_plan

    enc, status = embed_plan(
        load_settings({"LLM_MODE": "gms", "EMBED_WORKER_ENABLED": "true"})
    )
    assert enc is None and status.state == "BLOCKED"


async def test_model_load_failure_blocks_embed_only_and_never_reads_queue():
    from app.main import run_embed

    class Broken(FakeEncoder):
        def load(self):
            raise OSError("폴더 없음")

    status = WorkerStatus("RUNNING")
    b, _ = backend([])
    reads = []

    class NoReadRedis(FakeRedis):
        async def xautoclaim(self, *a, **k):
            reads.append(a)
            return [b"0-0", [], []]

    runner = EmbedRunner(Broken())
    w = QueueWorker(NoReadRedis(), b, "w1", status, embed_stage(runner))

    await asyncio.wait_for(run_embed(runner, w, asyncio.Event()), timeout=2)

    assert status.state == "BLOCKED" and "OSError" in status.reason
    assert reads == []


async def test_unexpected_task_end_marks_blocked_but_not_on_stop():
    from app.main import watch

    async def boom():
        raise RuntimeError("x")

    async def fine():
        return None

    status = WorkerStatus("RUNNING")
    stop = asyncio.Event()
    t = asyncio.ensure_future(boom())
    watch(t, status, stop)
    with pytest.raises(RuntimeError):
        await t
    await asyncio.sleep(0)
    assert status.state == "BLOCKED" and "RuntimeError" in status.reason

    status2 = WorkerStatus("RUNNING")
    stop.set()
    t2 = asyncio.ensure_future(fine())
    watch(t2, status2, stop)
    await t2
    await asyncio.sleep(0)
    assert status2.state == "RUNNING"


async def test_stop_all_signals_everyone_and_shares_one_budget():
    from app.main import stop_all

    stop = asyncio.Event()
    ended = []

    async def polite(name):
        await stop.wait()
        ended.append(name)

    async def deaf():
        await asyncio.sleep(60)  # 종료 신호를 듣지 않는다

    async def stubborn():
        # 취소도 한동안 버틴다 — 정리 대기도 예산 안에서 끝나야 한다
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            await asyncio.sleep(5)

    tasks = [
        asyncio.ensure_future(polite("extract")),
        asyncio.ensure_future(polite("embed")),
        asyncio.ensure_future(deaf()),
        asyncio.ensure_future(deaf()),
        asyncio.ensure_future(stubborn()),
    ]
    loop = asyncio.get_running_loop()
    begin = loop.time()
    await stop_all(tasks, stop, 0.2)
    took = loop.time() - begin

    assert sorted(ended) == ["embed", "extract"]
    assert tasks[2].cancelled() and tasks[3].cancelled()
    # 예산 0.2초 하나 + 취소 정리 최소 0.5초. 작업마다 따로 기다리면 0.2 × 3 + 버팀 5초가 넘는다
    assert took < 1.0
    for t in tasks:
        t.cancel()


async def test_model_load_that_never_ends_blocks_embed(monkeypatch):
    from app import main as main_module
    from app.main import run_embed

    monkeypatch.setattr(main_module, "PREPARE_LIMIT_S", 0.1)
    gate = threading.Event()

    class Hanging(FakeEncoder):
        def load(self):
            gate.wait(5)

    status = WorkerStatus("RUNNING")
    b, _ = backend([])
    reads = []

    class NoReadRedis(FakeRedis):
        async def xautoclaim(self, *a, **k):
            reads.append(a)
            return [b"0-0", [], []]

    runner = EmbedRunner(Hanging())
    w = QueueWorker(NoReadRedis(), b, "w1", status, embed_stage(runner))
    try:
        await asyncio.wait_for(run_embed(runner, w, asyncio.Event()), timeout=2)

        assert status.state == "BLOCKED" and "끝나지 않음" in status.reason
        assert reads == []
    finally:
        gate.set()
        runner.close()


async def test_embed_is_starting_while_model_loads():
    from app.main import run_embed

    gate = threading.Event()

    class Slow(FakeEncoder):
        def load(self):
            gate.wait(5)

    status = WorkerStatus("RUNNING")
    b, _ = backend([])
    runner = EmbedRunner(Slow())
    w = QueueWorker(FakeRedis(), b, "w1", status, embed_stage(runner))
    task = asyncio.ensure_future(run_embed(runner, w, asyncio.Event()))
    try:
        await asyncio.sleep(0.05)
        assert status.state == "STARTING"
    finally:
        gate.set()
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
        runner.close()
