"""EMBED — 기사 벡터를 만들어 W1 봉투로 낸다(api-internal.md 4 · 5절, Jira S15P31A102-185).

입력 글은 AI 결과 덤프의 벡터와 같아야 한다 — 덤프와 새 기사를 같은 기준으로 비교하려는 것이다.
덤프(`ai/experiments/issue_backfill/issue_grouping.py` 의 `embedding_text`)는 원문 제목 + 줄바꿈 + 본문 앞
800자를 손대지 않고 넣는다. 여기서도 strip · HTML 정리 · EXTRACT 전처리를 하지 않는다(2026-11-09 장민준 기준).

인코딩은 CPU 계산이라 스레드 하나짜리 실행기에서 한 번에 하나만 돈다 — 이벤트 루프(EXTRACT 의 GMS 대기)를
막지 않으려는 것이다. asyncio 를 취소해도 스레드 안 계산은 멈추지 않는다. 그래서 앞 계산이 아직 돌면 새로
인코딩하지 않고 StageBlocked 로 EMBED 만 멈춘다(재시작으로 복구, EXTRACT 는 계속).
"""

import asyncio
import concurrent.futures
import logging
import math
from collections.abc import Sequence
from typing import Any, Protocol

from app.extract.run import now_kst
from app.worker import STREAM, Diag, Envelope, Stage, StageBlocked

STAGE = "EMBED"
EMBED_GROUP = "embed"
# 덤프 벡터와 같은 값이어야 한다(운영은 이름을 대조하지 않고 차원만 본다, data-load.md 3절)
MODEL_NAME = "dragonkue/BGE-m3-ko"
DIMENSION = 1024
LEAD_CHARS = 800
# float4(article_embedding.embedding) 가 받는 가장 큰 수(api-internal.md 5절 EMBED)
FLOAT4_MAX = 3.4028234663852886e38
NORM_TOLERANCE = 1e-3

log = logging.getLogger(__name__)


class Encoder(Protocol):
    def load(self) -> None: ...

    def encode(self, text: str) -> Sequence[float]: ...


def embedding_text(article: dict[str, Any]) -> str:
    title = article.get("title")
    body = article.get("body")
    title = title if isinstance(title, str) else ""
    body = body if isinstance(body, str) else ""
    return title + "\n" + body[:LEAD_CHARS]


def checked_vector(raw: Sequence[Any]) -> list[float]:
    """W1 이 받는 모양인지 보고 JSON 숫자 목록으로 바꾼다. 아니면 ValueError — 틀린 벡터는 후보 비교를 틀리게 한다."""
    values = raw.tolist() if hasattr(raw, "tolist") else list(raw)
    if len(values) != DIMENSION:
        raise ValueError(f"차원 {len(values)} ≠ {DIMENSION}")
    out: list[float] = []
    for v in values:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise TypeError("숫자가 아닌 값")
        f = float(v)
        if not math.isfinite(f) or abs(f) > FLOAT4_MAX:
            raise ValueError("유한한 float4 가 아닌 값")
        out.append(f)
    norm = math.sqrt(math.fsum(f * f for f in out))
    if abs(norm - 1) > NORM_TOLERANCE:
        raise ValueError(f"길이 {norm:.4f} — 정규화되지 않음")
    return out


class EmbedRunner:
    """인코더를 스레드 하나에서 한 번에 하나씩 돌린다."""

    def __init__(self, encoder: Encoder) -> None:
        self.encoder = encoder
        self.pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="embed"
        )
        self.pending: concurrent.futures.Future | None = None

    async def _submit(self, fn, *args):
        if self.busy():
            raise StageBlocked(
                "앞 인코딩이 아직 돈다 — 처리 시간 상한을 넘긴 계산. Pod 재시작으로 복구"
            )
        self.pending = self.pool.submit(fn, *args)
        # shield — 시간 초과로 기다림을 취소해도 진행 중인 계산 Future 는 건드리지 않고 남겨 둔다(위 검사가 본다)
        return await asyncio.shield(asyncio.wrap_future(self.pending))

    def busy(self) -> bool:
        """앞 계산(시간 초과로 기다림만 끊긴 것 포함)이 아직 도는가."""
        return self.pending is not None and not self.pending.done()

    async def prepare(self) -> None:
        """큐를 읽기 전에 모델을 한 번 읽는다. 실패하면 예외 그대로 — 부르는 쪽이 EMBED 를 BLOCKED 로 둔다."""
        await self._submit(self.encoder.load)

    async def embed(self, text: str) -> list[float]:
        return checked_vector(await self._submit(self.encoder.encode, text))

    def close(self) -> None:
        self.pool.shutdown(wait=False, cancel_futures=True)


def _envelope(
    payload: dict[str, Any],
    started: str,
    result: dict[str, Any] | None,
    code: str | None,
    message: str,
) -> Envelope:
    return {
        "attempt": payload["attempt"],
        "status": "FAILED" if code else "SUCCEEDED",
        "model": MODEL_NAME,
        "promptVersion": None,  # 임베딩은 프롬프트가 없다(5절 봉투)
        "startedAt": started,
        "finishedAt": now_kst(),
        "result": result,
        "error": {"code": code, "message": message} if code else None,
    }


def embed_stage(runner: EmbedRunner) -> Stage:
    async def process(
        payload: dict[str, Any], deadline: float
    ) -> tuple[Envelope, Diag]:
        started = now_kst()
        article = payload.get("article")
        text = embedding_text(article if isinstance(article, dict) else {})
        diag: Diag = {"chars": len(text)}
        try:
            vector = await runner.embed(text)
        except StageBlocked:
            raise
        except Exception as e:
            # 인코더 · 벡터 검사의 어떤 실패든 실패 봉투로 끝낸다 — 봉투 없이 빠지면 ack 하지 않아 같은 작업이 돈다.
            # API 가 1분 뒤 한 번 더 건다(api.md 2절 INTERNAL). 예외 글에는 입력이 섞일 수 있어 타입만 보낸다
            log.exception("EMBED 인코딩 실패")
            diag["error"] = type(e).__name__
            message = f"임베딩 실패({type(e).__name__})"
            return _envelope(payload, started, None, "INTERNAL", message), diag
        result = {"model": MODEL_NAME, "dimension": DIMENSION, "vector": vector}
        return _envelope(payload, started, result, None, ""), diag

    def fail(
        payload: dict[str, Any], started: str, code: str, message: str
    ) -> Envelope:
        return _envelope(payload, started, None, code, message)

    def describe(job_id, attempt, envelope, diag, seconds, w1) -> str:
        error = envelope["error"] or {}
        code = f"({error['code']})" if error else ""
        return (
            f"EMBED job={job_id} attempt={attempt} {envelope['status']}{code}"
            f" chars={diag.get('chars', '?')} {seconds:.1f}초 W1={w1}"
        )

    return Stage(
        name=STAGE,
        stream=STREAM,
        group=EMBED_GROUP,
        process=process,
        fail=fail,
        timeout_code="INTERNAL",
        timeout_message="처리 시간 상한(15분) 안에 임베딩을 끝내지 못함",
        describe=describe,
        stuck=lambda: (
            "시간 초과 뒤에도 인코딩 계산이 남음 — Pod 재시작으로 복구"
            if runner.busy()
            else None
        ),
    )
