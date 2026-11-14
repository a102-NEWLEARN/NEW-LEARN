"""이슈 판정 답 검사 · 고르기. 백엔드가 400 으로 돌려줄 답(api-internal.md 5절 ISSUE 「400」 표)과 글 규칙을 어긴 답은
OutputInvalid 로 보고 다시 묻는다. 고른 답은 결정에 맞는 칸만 남긴다(백엔드 시험 fixture 와 같은 모양).
"""

import json
from typing import Any

from app.extract.postprocess import OutputInvalid
from app.text_rules import POLITE_ENDING, blank, has_nul

DECISIONS = ("ATTACH", "CREATE", "NONE")
TITLE_MIN, TITLE_MAX = 2, 40
SUMMARY_MIN = 10
CREATE_MIN_EVENTS = 3


def _int(value: Any) -> bool:
    return type(value) is int


def _summary(text: Any, banned: list[str]) -> str:
    if blank(text) or has_nul(text):
        raise OutputInvalid("issueSummary 가 비었거나 NUL")
    text = text.strip()
    if len(text) < SUMMARY_MIN:
        raise OutputInvalid(f"issueSummary {len(text)}자(최소 {SUMMARY_MIN})")
    if POLITE_ENDING.search(text):
        raise OutputInvalid("issueSummary 가 합니다 · 해요체")
    if any(name in text for name in banned):
        raise OutputInvalid("쓰면 안 되는 이름을 씀")
    return text


def check_answer(
    raw: str, event_id: int, issue_ids: set[int], event_ids: set[int], banned: list[str]
) -> dict[str, Any]:
    """W1 result. 틀리면 OutputInvalid."""
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
    if decision == "NONE":
        return {"decision": "NONE", "reason": reason}
    if decision == "ATTACH":
        issue_id = out.get("issueId")
        if not _int(issue_id) or issue_id not in issue_ids:
            raise OutputInvalid(f"ATTACH issueId {issue_id!r} 가 후보 밖")
        return {
            "decision": "ATTACH",
            "issueId": issue_id,
            "issueSummary": _summary(out.get("issueSummary"), banned),
            "reason": reason,
        }

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
    if not TITLE_MIN <= len(title) <= TITLE_MAX:
        raise OutputInvalid(f"issueTitle {len(title)}자({TITLE_MIN}~{TITLE_MAX})")
    if any(name in title for name in banned):
        raise OutputInvalid("쓰면 안 되는 이름을 씀")
    return {
        "decision": "CREATE",
        "eventIds": ids,
        "issueTitle": title,
        "issueSummary": _summary(out.get("issueSummary"), banned),
        "reason": reason,
    }
