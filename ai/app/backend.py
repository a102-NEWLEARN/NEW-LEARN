"""W1 결과 전달 — POST /internal/v1/analysis-jobs/{jobId}/result (api-internal.md 5절 「API 응답」).

5xx · 연결 실패는 GMS 를 다시 부르지 않고 같은 결과를 2 · 4 · 8 · 16 · 32초 뒤 5번 더 보낸다(api.md 4절 AI 9번).
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from enum import Enum
from typing import Any

import httpx

log = logging.getLogger(__name__)

RESEND_WAITS = (2.0, 4.0, 8.0, 16.0, 32.0)
W1_TIMEOUT_S = 10.0


class W1Outcome(Enum):
    # 204 저장 · 400 · 404 · 409 — 다시 보내도 같아서 메시지를 끝낸다
    ACK = "ACK"
    # 401 · 403 — 출입증 설정 오류. ack 하지 않고 큐 읽기를 멈춘다
    AUTH_FAILED = "AUTH_FAILED"
    # 다시 보내도 5xx · 연결 실패. ack 하지 않는다 — 다시 가져가기로 다시 온다
    UNREACHABLE = "UNREACHABLE"


class BackendClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        backend_url: str,
        internal_api_key: str,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.http = http
        self.backend_url = backend_url
        self.key = internal_api_key
        self.sleep = sleep

    async def send_result(
        self, job_id: int, envelope: dict[str, Any]
    ) -> tuple[W1Outcome, int | None]:
        url = f"{self.backend_url}/internal/v1/analysis-jobs/{job_id}/result"
        status: int | None = None
        for wait in (0.0, *RESEND_WAITS):
            if wait:
                await self.sleep(wait)
            try:
                res = await self.http.post(
                    url,
                    json=envelope,
                    headers={"X-Internal-Key": self.key},
                    timeout=W1_TIMEOUT_S,
                )
            except httpx.TransportError as e:
                status = None
                log.warning("W1 연결 실패 job=%s (%s)", job_id, type(e).__name__)
                continue
            status = res.status_code
            if status in (401, 403):
                return W1Outcome.AUTH_FAILED, status
            if status >= 500:
                log.warning("W1 %s job=%s", status, job_id)
                continue
            if status != 204:
                # 400 은 API 가 그 시도를 RESULT_SCHEMA_INVALID 로 적는다. 본문의 code 만 남긴다
                log.error("W1 %s job=%s %s", status, job_id, res.text[:200])
            return W1Outcome.ACK, status
        return W1Outcome.UNREACHABLE, status
