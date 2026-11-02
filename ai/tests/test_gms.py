import asyncio
import json
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import httpx
import pytest

from app import gms as gms_module
from app.gms import GmsAuthError, GmsClient, GmsError, MockGms

OK_BODY = {
    "choices": [{"message": {"content": '{"branches": []}'}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 10, "completion_tokens": 5},
}


class Clock:
    def __init__(self) -> None:
        self.t = 0.0
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.t

    async def sleep(self, s: float) -> None:
        self.slept.append(s)
        self.t += s


def client(responses, clock: Clock | None = None) -> tuple[GmsClient, list]:
    """responses 의 원소를 차례로 돌려준다. 예외면 던진다."""
    calls = []
    it = iter(responses)

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(json.loads(req.content))
        r = next(it)
        if isinstance(r, Exception):
            raise r
        return r

    clock = clock or Clock()
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return GmsClient(
        http, "https://gms/v1", "k", "gpt-6-luna", clock.sleep, clock
    ), calls


async def test_ok_returns_content_usage_and_asks_json_mode():
    gms, calls = client([httpx.Response(200, json=OK_BODY)])

    out = await gms.complete("sys", "user", deadline=900)

    assert out.content == '{"branches": []}'
    assert out.usage["prompt_tokens"] == 10
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert calls[0]["model"] == "gpt-6-luna"


async def test_502_then_ok_retries_with_growing_waits():
    clock = Clock()
    gms, calls = client(
        [
            httpx.Response(502),
            httpx.ConnectError("x"),
            httpx.Response(200, json=OK_BODY),
        ],
        clock,
    )

    await gms.complete("s", "u", deadline=900)

    assert len(calls) == 3
    assert clock.slept == [5.0, 10.0]


async def test_unavailable_after_three_more_tries():
    clock = Clock()
    gms, calls = client([httpx.Response(502)] * 4, clock)

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_UNAVAILABLE"
    assert len(calls) == 4
    assert clock.slept == [5.0, 10.0, 20.0]


async def test_timeout_retried_once_after_a_wait_then_llm_timeout():
    clock = Clock()
    gms, calls = client([httpx.ReadTimeout("t")] * 2, clock)

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_TIMEOUT"
    assert len(calls) == 2
    assert clock.slept == [gms_module.TIMEOUT_WAIT]


async def test_slow_response_is_cut_by_wall_clock(monkeypatch):
    # httpx timeout 은 조각 사이 간격이라 조금씩 오는 응답을 자르지 못한다 — 요청 전체에 상한을 건다
    monkeypatch.setattr(gms_module, "CALL_TIMEOUT_S", 0.05)
    calls = []

    async def slow(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        await asyncio.sleep(5)
        return httpx.Response(200, json=OK_BODY)

    clock = Clock()
    http = httpx.AsyncClient(transport=httpx.MockTransport(slow))
    gms = GmsClient(http, "https://gms/v1", "k", "gpt-6-luna", clock.sleep, clock)

    with pytest.raises(GmsError) as e:
        await asyncio.wait_for(gms.complete("s", "u", deadline=900), timeout=2)

    assert e.value.code == "LLM_TIMEOUT"
    assert len(calls) == 2


async def test_429_follows_long_retry_after_without_shortening():
    clock = Clock()
    gms, calls = client(
        [httpx.Response(429, headers={"Retry-After": "300"})] * 3, clock
    )

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_RATE_LIMITED"
    assert len(calls) == 3
    assert clock.slept == [300.0, 300.0]


async def test_429_gives_up_when_retry_after_does_not_fit_deadline():
    clock = Clock()
    gms, calls = client([httpx.Response(429, headers={"Retry-After": "1000"})], clock)

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_RATE_LIMITED"
    assert len(calls) == 1
    assert clock.slept == []


async def test_429_reads_http_date_retry_after():
    clock = Clock()
    when = format_datetime(datetime.now(UTC) + timedelta(seconds=60), usegmt=True)
    gms, _ = client(
        [
            httpx.Response(429, headers={"Retry-After": when}),
            httpx.Response(200, json=OK_BODY),
        ],
        clock,
    )

    await gms.complete("s", "u", deadline=900)

    assert len(clock.slept) == 1 and 50 <= clock.slept[0] <= 60


async def test_429_follows_retry_after_then_rate_limited():
    clock = Clock()
    gms, calls = client([httpx.Response(429, headers={"Retry-After": "7"})] * 3, clock)

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_RATE_LIMITED"
    assert len(calls) == 3
    assert clock.slept == [7.0, 7.0]


@pytest.mark.parametrize(
    ("status", "body", "code"),
    [
        (
            400,
            {"error": {"code": "context_length_exceeded", "message": "too long"}},
            "LLM_INPUT_TOO_LONG",
        ),
        (
            400,
            {"error": {"code": "content_filter", "message": "filtered"}},
            "LLM_REFUSED",
        ),
        (
            400,
            {"error": {"code": "invalid_request", "message": "bad model"}},
            "INTERNAL",
        ),
        (404, {"error": {"message": "no such model"}}, "INTERNAL"),
    ],
)
async def test_client_errors_are_not_retried(status, body, code):
    gms, calls = client([httpx.Response(status, json=body)])

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == code
    assert len(calls) == 1


@pytest.mark.parametrize("status", [401, 403])
async def test_auth_error_is_config_not_job_failure(status):
    gms, _ = client([httpx.Response(status)])

    with pytest.raises(GmsAuthError):
        await gms.complete("s", "u", deadline=900)


@pytest.mark.parametrize(
    "choice",
    [
        {"message": {"content": ""}, "finish_reason": "content_filter"},
        {
            "message": {"content": None, "refusal": "할 수 없어요"},
            "finish_reason": "stop",
        },
    ],
)
async def test_refusal_in_ok_response(choice):
    gms, _ = client([httpx.Response(200, json={"choices": [choice]})])

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_REFUSED"


async def test_200_that_is_not_openai_shape_is_retried_then_unavailable():
    clock = Clock()
    gms, calls = client([httpx.Response(200, text="<html>proxy</html>")] * 4, clock)

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "LLM_UNAVAILABLE"
    assert len(calls) == 4
    assert clock.slept == [5.0, 10.0, 20.0]


async def test_200_proxy_page_once_then_ok_succeeds():
    gms, calls = client(
        [
            httpx.Response(200, text="<html>proxy</html>"),
            httpx.Response(200, json=OK_BODY),
        ]
    )

    out = await gms.complete("s", "u", deadline=900)

    assert out.content == '{"branches": []}'
    assert len(calls) == 2


async def test_client_error_text_is_not_logged_or_reported(caplog):
    secret = "sk-fake-secret-123"
    gms, _ = client(
        [
            httpx.Response(
                400,
                json={"error": {"code": "invalid_request", "message": f"bad {secret}"}},
            )
        ]
    )

    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=900)

    assert e.value.code == "INTERNAL"
    assert "invalid_request" in e.value.message
    assert secret not in e.value.message
    assert secret not in caplog.text


async def test_stops_retrying_when_deadline_is_near():
    clock = Clock()
    gms, calls = client([httpx.Response(502)] * 4, clock)

    # 첫 실패 뒤 5초를 기다리면 남은 시간이 한 번 부를 만큼(20초)이 안 된다
    with pytest.raises(GmsError) as e:
        await gms.complete("s", "u", deadline=24)

    assert e.value.code == "LLM_UNAVAILABLE"
    assert len(calls) == 1
    assert clock.slept == []


async def test_mock_answers_with_first_sentence_as_primary():
    out = await MockGms().complete(
        "s", "제목: t\n본문:\n[s1] 첫 문장이다.\n[s2] 둘째.", 0
    )

    data = json.loads(out.content)
    assert data["primaryCoreIndex"] == 0
    assert data["branches"][0]["items"][0] == {
        "text": "첫 문장이다.",
        "evidence": ["s1"],
    }
