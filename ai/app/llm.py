from langchain_core.language_models import BaseChatModel
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.config import Settings

MOCK_RESPONSE = "모의 응답입니다. LLM_MODE=gms 로 바꾸면 SSAFY GMS 를 부릅니다."


def create_chat_model(settings: Settings) -> BaseChatModel:
    # 개발 중에는 모의 응답이 기본이고, GMS 는 명시적으로 켤 때만 부른다 (SSOT.md 3절 예산)
    if settings.llm_mode == "mock":
        return FakeListChatModel(responses=[MOCK_RESPONSE])
    if settings.llm_mode == "gms":
        if not settings.gms_api_key or not settings.gms_base_url:
            raise RuntimeError(
                "LLM_MODE=gms 는 .env 의 GMS_API_KEY · GMS_BASE_URL 이 필요하다"
            )
        # GMS 가 OpenAI 호환 API 를 그대로 받는지는 아직 확인 전이다 (SSOT.md 8절)
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.gms_model,
            api_key=settings.gms_api_key,
            base_url=settings.gms_base_url,
        )
    raise ValueError(f"LLM_MODE 는 mock 또는 gms 여야 한다: {settings.llm_mode!r}")
