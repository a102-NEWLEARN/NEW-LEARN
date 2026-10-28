import asyncio
import contextlib
import logging
import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Request, Response
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.backend import BackendClient
from app.config import Settings, load_settings
from app.extract.run import ChatClient
from app.gms import GmsClient, MockGms
from app.worker import READ_BLOCK_MS, Worker, WorkerStatus

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)

settings = load_settings()

# 종료 신호(SIGTERM) 뒤 처리 중인 메시지를 기다리는 시간. 못 끝내면 ack 없이 취소한다 — 다시 가져가기로 다시 온다
SHUTDOWN_WAIT_S = 20.0


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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.redis = Redis.from_url(
        settings.redis_url, socket_connect_timeout=2, socket_timeout=2
    )
    llm, model, status = worker_plan(settings)
    app.state.worker_status = status
    task = None
    if status.state == "RUNNING":
        http = httpx.AsyncClient()
        if llm is None:
            llm = GmsClient(http, settings.gms_base_url, settings.gms_api_key, model)
        # 블록 읽기가 소켓 시간 초과에 잘리지 않게 헬스와 다른 연결을 쓴다
        queue = Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=2,
            socket_timeout=READ_BLOCK_MS / 1000 + 10,
        )
        worker = Worker(
            queue,
            llm,
            model,
            BackendClient(http, settings.backend_url, settings.internal_api_key),
            consumer=socket.gethostname(),
            status=status,
        )
        stop = asyncio.Event()
        task = asyncio.create_task(worker.run(stop))
    elif status.state == "BLOCKED":
        logging.getLogger(__name__).error("워커를 띄우지 않는다: %s", status.reason)
    yield
    if task is not None:
        stop.set()
        try:
            await asyncio.wait_for(asyncio.shield(task), SHUTDOWN_WAIT_S)
        except TimeoutError:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await queue.aclose()
        await http.aclose()
    await app.state.redis.aclose()


app = FastAPI(title="NEW:LEARN AI 분석 워커", lifespan=lifespan)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_worker_status(request: Request) -> WorkerStatus:
    return getattr(request.app.state, "worker_status", None) or WorkerStatus()


# 워커는 작업 큐(Redis)가 없으면 일을 못 한다 — Redis 연결을 헬스에 넣는다.
# 설정 오류(키 없음 · W1 401 · 403 · GMS 401 · 403)로 큐 읽기를 멈췄으면 503 이다
@app.get("/health")
async def health(
    response: Response,
    redis: Annotated[Redis, Depends(get_redis)],
    worker: Annotated[WorkerStatus, Depends(get_worker_status)],
) -> dict[str, str]:
    body = {"llm_mode": settings.llm_mode, "worker": worker.state}
    if worker.reason:
        body["worker_reason"] = worker.reason
    try:
        await redis.ping()
    except RedisError, OSError:
        response.status_code = 503
        return {"status": "DOWN", "redis": "DOWN", **body}
    if worker.state == "BLOCKED":
        response.status_code = 503
        return {"status": "DOWN", "redis": "UP", **body}
    return {"status": "UP", "redis": "UP", **body}
