import asyncio
import contextlib
import logging
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Request, Response
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.backend import BackendClient
from app.config import Settings, load_settings
from app.embed.model import MockEncoder, SentenceEncoder
from app.embed.run import EmbedRunner, Encoder, embed_stage
from app.extract.run import ChatClient
from app.gms import GmsClient, MockGms
from app.worker import READ_BLOCK_MS, QueueWorker, Worker, WorkerStatus

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger(__name__)

settings = load_settings()

# 종료 신호(SIGTERM) 뒤 처리 중인 메시지를 기다리는 시간 — 워커 둘이 함께 쓴다. 못 끝내면 ack 없이 취소한다 —
# 다시 가져가기로 다시 온다. k8s grace 30초에서 preStop 10초와 정리 몫을 빼고 남는 만큼(ai.yaml)
SHUTDOWN_WAIT_S = 15.0
# 모델 읽기 실패로 볼 오류 — 폴더 없음(OSError) · 패키지 없음(ImportError) · 형식 · 메모리 · torch(RuntimeError)
LOAD_ERRORS = (OSError, ImportError, RuntimeError, ValueError, TypeError, MemoryError)
# 모델 읽기 상한. 2GB 남짓을 디스크에서 읽어 보통 수십 초 — 넘으면 EMBED 만 멈춘다(준비 중 멈춤을 헬스로 알리려는 것)
PREPARE_LIMIT_S = 300.0


def worker_plan(s: Settings) -> tuple[ChatClient | None, str, WorkerStatus]:
    """(LLM, 봉투 model, 상태). LLM 이 None 이면 워커를 띄우지 않는다."""
    if s.llm_mode == "mock":
        if not s.worker_allow_mock:
            return (
                None,
                "",
                WorkerStatus(
                    "OFF", "LLM_MODE=mock — WORKER_ALLOW_MOCK=true 일 때만 큐를 읽는다"
                ),
            )
        llm: ChatClient | None = MockGms()
        model = "mock"
    elif s.llm_mode == "gms":
        if not s.gms_api_key or not s.gms_base_url:
            return None, "", WorkerStatus("BLOCKED", "GMS_API_KEY · GMS_BASE_URL 없음")
        llm, model = None, s.gms_model  # http 클라이언트가 생긴 뒤 만든다
    else:
        return None, "", WorkerStatus("BLOCKED", f"모르는 LLM_MODE {s.llm_mode!r}")
    if not s.backend_url or not s.internal_api_key:
        return None, "", WorkerStatus("BLOCKED", "BACKEND_URL · INTERNAL_API_KEY 없음")
    return llm, model, WorkerStatus("RUNNING")


def embed_plan(s: Settings) -> tuple[Encoder | None, WorkerStatus]:
    """(인코더, 상태). 인코더가 None 이면 EMBED 워커를 띄우지 않는다. EXTRACT 와 따로 정한다 — GMS 와 무관하다."""
    if not s.embed_worker_enabled:
        return None, WorkerStatus("OFF", "EMBED_WORKER_ENABLED=false")
    if s.llm_mode == "mock":
        if not s.worker_allow_mock:
            return None, WorkerStatus(
                "OFF", "LLM_MODE=mock — WORKER_ALLOW_MOCK=true 일 때만 큐를 읽는다"
            )
        encoder: Encoder = MockEncoder()
    elif s.llm_mode == "gms":
        encoder = SentenceEncoder(s.embed_model_path, s.embed_torch_threads)
    else:
        return None, WorkerStatus("BLOCKED", f"모르는 LLM_MODE {s.llm_mode!r}")
    if not s.backend_url or not s.internal_api_key:
        return None, WorkerStatus("BLOCKED", "BACKEND_URL · INTERNAL_API_KEY 없음")
    return encoder, WorkerStatus("RUNNING")


async def run_embed(
    runner: EmbedRunner, worker: QueueWorker, stop: asyncio.Event
) -> None:
    """모델을 먼저 읽고 큐를 읽는다. 읽기 실패 · 상한 초과는 EMBED 만 멈춘다(고친 뒤 Pod 재시작). EXTRACT 는 계속 돈다."""
    worker.status.state = "STARTING"
    try:
        await asyncio.wait_for(runner.prepare(), PREPARE_LIMIT_S)
    except TimeoutError:
        worker.status.block(
            f"임베딩 모델 읽기가 {PREPARE_LIMIT_S:.0f}초 안에 끝나지 않음"
        )
        return
    except LOAD_ERRORS as e:
        worker.status.block(f"임베딩 모델을 읽지 못함({type(e).__name__}: {e})"[:300])
        return
    await worker.run(stop)


def watch(task: asyncio.Task, status: WorkerStatus, stop: asyncio.Event) -> None:
    """작업이 종료 신호 없이 끝나면(예상 밖 예외 포함) 상태를 BLOCKED 로 — /health 가 503 으로 알린다."""

    def done(t: asyncio.Task) -> None:
        if stop.is_set() or status.state not in ("RUNNING", "STARTING"):
            return
        err = None if t.cancelled() else t.exception()
        status.block(
            f"워커 작업이 예상 밖으로 끝남({type(err).__name__ if err else '정상 종료'})"
        )

    task.add_done_callback(done)


