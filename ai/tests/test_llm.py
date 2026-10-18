import pytest

from app.config import load_settings
from app.llm import MOCK_RESPONSE, create_chat_model


def test_mock_mode_answers_without_gms():
    model = create_chat_model(load_settings({}))

    assert model.invoke("기사에서 6하원칙을 뽑아 줘").content == MOCK_RESPONSE


def test_gms_mode_needs_key_and_url():
    with pytest.raises(RuntimeError):
        create_chat_model(load_settings({"LLM_MODE": "gms"}))
