import os
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    redis_url: str
    llm_mode: str
    gms_model: str
    gms_api_key: str
    gms_base_url: str
    backend_url: str = ""
    internal_api_key: str = ""
    worker_allow_mock: bool = False
    embed_worker_enabled: bool = False
    embed_model_path: str = "/models/BGE-m3-ko"
    embed_torch_threads: int = 2
    match_event_worker_enabled: bool = False
    issue_worker_enabled: bool = False


def _positive_int(raw: str | None, default: int) -> int:
    try:
        n = int(raw or "")
    except ValueError:
        return default
    return n if n > 0 else default


# 이름은 저장소 루트 .env.example 을 따른다. compose 의 ai 컨테이너는 환경변수로,
# 호스트에서 띄울 때는 uv run --env-file ../.env 로 같은 값을 받는다.
# 빈 값은 없는 것으로 본다 — compose 는 .env 에 없는 이름도 빈 값으로 넘긴다
def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    host = env.get("REDIS_HOST") or "localhost"
    port = env.get("REDIS_PORT") or "6379"
    return Settings(
        redis_url=f"redis://{host}:{port}/0",
        llm_mode=env.get("LLM_MODE") or "mock",
        gms_model=env.get("GMS_MODEL") or "gpt-6-luna",
        gms_api_key=env.get("GMS_API_KEY", ""),
        gms_base_url=env.get("GMS_BASE_URL", ""),
        # W1 주소와 워커 출입증(api.md 4절 AI 9번). k8s 는 ai.yaml 이 넣는다
        backend_url=(env.get("BACKEND_URL") or "").rstrip("/"),
        internal_api_key=env.get("INTERNAL_API_KEY", ""),
        # 모의 응답을 실제 작업 결과로 저장하지 않게, mock 으로 큐를 읽는 것은 명시적으로 켤 때만이다
        worker_allow_mock=env.get("WORKER_ALLOW_MOCK", "").lower() == "true",
        # EMBED 는 꺼진 채 배포하고 덤프 적재 · 큐 점검 뒤 인프라가 켠다(Jira S15P31A102-185 계획)
        embed_worker_enabled=env.get("EMBED_WORKER_ENABLED", "").lower() == "true",
        # init 컨테이너가 판 7074d66 으로 받아 둔 폴더(infra/k8s/services/ai/ai.yaml)
        embed_model_path=env.get("EMBED_MODEL_PATH") or "/models/BGE-m3-ko",
        # SSOT 10절 실측 조건(2스레드)
        embed_torch_threads=_positive_int(env.get("EMBED_TORCH_THREADS"), 2),
        # 판정 · 이슈도 꺼진 채 배포하고 덤프 적재 뒤 인프라가 켠다(Jira S15P31A102-186 계획)
        match_event_worker_enabled=env.get("MATCH_EVENT_WORKER_ENABLED", "").lower()
        == "true",
        issue_worker_enabled=env.get("ISSUE_WORKER_ENABLED", "").lower() == "true",
    )
