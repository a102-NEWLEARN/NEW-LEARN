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


# 이름은 저장소 루트 .env.example 을 따른다. compose 의 ai 컨테이너는 환경변수로,
# 호스트에서 띄울 때는 uv run --env-file ../.env 로 같은 값을 받는다.
# 빈 값은 없는 것으로 본다 — compose 는 .env 에 없는 이름도 빈 값으로 넘긴다
def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    host = env.get("REDIS_HOST") or "localhost"
    port = env.get("REDIS_PORT") or "6379"
    return Settings(
        redis_url=f"redis://{host}:{port}/0",
        llm_mode=env.get("LLM_MODE") or "mock",
        gms_model=env.get("GMS_MODEL") or "gpt-5-mini",
        gms_api_key=env.get("GMS_API_KEY", ""),
        gms_base_url=env.get("GMS_BASE_URL", ""),
    )
