"""EMBED 워커 — 덤프 벡터와 같은 입력 · W1 봉투 · ack · 시간 초과 (Jira S15P31A102-185).

실제 모델은 읽지 않는다. 인코더는 시험이 정하는 가짜다.
"""

import asyncio
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


async def test_timeout_fails_internal_and_blocks_next_while_compute_runs(monkeypatch):
    monkeypatch.setattr(worker_module, "JOB_LIMIT_S", worker_module.W1_RESERVE_S + 0.05)
    enc = SlowEncoder()
    w, redis, status, seen = make_worker(enc, [204, 204])

    await asyncio.wait_for(w.handle("1-0", fields(PAYLOAD)), timeout=2)

    env = sent(seen)
    assert (env["status"], env["error"]["code"]) == ("FAILED", "INTERNAL")
    assert redis.acked == ["1-0"]

    # 앞 계산이 아직 돈다 — 새로 인코딩하지 않고 EMBED 만 멈춘다(ack 하지 않음)
    await asyncio.wait_for(w.handle("2-0", fields(PAYLOAD)), timeout=2)
    assert len(enc.texts) == 1
    assert redis.acked == ["1-0"]
    assert status.state == "BLOCKED"
    enc.release.set()


async def test_encodes_one_at_a_time():
    enc = SlowEncoder()
    runner = EmbedRunner(enc)
    first = asyncio.ensure_future(runner.embed("a"))
    await asyncio.sleep(0.05)
    with pytest.raises(Exception, match="아직"):
        await runner.embed("b")
    enc.release.set()
    assert len(await first) == 1024
    assert enc.texts == ["a"]


async def test_prepare_loads_model_once_off_the_event_loop():
    enc = FakeEncoder()
    runner = EmbedRunner(enc)

    await runner.prepare()

    assert enc.loaded == 1


def test_mock_encoder_gives_valid_unit_vector_per_text():
    from app.embed.model import MockEncoder
    from app.embed.run import checked_vector

    enc = MockEncoder()
    a, b = checked_vector(enc.encode("가")), checked_vector(enc.encode("나"))

    assert len(a) == DIMENSION
    assert a == checked_vector(enc.encode("가")) and a != b
