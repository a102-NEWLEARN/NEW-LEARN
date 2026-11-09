"""작업 큐 소비 — 단계마다 스트림 · 그룹 하나를 읽는다(api-internal.md 3 · 4절).

틀(QueueWorker)은 단계와 무관한 일만 한다: 메시지 읽기 · 다시 가져가기 · 처리 마감 · W1 보내기 · ack.
단계마다 다른 일(메시지 → W1 봉투, 실패 봉투, 시간 초과 코드, 진단 로그)은 Stage 로 넘겨받는다.

한 워커는 한 번에 한 건씩 처리한다. 메시지 하나는 15분 안에 끝낸다 — W1 다시 보내기 몫을 남기고 처리 단계의
마감을 정하고, 그 마감에 asyncio 상한을 걸어 넘기면 끊고 단계의 시간 초과 코드로 실패를 보낸다. W1 은 요청마다
상한이 있어 몫 안에 끝난다. 처리 중 죽은 워커의 메시지는 20분 넘게 ack 가 없으면 XAUTOCLAIM 으로 가져간다.
상한보다 길게 잡아 살아 있는 워커의 메시지를 가져가 GMS 를 두 번 부르지 않게 한다(2026-10-28 BE 확인, Jira 130).
XAUTOCLAIM 은 돌려준 커서를 이어 받아 대기 목록 전체를 차례로 훑고, 끝(0-0)에 닿으면 처음부터 다시 훑는다.
"""

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.backend import RESEND_WAITS, W1_TIMEOUT_S, BackendClient, W1Outcome
from app.extract.run import ChatClient, make_envelope, now_kst, run_extract
from app.gms import GmsAuthError

log = logging.getLogger(__name__)

STREAM = "analysis.released"
GROUP = "extract"
STAGE = "EXTRACT"
CLAIM_IDLE_MS = 20 * 60 * 1000
# 한 번 읽을 때 XAUTOCLAIM 을 이어 부를 최대 횟수(한 번에 대기 목록 약 10건을 훑는다)
CLAIM_SCAN_STEPS = 10
JOB_LIMIT_S = 15 * 60
# W1 다시 보내기가 쓸 수 있는 가장 긴 시간(대기 합 + 요청마다 시간 상한)
W1_RESERVE_S = sum(RESEND_WAITS) + W1_TIMEOUT_S * (len(RESEND_WAITS) + 1)
READ_BLOCK_MS = 5000
REDIS_RETRY_MAX_S = 30.0


def _text(v: Any) -> str:
    return v.decode() if isinstance(v, bytes) else str(v)


class WorkerStatus:
    """/health 가 읽는 워커 상태. OFF(켜지 않음) · RUNNING · BLOCKED(설정 오류로 멈춤)."""

    def __init__(self, state: str = "OFF", reason: str = "") -> None:
        self.state = state
        self.reason = reason

    def block(self, reason: str) -> None:
        log.error("워커 큐 읽기를 멈춘다: %s", reason)
        self.state, self.reason = "BLOCKED", reason


class StageBlocked(Exception):
    """다시 해도 같은 설정 오류 — 큐 읽기를 멈추고 ack 하지 않는다(고친 뒤 다시 가져가기로 다시 온다)."""


Envelope = dict[str, Any]
Diag = dict[str, Any]


@dataclass(frozen=True)
class Stage:
    """단계마다 다른 것. process 는 마감(monotonic 초)을 받아 (W1 봉투, 진단)을 돌려준다."""

    name: str
    stream: str
    group: str
    process: Callable[[dict[str, Any], float], Awaitable[tuple[Envelope, Diag]]]
    # (payload, startedAt, 코드, 메시지) → 실패 봉투
    fail: Callable[[dict[str, Any], str, str, str], Envelope]
    timeout_code: str
    timeout_message: str
    # (job, attempt, 봉투, 진단, 걸린 초, W1 응답) → 로그 한 줄
    describe: Callable[[int, int, Envelope, Diag, float, Any], str]
    # 시간 초과 뒤 남은 계산이 있어 이 단계를 멈춰야 하면 그 까닭(없으면 None). 실패 W1 · ack 는 그대로 한 뒤 멈춘다
    stuck: Callable[[], str | None] | None = None


