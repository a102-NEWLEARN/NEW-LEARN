"""판정 · 이슈 워커를 띄울지 정하기(main.judge_plan). 둘 다 꺼진 채 배포하고 덤프 적재 뒤 인프라가 켠다."""

import pytest

from app.config import load_settings
from app.issue.mock import MockIssueGms
from app.main import judge_plan
from app.match_event.mock import MockMatchGms

BASE = {"BACKEND_URL": "http://backend:8080", "INTERNAL_API_KEY": "k"}
GMS = {**BASE, "LLM_MODE": "gms", "GMS_API_KEY": "x", "GMS_BASE_URL": "https://gms"}


def plan(env, which):
    s = load_settings(env)
    if which == "match":
        return judge_plan(
            s, s.match_event_worker_enabled, "MATCH_EVENT_WORKER_ENABLED", MockMatchGms
        )
    return judge_plan(s, s.issue_worker_enabled, "ISSUE_WORKER_ENABLED", MockIssueGms)


@pytest.mark.parametrize("which", ["match", "issue"])
def test_off_unless_enabled(which):
    s = load_settings(GMS)
    assert (s.match_event_worker_enabled, s.issue_worker_enabled) == (False, False)
    llm, _, status = plan(GMS, which)
    assert llm is None and status.state == "OFF"


@pytest.mark.parametrize(
    "which, flag",
    [("match", "MATCH_EVENT_WORKER_ENABLED"), ("issue", "ISSUE_WORKER_ENABLED")],
)
def test_gms_mode_runs_with_shared_client_made_later(which, flag):
    llm, model, status = plan({**GMS, flag: "true"}, which)
    # GmsClient 는 http 클라이언트가 생긴 뒤 lifespan 이 한 번 만들어 같이 쓴다
    assert llm is None and model == "gpt-6-luna" and status.state == "RUNNING"


@pytest.mark.parametrize(
    "which, flag, mock",
    [
        ("match", "MATCH_EVENT_WORKER_ENABLED", MockMatchGms),
        ("issue", "ISSUE_WORKER_ENABLED", MockIssueGms),
    ],
)
def test_mock_needs_explicit_allow(which, flag, mock):
    env = {**BASE, "LLM_MODE": "mock", flag: "true"}
    llm, _, status = plan(env, which)
    assert llm is None and status.state == "OFF"
    llm, model, status = plan({**env, "WORKER_ALLOW_MOCK": "true"}, which)
    assert isinstance(llm, mock) and model == "mock" and status.state == "RUNNING"


@pytest.mark.parametrize(
    "env",
    [
        {"LLM_MODE": "gms", "GMS_API_KEY": "x", "GMS_BASE_URL": "https://gms"},
        {**BASE, "LLM_MODE": "gms"},
        {**BASE, "LLM_MODE": "other"},
    ],
)
def test_blocks_on_missing_settings(env):
    llm, _, status = plan({**env, "MATCH_EVENT_WORKER_ENABLED": "true"}, "match")
    assert llm is None and status.state == "BLOCKED"
