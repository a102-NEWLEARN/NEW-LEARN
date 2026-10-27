"""LLM 중간 출력 → W1 EXTRACT 결과(api-internal.md 5절 · api-screen.md 3절).

다시 불러야 할 출력(스키마 오류 · 가지 0개 · 범위 밖 대표 번호)은 OutputInvalid 로 알린다.
워커는 한 번만 다시 부르고, 그래도 틀리면 FAILED · LLM_OUTPUT_INVALID 로 끝낸다 — 그대로 보내면
API 가 400 뒤 작업을 또 걸어 GMS 호출이 겹친다.
"""

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, ValidationError

from app.extract.occurred_at import resolve_occurred_at
from app.extract.preprocess import Sentence, normalize_id

SCHEMA_VERSION = "mindmap-v1"
BRANCH_ORDER = ("CORE", "CAUSE", "REACTION", "OUTLOOK")


class Leaf(BaseModel):
    model_config = ConfigDict(extra="ignore")
    text: str
    evidence: list[str] = []


class Branch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["CORE", "CAUSE", "REACTION", "OUTLOOK"]
    items: list[Leaf]


class MindmapOut(BaseModel):
    """LLM 중간 출력. 근거는 문장 번호, 시점은 원문 표현이다."""

    model_config = ConfigDict(extra="ignore")
    summary: str | None = None
    branches: list[Branch]
    primaryCoreIndex: int | None = None
    eventTimeText: str | None = None


class OutputInvalid(Exception):
    pass


def _norm_text(s: str) -> str:
    # 모델이 예시의 대표 표시(★)를 잎 글자에 따라 쓰는 일이 있다. 대표는 primaryCoreIndex 로만 표시한다
    return re.sub(r"\s+", " ", s).strip().lstrip("★").strip()


def postprocess(
    raw: str, sentences: list[Sentence], published_at: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(W1 EXTRACT result, 로그용 진단)."""
    try:
        out = MindmapOut.model_validate_json(raw)
    except ValidationError as e:
        detail = "; ".join(
            f"{'.'.join(map(str, x['loc']))} {x['msg']}" for x in e.errors()[:3]
        )
        raise OutputInvalid(f"스키마 오류 {e.error_count()}건: {detail}") from None
    diag: dict[str, Any] = {
        "evidence_dropped": [],
        "leaves_removed": [],
        "warnings": [],
    }

    # 같은 type 이 둘 이상이면 한 가지로 합친다(처음 나온 순서)
    merged: dict[str, list[Leaf]] = {}
    for b in out.branches:
        merged.setdefault(b.type, []).extend(b.items)

    core = merged.get("CORE", [])
    primary_leaf = None
    if out.primaryCoreIndex is not None:
        if not 0 <= out.primaryCoreIndex < len(core):
            raise OutputInvalid(
                f"primaryCoreIndex {out.primaryCoreIndex} 가 CORE 잎 {len(core)}개 범위 밖"
            )
        primary_leaf = core[out.primaryCoreIndex]
        if not _norm_text(primary_leaf.text):
            raise OutputInvalid("대표 잎이 빈 문장")

    pos = {
        s["id"]: {k: s[k] for k in ("text", "paragraphIndex", "sentenceIndex")}
        for s in sentences
    }
    # 잎 정리(빈 잎 · 중복 잎 제거, 가지 순서 정렬)를 먼저 하고 대표 번호를 다시 센다(설계 4절 4번)
    seen_text: dict[str, Leaf] = {}
    survivor: dict[int, Leaf] = {}  # 지운 중복 잎 → 남긴 잎
    branches: list[tuple[str, list[tuple[Leaf, dict[str, Any]]]]] = []
    for t in BRANCH_ORDER:
        items = []
        for leaf in merged.get(t, []):
            text = _norm_text(leaf.text)
            if not text:
                diag["leaves_removed"].append(f"{t}: 빈 잎")
                continue
            if text in seen_text:
                diag["leaves_removed"].append(f"{t}: 중복 '{text[:30]}'")
                survivor[id(leaf)] = seen_text[text]
                continue
            seen_text[text] = leaf
            # 없는 번호는 근거만 지우고 잎은 남긴다(api-screen.md 3절)
            ids: list[str] = []
            for i in leaf.evidence:
                n = normalize_id(i)
                if n not in pos:
                    diag["evidence_dropped"].append(f"{t}: '{i}'")
                elif n not in ids:
                    ids.append(n)
            items.append((leaf, {"text": text, "evidence": [pos[i] for i in ids]}))
        if items:
            branches.append((t, items))
    if not branches:
        raise OutputInvalid("가지 0개")

    primary_index = None
    if primary_leaf is not None:
        target = survivor.get(id(primary_leaf), primary_leaf)
        core_items = next(items for t, items in branches if t == "CORE")
        primary_index = next(
            i for i, (leaf, _) in enumerate(core_items) if leaf is target
        )
        # 대표 잎 → 나머지 순서로 저장한다(2026-10-26 FE · BE 합의 B안)
        if primary_index > 0:
            diag["primary_moved_from"] = primary_index
            core_items.insert(0, core_items.pop(primary_index))
            primary_index = 0
        if not core_items[0][1]["evidence"]:
            # 근거는 선택 칸이라 번호는 그대로 둔다. 비율은 평가에서 본다
            diag["warnings"].append("대표 잎 근거 0개")

    occurred_at = None
    if primary_index is not None:
        occurred_at, diag["occurredAtNote"] = resolve_occurred_at(
            out.eventTimeText, published_at
        )
    elif out.eventTimeText:
        diag["warnings"].append(f"대표 잎 없는데 eventTimeText '{out.eventTimeText}'")
    diag["eventTimeText"] = out.eventTimeText

    summary = _norm_text(out.summary) if out.summary else ""
    result = {
        "summary": summary or None,
        "schemaVersion": SCHEMA_VERSION,
        "mindmap": {
            "title": None,
            "branches": [
                {
                    "type": t,
                    # 근거가 모두 지워진 잎은 evidence 칸을 빼고 보낸다(선택 칸)
                    "items": [
                        {k: v for k, v in item.items() if k != "evidence" or v}
                        for _, item in items
                    ],
                }
                for t, items in branches
            ],
        },
        "primaryCoreIndex": primary_index,
        "occurredAt": occurred_at,
    }
    return result, diag
