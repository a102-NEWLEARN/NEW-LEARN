import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from app.main import app, get_redis


class FakeRedis:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    async def ping(self) -> bool:
        if self.error:
            raise self.error
        return True


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_health_is_up_when_redis_answers():
    app.dependency_overrides[get_redis] = lambda: FakeRedis()

    res = TestClient(app).get("/health")

    assert res.status_code == 200
    assert res.json()["status"] == "UP"


def test_health_is_down_when_redis_is_unreachable():
    app.dependency_overrides[get_redis] = lambda: FakeRedis(
        RedisConnectionError("refused")
    )

    res = TestClient(app).get("/health")

    assert res.status_code == 503
    assert res.json()["status"] == "DOWN"
