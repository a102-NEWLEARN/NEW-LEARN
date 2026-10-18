from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import load_settings

settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.redis = Redis.from_url(
        settings.redis_url, socket_connect_timeout=2, socket_timeout=2
    )
    yield
    await app.state.redis.aclose()


app = FastAPI(title="NEW:LEARN AI 분석 워커", lifespan=lifespan)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


# 워커는 작업 큐(Redis)가 없으면 일을 못 한다 — Redis 연결을 헬스에 넣는다
@app.get("/health")
async def health(
    response: Response, redis: Annotated[Redis, Depends(get_redis)]
) -> dict[str, str]:
    try:
        await redis.ping()
    except RedisError, OSError:
        response.status_code = 503
        return {"status": "DOWN", "redis": "DOWN", "llm_mode": settings.llm_mode}
    return {"status": "UP", "redis": "UP", "llm_mode": settings.llm_mode}
