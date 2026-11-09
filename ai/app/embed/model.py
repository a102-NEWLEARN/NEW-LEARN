"""임베딩 인코더 — 운영은 BGE-m3-ko(CPU), mock 은 고정 벡터.

운영 모델은 init 컨테이너가 판(커밋) 7074d66 으로 받아 둔 폴더(`/models/BGE-m3-ko`)에서만 읽는다
(`infra/k8s/services/ai/ai.yaml`, `HF_HUB_OFFLINE=1`). 덤프와 같게 `normalize_embeddings=True` 로 뽑은 뒤
float32 로 바꿔 한 번 더 정규화한다(`issue_grouping.embed_articles`). torch 는 무거워 load 에서만 읽는다.
"""

import hashlib
import math
from collections.abc import Sequence

from app.embed.run import DIMENSION


class SentenceEncoder:
    def __init__(self, path: str, threads: int) -> None:
        self.path = path
        self.threads = threads
        self.model = None

    def load(self) -> None:
        import torch
        from sentence_transformers import SentenceTransformer

        # SSOT 10절 실측 조건(2스레드)과 같게 — 정하지 않으면 코어 수만큼 써서 EXTRACT 와 다툰다
        torch.set_num_threads(self.threads)
        self.model = SentenceTransformer(
            self.path,
            device="cpu",
            local_files_only=True,
            model_kwargs={"torch_dtype": torch.float32},
        )

    def encode(self, text: str) -> Sequence[float]:
        import numpy as np

        if self.model is None:
            raise RuntimeError("모델을 아직 읽지 않음")
        v = self.model.encode(
            [text],
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )[0]
        v = np.asarray(v, dtype=np.float32)
        return v / np.linalg.norm(v)


class MockEncoder:
    """로컬 mock 모드용 — 모델 없이 글마다 같은 단위 벡터. 값에 뜻은 없다."""

    def load(self) -> None:
        return None

    def encode(self, text: str) -> Sequence[float]:
        seed = hashlib.sha256(text.encode()).digest()
        raw = [(seed[i % len(seed)] - 127.5) or 1.0 for i in range(DIMENSION)]
        norm = math.sqrt(math.fsum(x * x for x in raw))
        return [x / norm for x in raw]
