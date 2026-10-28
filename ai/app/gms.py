"""SSAFY GMS 호출과 실패 분류(api.md 2절 작업 실패 코드).

GMS 는 OpenAI 호환 chat/completions 를 그대로 받는다(AI 실험, 2026-10-23). 재시도 횟수 · 간격을 이 파일이
정해야 해서 SDK 의 내장 재시도를 거치지 않고 httpx 로 직접 부른다. 다시 부를 일:
- 시간 초과(한 번 180초) → 한 번 더, 안 되면 LLM_TIMEOUT
- 연결 실패 · 5xx → 5 · 10 · 20초 뒤 3번 더, 안 되면 LLM_UNAVAILABLE (실험에서 3번 안에 이어졌다)
- 429 → Retry-After(없으면 30초)를 따라 2번 더, 안 되면 LLM_RATE_LIMITED
다시 불러도 같은 일:
- 입력 길이 초과 400 → LLM_INPUT_TOO_LONG / 거절 · 내용 필터 → LLM_REFUSED
- 그 밖의 400 · 4xx → INTERNAL (요청을 잘못 만든 것이라 설정 · 코드를 고쳐야 한다)
- 401 · 403 → GmsAuthError. 키가 틀린 것이라 워커가 큐 읽기를 멈춘다
"""

import asyncio
import json
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

log = logging.getLogger(__name__)

CALL_TIMEOUT_S = 180.0
UNAVAILABLE_WAITS = (5.0, 10.0, 20.0)
TIMEOUT_RETRIES = 1
RATE_LIMIT_RETRIES = 2
RATE_LIMIT_DEFAULT_WAIT = 30.0
RATE_LIMIT_MAX_WAIT = 120.0
# 남은 시간이 이보다 짧으면 새로 부르지 않는다 — 부르다 잘리면 GMS 비용만 든다
MIN_CALL_S = 20.0

_TOO_LONG = re.compile(
    r"context[_ ]length|maximum context|too many tokens", re.IGNORECASE
)
_FILTERED = re.compile(r"content[_ ]?filter|content[_ ]policy", re.IGNORECASE)