class QueueWorker:
    def __init__(
        self,
        redis: Redis,
        backend: BackendClient,
        consumer: str,
        status: WorkerStatus,
        stage: Stage,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.redis = redis
        self.backend = backend
        self.consumer = consumer
        self.status = status
        self.stage = stage
        self.clock = clock
        self.claim_cursor = "0-0"

    async def _ack(self, msg_id: str) -> None:
        await self.redis.xack(self.stage.stream, self.stage.group, msg_id)

    async def handle(self, msg_id: str, fields: dict[Any, Any]) -> None:
        """메시지 하나. ack 할지는 W1 응답으로 정한다(5절 「API 응답」)."""
        st = self.stage
        raw = fields.get(b"payload", fields.get("payload"))
        try:
            payload = json.loads(raw)
            jobs, attempt = payload["jobs"], payload["attempt"]
            if not isinstance(jobs, dict) or type(attempt) is not int:
                raise TypeError
        except TypeError, ValueError, KeyError:
            # 작업 번호를 몰라 W1 을 보낼 수 없다. ack 하지 않으면 다시 가져가기마다 끝없이 돈다(3절)
            log.error("깨진 메시지를 버린다 stream=%s id=%s", st.stream, msg_id)
            await self._ack(msg_id)
            return
        job_id = jobs.get(st.name)
        if job_id is None:
            # 다른 단계만 다시 돌리는 메시지다
            await self._ack(msg_id)
            return
        if type(job_id) is not int:
            log.error(
                "깨진 메시지를 버린다 stream=%s id=%s (jobs.%s)",
                st.stream,
                msg_id,
                st.name,
            )
            await self._ack(msg_id)
            return

        begin = self.clock()
        started = now_kst()
        # 모듈 값을 그때그때 읽는다 — 시험에서 상한을 줄여 볼 수 있게
        deadline = begin + JOB_LIMIT_S - W1_RESERVE_S
        try:
            async with asyncio.timeout(max(deadline - self.clock(), 0)):
                envelope, diag = await st.process(payload, deadline)
        except StageBlocked as e:
            self.status.block(str(e))
            return
        except TimeoutError:
            envelope = st.fail(payload, started, st.timeout_code, st.timeout_message)
            diag = {"timed_out": True}
        outcome, w1 = await self.backend.send_result(job_id, envelope)
        # ack 를 진단 로그보다 먼저 한다 — 로그가 깨져 ack 를 놓치면 재회수 때 GMS 를 또 부른다
        if outcome is W1Outcome.ACK:
            await self._ack(msg_id)
        elif outcome is W1Outcome.AUTH_FAILED:
            self.status.block(f"W1 {w1} — INTERNAL_API_KEY 확인")
        else:
            log.error(
                "W1 을 끝내 못 보냄 %s job=%s — ack 하지 않는다(다시 가져가기로 다시 온다)",
                st.name,
                job_id,
            )
        if diag.get("timed_out") and st.stuck is not None:
            reason = st.stuck()
            if reason:
                # 다음 메시지를 읽기 전에 멈춘다 — 다음 메시지가 없어도 /health 가 바로 알린다
                self.status.block(reason)
        try:
            log.info(
                st.describe(job_id, attempt, envelope, diag, self.clock() - begin, w1)
            )
        except Exception:
            log.exception("%s 진단 로그 실패 job=%s", st.name, job_id)

    async def next_message(self) -> tuple[str, dict[Any, Any]] | None:
        st = self.stage
        # 죽은 워커가 남긴 메시지를 먼저 가져간다. 커서를 이어 받아 대기 목록 뒤쪽까지 훑는다
        for _ in range(CLAIM_SCAN_STEPS):
            nxt, claimed, *_ = await self.redis.xautoclaim(
                st.stream,
                st.group,
                self.consumer,
                CLAIM_IDLE_MS,
                start_id=self.claim_cursor,
                count=1,
            )
            self.claim_cursor = _text(nxt)
            if claimed:
                return claimed[0]
            if self.claim_cursor == "0-0":
                break
        res = await self.redis.xreadgroup(
            st.group, self.consumer, {st.stream: ">"}, count=1, block=READ_BLOCK_MS
        )
        if not res:
            return None
        _, entries = res[0]
        return entries[0] if entries else None

    async def run(self, stop: asyncio.Event) -> None:
        name = self.stage.name
        self.status.state = "RUNNING"
        log.info("%s 워커 시작 consumer=%s", name, self.consumer)
        backoff = 1.0
        while not stop.is_set() and self.status.state == "RUNNING":
            try:
                msg = await self.next_message()
            except (RedisError, OSError) as e:
                log.warning(
                    "%s Redis 읽기 실패(%s) — %.0f초 뒤 다시",
                    name,
                    type(e).__name__,
                    backoff,
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
            msg_id = _text(msg_id)
            if stop.is_set():
                # 블록 읽기 중에 종료 신호가 왔다. 새로 처리하지 않고 ack 없이 둔다 — 다시 가져가기로 다시 온다
                log.info("%s 종료 중이라 처리하지 않고 둔다 id=%s", name, msg_id)
                break
            try:
                await self.handle(msg_id, fields or {})
            except (RedisError, OSError) as e:
                # ack 를 못 했으면 다시 가져가기로 다시 온다(늦은 W1 은 409)
                log.warning(
                    "%s 메시지 처리 중 Redis 오류 id=%s (%s)",
                    name,
                    msg_id,
                    type(e).__name__,
                )
            except Exception:
                log.exception(
                    "%s 메시지 처리 중 예상 밖 오류 id=%s — ack 하지 않는다",
                    name,
                    msg_id,
                )
        log.info("%s 워커 멈춤 (%s)", name, self.status.state)


# --- EXTRACT ------------------------------------------------------------------------


def extract_stage(llm: ChatClient, model: str) -> Stage:
    async def process(
        payload: dict[str, Any], deadline: float
    ) -> tuple[Envelope, Diag]:
        try:
            return await run_extract(payload, llm, model, deadline)
        except GmsAuthError as e:
            raise StageBlocked(f"{e} — GMS_API_KEY 확인") from e

    def fail(
        payload: dict[str, Any], started: str, code: str, message: str
    ) -> Envelope:
        return make_envelope(payload, model, started, None, code, message)

    def describe(job_id, attempt, envelope, diag, seconds, w1) -> str:
        error = envelope["error"] or {}
        tokens = [
            (u.get("prompt_tokens"), u.get("completion_tokens"))
            for u in diag.get("usage", [])
        ]
        code = f"({error['code']})" if error else ""
        return (
            f"EXTRACT job={job_id} attempt={attempt} {envelope['status']}{code}"
            f" calls={diag.get('calls', '?')} tokens={tokens}"
            f" warnings={len(diag.get('warnings', []))} {seconds:.1f}초 W1={w1}"
        )

    return Stage(
        name=STAGE,
        stream=STREAM,
        group=GROUP,
        process=process,
        fail=fail,
        timeout_code="LLM_TIMEOUT",
        timeout_message="처리 시간 상한(15분) 안에 분석을 끝내지 못함",
        describe=describe,
    )


class Worker(QueueWorker):
    """EXTRACT 워커 — analysis.released 의 그룹 extract."""

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
        super().__init__(
            redis, backend, consumer, status, extract_stage(llm, model), clock
        )
        self.llm = llm
        self.model = model
