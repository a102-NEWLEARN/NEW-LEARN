"""SSAFY GMS 호출과 실패 분류(api.md 2절 작업 실패 코드).

GMS 는 OpenAI 호환 chat/completions 를 그대로 받는다(AI 실험, 2026-10-23). 재시도 횟수 · 간격을 이 파일이
정해야 해서 SDK 의 내장 재시도를 거치지 않고 httpx 로 직접 부른다. httpx timeout 은 조각 사이 간격이라
요청 한 번 전체에 asyncio 상한(180초)을 따로 건다. 다시 부를 일:
- 시간 초과 → 5초 뒤 한 번 더, 안 되면 LLM_TIMEOUT
- 연결 실패 · 5xx · 200 인데 OpenAI 모양이 아닌 응답(프록시 오류 화면) → 5 · 10 · 20초 뒤 3번 더,
  안 되면 LLM_UNAVAILABLE (실험에서 3번 안에 이어졌다)
- 429 → Retry-After(초 · HTTP 날짜, 없으면 30초)만큼 기다려 2번 더, 안 되면 LLM_RATE_LIMITED.
  기다릴 시간이 마감 안에 들지 않으면 줄여서 부르지 않고 바로 LLM_RATE_LIMITED(api.md 2절 「대기 시간을 알려 주면 따른다」)
다시 불러도 같은 일:
- 입력 길이 초과 400 → LLM_INPUT_TOO_LONG / 거절 · 내용 필터 → LLM_REFUSED
- 그 밖의 400 · 4xx → INTERNAL (요청을 잘못 만든 것이라 설정 · 코드를 고쳐야 한다)
- 401 · 403 → GmsAuthError. 키가 틀린 것이라 워커가 큐 읽기를 멈춘다
"""

import asyncio
import json
import logging
import math
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

log = logging.getLogger(__name__)

CALL_TIMEOUT_S = 180.0
UNAVAILABLE_WAITS = (5.0, 10.0, 20.0)
TIMEOUT_RETRIES = 1
TIMEOUT_WAIT = 5.0
RATE_LIMIT_RETRIES = 2
RATE_LIMIT_DEFAULT_WAIT = 30.0
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
            limit = min(CALL_TIMEOUT_S, remaining)
            wait = 0.0
            unavailable = ""
            try:
                async with asyncio.timeout(limit):
                    res = await self.http.post(
                        self.url,
                        json=body,
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        timeout=limit,
                    )
            except httpx.TimeoutException, TimeoutError:
                last = GmsError("LLM_TIMEOUT", "GMS 응답 시간 초과")
                if tries["timeout"] >= TIMEOUT_RETRIES:
                    raise last from None
                wait = TIMEOUT_WAIT
                tries["timeout"] += 1
            except httpx.TransportError as e:
                unavailable = f"GMS 연결 실패({type(e).__name__})"
            else:
                status = res.status_code
                if status == 200:
                    done = _parse_ok(res)
                    if done is not None:
                        return done
                    # 200 인데 OpenAI 모양이 아니면 중간 프록시의 오류 화면일 때가 많다
                    unavailable = "GMS 200 응답을 읽지 못함"
                elif status in (401, 403):
                    raise GmsAuthError(f"GMS {status}")
                elif status == 429:
                    last = GmsError("LLM_RATE_LIMITED", "GMS 호출 한도 초과(429)")
                    if tries["rate"] >= RATE_LIMIT_RETRIES:
                        raise last
                    wait = _retry_after(res)
                    tries["rate"] += 1
                elif status >= 500:
                    unavailable = f"GMS {status}"
                else:
                    raise _client_error(res)
            if unavailable:
                last = GmsError("LLM_UNAVAILABLE", unavailable)
                if tries["unavailable"] >= len(UNAVAILABLE_WAITS):
                    raise last
                wait = UNAVAILABLE_WAITS[tries["unavailable"]]
                tries["unavailable"] += 1
            log.info("GMS 다시 부름: %s, %.0f초 뒤", last.message, wait)
            if self.clock() + wait + MIN_CALL_S > deadline:
                raise last
            if wait:
                await self.sleep(wait)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _retry_after(res: httpx.Response) -> float:
    """Retry-After 는 초 또는 HTTP 날짜다. 줄이지 않는다 — 마감 안에 못 기다리면 부르는 쪽이 그만둔다.
    NaN · 무한대 · 읽을 수 없는 값은 30초, 지난 날짜 · 음수는 1초."""
    raw = res.headers.get("Retry-After", "").strip()
    try:
        sec = float(raw)
    except ValueError:
        try:
            when = parsedate_to_datetime(raw)
        except TypeError, ValueError:
            return RATE_LIMIT_DEFAULT_WAIT
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        sec = (when - _utcnow()).total_seconds()
    if not math.isfinite(sec):
        return RATE_LIMIT_DEFAULT_WAIT
    return max(sec, 1.0)


_SAFE_CODE = re.compile(r"[^\w.-]")


def _error_fields(res: httpx.Response) -> tuple[str, str]:
    """(분류용 전체 글, 로그 · W1 에 남길 코드). 오류 본문에는 요청 내용이 섞일 수 있어 code · type 만 남긴다."""
    try:
        err = res.json().get("error") or {}
    except ValueError, AttributeError:
        return res.text, ""
    if not isinstance(err, dict):
        return str(err), ""
    full = " ".join(str(err.get(k) or "") for k in ("code", "type", "message"))
    code = " ".join(
        _SAFE_CODE.sub("", str(err.get(k) or ""))[:40] for k in ("code", "type")
    ).strip()
    return full, code


def _client_error(res: httpx.Response) -> GmsError:
    full, code = _error_fields(res)
    if res.status_code in (400, 413) and _TOO_LONG.search(full):
        return GmsError("LLM_INPUT_TOO_LONG", f"GMS {res.status_code}: 입력 길이 초과")
    if res.status_code == 400 and _FILTERED.search(full):
        return GmsError("LLM_REFUSED", f"GMS {res.status_code}: 내용 필터")
    # 모델 이름 · 요청 모양이 틀린 것이다. 다시 불러도 같아서 INTERNAL 로 끝내고 경고를 남긴다
    log.warning("GMS %s — 설정 · 요청을 확인할 것: %s", res.status_code, code)
    return GmsError("INTERNAL", f"GMS {res.status_code}: {code}".strip())


def _parse_ok(res: httpx.Response) -> Completion | None:
    """OpenAI 모양이 아니면 None — 부르는 쪽이 LLM_UNAVAILABLE 로 다시 부른다.
    usage 는 로그용이라 모양이 틀리면 버린다."""
    try:
        data = res.json()
        choice = data["choices"][0]
    except ValueError, KeyError, IndexError, TypeError:
        return None
    if not isinstance(choice, dict):
        return None
    message = choice.get("message") or {}
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(message, dict) or not isinstance(content, str | None):
        return None
    finish = choice.get("finish_reason")
    if finish == "content_filter" or message.get("refusal"):
        raise GmsError("LLM_REFUSED", "모델이 답을 거절함")
    usage = data.get("usage")
    return Completion(
        content=content or "",
        finish_reason=finish if isinstance(finish, str) else None,
        usage=usage if isinstance(usage, dict) else {},
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
