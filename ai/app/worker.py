"""EXTRACT 작업 큐 소비 — analysis.released 의 그룹 extract (api-internal.md 3 · 4절).

한 번에 한 건씩 처리한다. 메시지 하나는 15분 안에 끝낸다 — W1 다시 보내기 몫을 남기고 GMS 단계의 마감을 정한다.
처리 중 죽은 워커의 메시지는 20분 넘게 ack 가 없으면 XAUTOCLAIM 으로 가져간다. 상한보다 길게 잡아 살아 있는
워커의 메시지를 가져가 GMS 를 두 번 부르지 않게 한다(2026-10-28 BE 확인, Jira 130).
"""

import asyncio
import json
import logging
import time
from collections.abc import Callable
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.backend import RESEND_WAITS, W1_TIMEOUT_S, BackendClient, W1Outcome
from app.extract.run import ChatClient, run_extract
from app.gms import GmsAuthError

log = logging.getLogger(__name__)

STREAM = "analysis.released"
GROUP = "extract"
STAGE = "EXTRACT"
CLAIM_IDLE_MS = 20 * 60 * 1000
JOB_LIMIT_S = 15 * 60
# W1 다시 보내기가 쓸 수 있는 가장 긴 시간(대기 합 + 요청마다 시간 초과)
W1_RESERVE_S = sum(RESEND_WAITS) + W1_TIMEOUT_S * (len(RESEND_WAITS) + 1)
READ_BLOCK_MS = 5000
REDIS_RETRY_MAX_S = 30.0


class WorkerStatus:
    """/health 가 읽는 워커 상태. OFF(켜지 않음) · RUNNING · BLOCKED(설정 오류로 멈춤)."""

    def __init__(self, state: str = "OFF", reason: str = "") -> None:
        self.state = state
        self.reason = reason

    def block(self, reason: str) -> None:
        log.error("워커 큐 읽기를 멈춘다: %s", reason)
        self.state, self.reason = "BLOCKED", reason


class Worker:
    def __init__(
        self,
        redis: Redis,
        llm: ChatClient,
        model: str,
        backend: BackendClient,
        consumer: str,
        status: WorkerStatus,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.redis = redis
        self.llm = llm
        self.model = model
        self.backend = backend
        self.consumer = consumer
        self.status = status
        self.clock = clock

    async def handle(self, msg_id: str, fields: dict[Any, Any]) -> None:
        """메시지 하나. ack 할지는 W1 응답으로 정한다(5절 「API 응답」)."""
        raw = fields.get(b"payload", fields.get("payload"))
        try:
            payload = json.loads(raw)
            jobs, attempt = payload["jobs"], payload["attempt"]
            if not isinstance(jobs, dict) or type(attempt) is not int:
                raise TypeError
        except TypeError, ValueError, KeyError:
            # 작업 번호를 몰라 W1 을 보낼 수 없다. ack 하지 않으면 다시 가져가기마다 끝없이 돈다(3절)
            log.error("깨진 메시지를 버린다 stream=%s id=%s", STREAM, msg_id)
            await self.redis.xack(STREAM, GROUP, msg_id)
            return
        job_id = jobs.get(STAGE)
        if job_id is None:
            # 다른 단계만 다시 돌리는 메시지다
            await self.redis.xack(STREAM, GROUP, msg_id)
            return
        if type(job_id) is not int:
            log.error(
                "깨진 메시지를 버린다 stream=%s id=%s (jobs.EXTRACT)", STREAM, msg_id
            )
            await self.redis.xack(STREAM, GROUP, msg_id)
            return

        begin = self.clock()
        deadline = begin + JOB_LIMIT_S - W1_RESERVE_S
        try:
            envelope, diag = await run_extract(payload, self.llm, self.model, deadline)
        except GmsAuthError as e:
            self.status.block(f"{e} — GMS_API_KEY 확인")
            return
        outcome, w1 = await self.backend.send_result(job_id, envelope)
        error = envelope["error"] or {}
        tokens = [
            (u.get("prompt_tokens"), u.get("completion_tokens")) for u in diag["usage"]
        ]
        log.info(
            "EXTRACT job=%s attempt=%s %s%s calls=%s tokens=%s warnings=%s %.1f초 W1=%s",
            job_id,
            attempt,
            envelope["status"],
            f"({error['code']})" if error else "",
            diag["calls"],
            tokens,
            len(diag.get("warnings", [])),
            self.clock() - begin,
            w1,
        )
        if outcome is W1Outcome.ACK:
            await self.redis.xack(STREAM, GROUP, msg_id)
        elif outcome is W1Outcome.AUTH_FAILED:
            self.status.block(f"W1 {w1} — INTERNAL_API_KEY 확인")
        else:
            log.error(
                "W1 을 끝내 못 보냄 job=%s — ack 하지 않는다(다시 가져가기로 다시 온다)",
                job_id,
            )

    async def next_message(self) -> tuple[str, dict[Any, Any]] | None:
        # 죽은 워커가 남긴 메시지를 먼저 가져간다
        _, claimed, *_ = await self.redis.xautoclaim(
            STREAM, GROUP, self.consumer, CLAIM_IDLE_MS, start_id="0-0", count=1
        )
        if claimed:
            return claimed[0]
        res = await self.redis.xreadgroup(
            GROUP, self.consumer, {STREAM: ">"}, count=1, block=READ_BLOCK_MS
        )
        if not res:
            return None
        _, entries = res[0]
        return entries[0] if entries else None

    async def run(self, stop: asyncio.Event) -> None:
        self.status.state = "RUNNING"
        log.info("EXTRACT 워커 시작 consumer=%s", self.consumer)
        backoff = 1.0
        while not stop.is_set() and self.status.state == "RUNNING":
            try:
                msg = await self.next_message()
            except (RedisError, OSError) as e:
                log.warning(
                    "Redis 읽기 실패(%s) — %.0f초 뒤 다시", type(e).__name__, backoff
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, REDIS_RETRY_MAX_S)
                continue
            backoff = 1.0
            if msg is None:
                # 블록 읽기가 기다리지 않고 바로 비어 오는 경우(테스트용 Redis 등)에도 종료 신호를 받게 차례를 넘긴다
                await asyncio.sleep(0.1)
                continue
            msg_id, fields = msg
            if isinstance(msg_id, bytes):
                msg_id = msg_id.decode()
            try:
                await self.handle(msg_id, fields or {})
            except (RedisError, OSError) as e:
                # ack 를 못 했으면 다시 가져가기로 다시 온다(늦은 W1 은 409)
                log.warning(
                    "메시지 처리 중 Redis 오류 id=%s (%s)", msg_id, type(e).__name__
                )
            except Exception:
                log.exception(
                    "메시지 처리 중 예상 밖 오류 id=%s — ack 하지 않는다", msg_id
                )
        log.info("EXTRACT 워커 멈춤 (%s)", self.status.state)