async def stop_all(
    tasks: list[asyncio.Task], stop: asyncio.Event, budget: float
) -> None:
    """모두에 먼저 종료 신호를 보내고 예산 하나로 함께 기다린다. 넘으면 남은 것을 취소하고, 취소 정리도 같은 예산 안에서만
    기다린다(최소 0.5초). 스레드 안 인코딩 계산은 취소로 멈추지 않는다 — 그건 k8s 의 강제 종료(grace 30초)가 끝낸다."""
    stop.set()
    if not tasks:
        return
    loop = asyncio.get_running_loop()
    deadline = loop.time() + budget
    _, pending = await asyncio.wait(tasks, timeout=budget)
    for t in pending:
        t.cancel()
    if pending:
        await asyncio.wait(pending, timeout=max(deadline - loop.time(), 0.5))


def queue_client() -> Redis:
    # 블록 읽기가 소켓 시간 초과에 잘리지 않게 헬스와 다른 연결을 쓴다. 워커마다 따로(블록 읽기가 서로 막지 않게)
    return Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=2,
        socket_timeout=READ_BLOCK_MS / 1000 + 10,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.redis = Redis.from_url(
        settings.redis_url, socket_connect_timeout=2, socket_timeout=2
    )
    llm, model, status = worker_plan(settings)
    encoder, embed_status = embed_plan(settings)
    app.state.worker_status = status
    app.state.embed_status = embed_status
    stop = asyncio.Event()
    tasks: list[asyncio.Task] = []
    closers: list[Callable[[], Awaitable[None]]] = []
    runner: EmbedRunner | None = None
    consumer = socket.gethostname()
    http = None
    if status.state == "RUNNING" or embed_status.state == "RUNNING":
        http = httpx.AsyncClient()
        backend = BackendClient(http, settings.backend_url, settings.internal_api_key)
    if status.state == "RUNNING":
        if llm is None:
            llm = GmsClient(http, settings.gms_base_url, settings.gms_api_key, model)
        queue = queue_client()
        closers.append(queue.aclose)
        worker = Worker(queue, llm, model, backend, consumer=consumer, status=status)
        tasks.append(asyncio.create_task(worker.run(stop)))
    elif status.state == "BLOCKED":
        log.error("EXTRACT 워커를 띄우지 않는다: %s", status.reason)
    if embed_status.state == "RUNNING" and encoder is not None:
        runner = EmbedRunner(encoder)
        queue = queue_client()
        closers.append(queue.aclose)
        embed = QueueWorker(queue, backend, consumer, embed_status, embed_stage(runner))
        task = asyncio.create_task(run_embed(runner, embed, stop))
        watch(task, embed_status, stop)
        tasks.append(task)
    elif embed_status.state == "BLOCKED":
        log.error("EMBED 워커를 띄우지 않는다: %s", embed_status.reason)
    try:
        yield
    finally:
        # 한 단계가 실패해도 뒤 정리는 한다
        with contextlib.suppress(Exception):
            await stop_all(tasks, stop, SHUTDOWN_WAIT_S)
        if runner is not None:
            runner.close()
        for close in [*closers, *([http.aclose] if http is not None else [])]:
            with contextlib.suppress(Exception):
                await close()
        await app.state.redis.aclose()


app = FastAPI(title="NEW:LEARN AI 분석 워커", lifespan=lifespan)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_worker_status(request: Request) -> WorkerStatus:
    return getattr(request.app.state, "worker_status", None) or WorkerStatus()


def get_embed_status(request: Request) -> WorkerStatus:
    return getattr(request.app.state, "embed_status", None) or WorkerStatus()


# 워커는 작업 큐(Redis)가 없으면 일을 못 한다 — Redis 연결을 헬스에 넣는다.
# 설정 오류(키 없음 · W1 401 · 403 · GMS 401 · 403)로 큐 읽기를 멈췄으면 503 이다.
# 켜진 EMBED 가 멈춰도(모델 읽기 실패 · 남은 계산 · 예상 밖 종료) 503 — readiness 가 내려가 경보로 보인다.
# liveness 는 TCP 라 Pod 를 다시 띄우지 않아 EXTRACT 는 계속 돈다. 꺼진(OFF) EMBED 는 상태 코드에 넣지 않는다
@app.get("/health")
async def health(
    response: Response,
    redis: Annotated[Redis, Depends(get_redis)],
    worker: Annotated[WorkerStatus, Depends(get_worker_status)],
    embed: Annotated[WorkerStatus, Depends(get_embed_status)],
) -> dict[str, str]:
    body = {
        "llm_mode": settings.llm_mode,
        "worker": worker.state,
        "embed_worker": embed.state,
    }
    if worker.reason:
        body["worker_reason"] = worker.reason
    if embed.reason:
        body["embed_worker_reason"] = embed.reason
    try:
        await redis.ping()
    except RedisError, OSError:
        response.status_code = 503
        return {"status": "DOWN", "redis": "DOWN", **body}
    if worker.state == "BLOCKED" or embed.state == "BLOCKED":
        response.status_code = 503
        return {"status": "DOWN", "redis": "UP", **body}
    return {"status": "UP", "redis": "UP", **body}
