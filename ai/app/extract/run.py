"""작업 메시지 한 건 → W1 봉투(api-internal.md 4 · 5절). Redis · W1 은 모른다.

흐름: 문장 번호 붙이기 → 분석할 문장이 없으면 GMS 없이 INPUT_NOT_ANALYZABLE → GMS → 결과 검사.
결과 검사가 틀리면(스키마 · 가지 0개 · 범위 밖 대표 번호 · 잘린 출력) 한 번만 다시 부르고, 또 틀리면
LLM_OUTPUT_INVALID 다 — 그대로 보내면 API 가 400 뒤 작업을 또 걸어 GMS 호출이 겹친다.
"""

import logging
from datetime import datetime
from typing import Any, Protocol

from app.extract.occurred_at import KST
from app.extract.postprocess import OutputInvalid, postprocess
from app.extract.preprocess import build_user_message, is_analyzable, split_sentences
from app.extract.prompt import PROMPT_VERSION, SYSTEM_PROMPT
from app.gms import Completion, GmsAuthError, GmsError

log = logging.getLogger(__name__)

OUTPUT_TRIES = 2


class ChatClient(Protocol):
    async def complete(self, system: str, user: str, deadline: float) -> Completion: ...


def now_kst() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


async def run_extract(
    payload: dict[str, Any], llm: ChatClient, model: str, deadline: float
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(W1 봉투, 로그용 진단). GMS 키 오류(GmsAuthError)만 밖으로 던진다 — 작업 실패가 아니라 설정 오류다."""
    started = now_kst()
    diag: dict[str, Any] = {"calls": 0, "usage": []}

    def envelope(result: dict[str, Any] | None, code: str | None, message: str) -> dict:
        # 실패여도 model · promptVersion 을 채운다 — API 는 실패 결과의 두 칸을 저장하지 않는다(5절)
        return {
            "attempt": payload["attempt"],
            "status": "FAILED" if code else "SUCCEEDED",
            "model": model,
            "promptVersion": PROMPT_VERSION,
            "startedAt": started,
            "finishedAt": now_kst(),
            "result": result,
            "error": {"code": code, "message": message} if code else None,
        }

    try:
        article = payload["article"]
        published_at = article["publishedAt"]
        sentences, dropped = split_sentences(article["body"])
        diag["sentences"] = len(sentences)
        diag["dropped"] = len(dropped)
        if not is_analyzable(sentences):
            return envelope(
                None, "INPUT_NOT_ANALYZABLE", "안내 문구를 빼면 분석할 문장이 없음"
            ), diag
        user = build_user_message(
            article["title"], article["publisher"], published_at, sentences
        )
        problem = ""
        for _ in range(OUTPUT_TRIES):
            out = await llm.complete(SYSTEM_PROMPT, user, deadline)
            diag["calls"] += 1
            diag["usage"].append(out.usage)
            if out.finish_reason == "length":
                problem = "출력이 길이 상한에서 잘림"
                continue
            try:
                result, post = postprocess(out.content, sentences, published_at)
            except OutputInvalid as e:
                problem = str(e)
                continue
            diag["warnings"] = post["warnings"]
            diag["evidence_dropped"] = len(post["evidence_dropped"])
            return envelope(result, None, ""), diag
        return envelope(None, "LLM_OUTPUT_INVALID", problem[:200]), diag
    except GmsError as e:
        return envelope(None, e.code, e.message), diag
    except GmsAuthError:
        raise
    except Exception as e:
        # 메시지 · 코드의 예상 밖 오류. 기사 본문이 로그에 섞이지 않게 예외 이름만 W1 에 싣는다
        log.exception("EXTRACT 처리 중 예상 밖 오류")
        return envelope(None, "INTERNAL", f"워커 오류({type(e).__name__})"), diag