class GmsError(Exception):
    """작업을 실패로 끝낼 GMS 오류. code 는 W1 error.code 그대로다."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class GmsAuthError(Exception):
    """GMS 키가 없거나 틀렸다(401 · 403). 작업 실패가 아니라 설정 오류다."""


@dataclass
class Completion:
    content: str
    finish_reason: str | None
    usage: dict[str, Any] = field(default_factory=dict)


class GmsClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        base_url: str,
        api_key: str,
        model: str,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.http = http
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.api_key = api_key
        self.model = model
        self.sleep = sleep
        self.clock = clock

    async def complete(self, system: str, user: str, deadline: float) -> Completion:
        """deadline(clock 기준)까지 다시 부르기를 포함해 한 번의 답을 받는다."""
        body = {
            "model": self.model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        tries = {"timeout": 0, "unavailable": 0, "rate": 0}
        last = GmsError("LLM_TIMEOUT", "처리 시간 상한 안에 GMS 를 부르지 못함")
        while True:
            remaining = deadline - self.clock()
            if remaining < MIN_CALL_S:
                raise last
            wait = 0.0
            try:
                res = await self.http.post(
                    self.url,
                    json=body,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=min(CALL_TIMEOUT_S, remaining),
                )
            except httpx.TimeoutException:
                last = GmsError("LLM_TIMEOUT", "GMS 응답 시간 초과")
                if tries["timeout"] >= TIMEOUT_RETRIES:
                    raise last from None
                tries["timeout"] += 1
            except httpx.TransportError as e:
                last = GmsError("LLM_UNAVAILABLE", f"GMS 연결 실패({type(e).__name__})")
                if tries["unavailable"] >= len(UNAVAILABLE_WAITS):
                    raise last from None
                wait = UNAVAILABLE_WAITS[tries["unavailable"]]
                tries["unavailable"] += 1
            else:
                status = res.status_code
                if status == 200:
                    return _parse_ok(res)
                if status in (401, 403):
                    raise GmsAuthError(f"GMS {status}")
                if status == 429:
                    last = GmsError("LLM_RATE_LIMITED", "GMS 호출 한도 초과(429)")
                    if tries["rate"] >= RATE_LIMIT_RETRIES:
                        raise last
                    wait = _retry_after(res)
                    tries["rate"] += 1
                elif status >= 500:
                    last = GmsError("LLM_UNAVAILABLE", f"GMS {status}")
                    if tries["unavailable"] >= len(UNAVAILABLE_WAITS):
                        raise last
                    wait = UNAVAILABLE_WAITS[tries["unavailable"]]
                    tries["unavailable"] += 1
                else:
                    raise _client_error(res)
            log.info("GMS 다시 부름: %s, %.0f초 뒤", last.message, wait)
            if self.clock() + wait + MIN_CALL_S > deadline:
                raise last
            if wait:
                await self.sleep(wait)


def _retry_after(res: httpx.Response) -> float:
    try:
        sec = float(res.headers.get("Retry-After", ""))
    except ValueError:
        return RATE_LIMIT_DEFAULT_WAIT
    return min(max(sec, 1.0), RATE_LIMIT_MAX_WAIT)


def _error_text(res: httpx.Response) -> str:
    try:
        err = res.json().get("error") or {}
    except ValueError, AttributeError:
        return res.text[:200]
    if not isinstance(err, dict):
        return str(err)[:200]
    return " ".join(str(err.get(k) or "") for k in ("code", "type", "message"))[:200]


def _client_error(res: httpx.Response) -> GmsError:
    text = _error_text(res)
    if res.status_code in (400, 413) and _TOO_LONG.search(text):
        return GmsError("LLM_INPUT_TOO_LONG", f"GMS {res.status_code}: 입력 길이 초과")
    if res.status_code == 400 and _FILTERED.search(text):
        return GmsError("LLM_REFUSED", f"GMS {res.status_code}: 내용 필터")
    # 모델 이름 · 요청 모양이 틀린 것이다. 다시 불러도 같아서 INTERNAL 로 끝내고 경고를 남긴다
    log.warning("GMS %s — 설정 · 요청을 확인할 것: %s", res.status_code, text)
    return GmsError("INTERNAL", f"GMS {res.status_code}: {text[:100]}")


def _parse_ok(res: httpx.Response) -> Completion:
    try:
        data = res.json()
        choice = data["choices"][0]
        message = choice.get("message") or {}
    except ValueError, KeyError, IndexError, TypeError, AttributeError:
        # 200 인데 OpenAI 모양이 아니면 중간 프록시의 오류 화면일 때가 많다
        raise GmsError("LLM_UNAVAILABLE", "GMS 200 응답을 읽지 못함") from None
    finish = choice.get("finish_reason")
    if finish == "content_filter" or message.get("refusal"):
        raise GmsError("LLM_REFUSED", "모델이 답을 거절함")
    return Completion(
        content=message.get("content") or "",
        finish_reason=finish,
        usage=data.get("usage") or {},
    )


class MockGms:
    """LLM_MODE=mock — GMS 를 부르지 않고 모양이 맞는 마인드맵을 돌려준다. 첫 문장을 대표 잎으로 쓴다."""

    _FIRST = re.compile(r"^\[(s\d+)\] (.+)$", re.MULTILINE)

    async def complete(self, system: str, user: str, deadline: float) -> Completion:
        m = self._FIRST.search(user)
        sid, text = (m.group(1), m.group(2)[:60]) if m else ("s1", "모의 대표 사건")
        out = {
            "summary": f"모의 요약: {text}",
            "branches": [
                {"type": "CORE", "items": [{"text": text, "evidence": [sid]}]}
            ],
            "primaryCoreIndex": 0,
            "eventTimeText": None,
        }
        return Completion(json.dumps(out, ensure_ascii=False), "stop", {})
