import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from app.main import (
    app,
    get_embed_status,
    get_issue_status,
    get_match_event_status,
    get_redis,
)
from app.worker import WorkerStatus


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


@pytest.mark.parametrize(
    "state, code",
    [("OFF", 200), ("RUNNING", 200), ("BLOCKED", 503)],
)
def test_health_reports_embed_worker_and_fails_only_when_blocked(state, code):
    app.dependency_overrides[get_redis] = lambda: FakeRedis()
    app.dependency_overrides[get_embed_status] = lambda: WorkerStatus(
        state, "모델 없음" if state == "BLOCKED" else ""
    )

    res = TestClient(app).get("/health")

    assert res.status_code == code
    assert res.json()["embed_worker"] == state
    if state == "BLOCKED":
        assert res.json()["embed_worker_reason"] == "모델 없음"


@pytest.mark.parametrize(
    "dependency, field",
    [
        (get_match_event_status, "match_event_worker"),
        (get_issue_status, "issue_worker"),
    ],
)
@pytest.mark.parametrize(
    "state, code", [("OFF", 200), ("RUNNING", 200), ("BLOCKED", 503)]
)
def test_health_reports_judge_workers_and_fails_only_when_blocked(
    dependency, field, state, code
):
    app.dependency_overrides[get_redis] = lambda: FakeRedis()
    app.dependency_overrides[dependency] = lambda: WorkerStatus(
        state, "GMS 401" if state == "BLOCKED" else ""
    )

    res = TestClient(app).get("/health")

    assert res.status_code == code
    assert res.json()[field] == state
    if state == "BLOCKED":
        assert res.json()[f"{field}_reason"] == "GMS 401"
