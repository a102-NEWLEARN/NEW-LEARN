"""이슈 판정 답 검사 · 고르기. 백엔드가 400 으로 돌려줄 답(api-internal.md 5절 ISSUE 「400」 표)과 글 규칙을 어긴 답은
OutputInvalid 로 보고 다시 묻는다. 고른 답은 결정에 맞는 칸만 남긴다(백엔드 시험 fixture 와 같은 모양).
"""

import json
from typing import Any

from app.extract.postprocess import OutputInvalid
from app.text_rules import POLITE_ENDING, blank, cut, has_nul

DECISIONS = ("ATTACH", "CREATE", "NONE")
TITLE_MIN, TITLE_MAX = 2, 40
SUMMARY_MIN = 10
CREATE_MIN_EVENTS = 3


def _int(value: Any) -> bool:
    return type(value) is int


def _summary(text: Any, banned: list[str], warnings: list[str]) -> str:
    if blank(text) or has_nul(text):
        raise OutputInvalid("issueSummary 가 비었거나 NUL")
    text = text.strip()
    if len(text) < SUMMARY_MIN:
        # 길이는 프롬프트에 주는 제안이고 계약은 막지 않는다(api-internal.md 5절). 버리면 다시
        # 물어도 같은 답이 와서 그 사건이 이슈에 영영 안 붙는다. 짧은 쪽은 자를 수도 없어 그대로 둔다
        warnings.append(f"issueSummary {len(text)}자(제안 {SUMMARY_MIN}자 이상)")
    if POLITE_ENDING.search(text):
        raise OutputInvalid("issueSummary 가 합니다 · 해요체")
    if any(name in text for name in banned):
        raise OutputInvalid("쓰면 안 되는 이름을 씀")
    return text


def check_answer(
    raw: str, event_id: int, issue_ids: set[int], event_ids: set[int], banned: list[str]
) -> tuple[dict[str, Any], list[str]]:
    """W1 result 와 경고. 틀리면 OutputInvalid.

    경고는 거절할 만큼은 아니지만 알아야 하는 것이다 — 계약이 막지 않는 길이를 넘겼을 때.
    버리면 그 사건이 이슈에 영영 안 붙어서(2026-11-15 label 사고) 경고로만 남긴다.
    """
    try:
        out = json.loads(raw)
    except ValueError as e:
        raise OutputInvalid("JSON 이 아님") from e
    if not isinstance(out, dict):
        raise OutputInvalid("JSON 객체가 아님")
    decision, reason = out.get("decision"), out.get("reason")
    if decision not in DECISIONS:
        raise OutputInvalid(f"decision {decision!r}")
    if blank(reason) or has_nul(reason):
        raise OutputInvalid("reason 이 비었거나 NUL")
    reason = reason.strip()
    warnings: list[str] = []
    if decision == "NONE":
        return {"decision": "NONE", "reason": reason}, warnings
    if decision == "ATTACH":
        issue_id = out.get("issueId")
        if not _int(issue_id) or issue_id not in issue_ids:
            raise OutputInvalid(f"ATTACH issueId {issue_id!r} 가 후보 밖")
        return {
            "decision": "ATTACH",
            "issueId": issue_id,
            "issueSummary": _summary(out.get("issueSummary"), banned, warnings),
            "reason": reason,
        }, warnings

    ids = out.get("eventIds")
    if not isinstance(ids, list) or not all(_int(i) for i in ids):
        raise OutputInvalid("eventIds 가 정수 배열이 아님")
    if len(set(ids)) != len(ids):
        raise OutputInvalid("eventIds 에 같은 번호가 둘")
    if event_id not in ids:
        raise OutputInvalid("eventIds 에 이 사건이 없음")
    if any(i != event_id and i not in event_ids for i in ids):
        raise OutputInvalid("eventIds 에 후보 밖 사건")
    if len(ids) < CREATE_MIN_EVENTS:
        raise OutputInvalid(f"eventIds {len(ids)}개(최소 {CREATE_MIN_EVENTS})")
    title = out.get("issueTitle")
    if blank(title) or has_nul(title):
        raise OutputInvalid("issueTitle 이 비었거나 NUL")
    title = title.strip()
    if len(title) > TITLE_MAX:
        # 이름은 이름답게 — 버리지도 두지도 않고 자른다(사용자 2026-11-15, text_rules.cut 주석)
        warnings.append(f"issueTitle {len(title)}자 → {TITLE_MAX}자로 자름")
        title = cut(title, TITLE_MAX)
    elif len(title) < TITLE_MIN:
        warnings.append(f"issueTitle {len(title)}자(제안 {TITLE_MIN}자 이상)")
    if any(name in title for name in banned):
        raise OutputInvalid("쓰면 안 되는 이름을 씀")
    return {
        "decision": "CREATE",
        "eventIds": ids,
        "issueTitle": title,
        "issueSummary": _summary(out.get("issueSummary"), banned, warnings),
        "reason": reason,
    }, warnings
