"""판정 답 검사 · 고르기. 백엔드가 400 으로 돌려줄 답(api-internal.md 5절 MATCH_EVENT 「400」 표)과 프롬프트 규칙을 어긴 답은
OutputInvalid 로 보고 다시 묻는다 — 그대로 보내면 API 가 400 뒤 작업을 또 걸어 GMS 호출이 겹친다.
"""

import json
from typing import Any

from app.extract.postprocess import OutputInvalid
from app.text_rules import POLITE_ENDING, blank, has_nul

DECISIONS = ("EXISTING", "NEW")
ROLES = ("MAIN", "REACTION")
TITLE_MAX = 40
LABEL_MIN, LABEL_MAX = 2, 10


def _int(value: Any) -> bool:
    return type(value) is int


def check_answer(
    raw: str, candidate_ids: set[int], banned: list[str]
) -> tuple[dict[str, Any], list[str]]:
    """(W1 result, 경고). 틀리면 OutputInvalid."""
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
    if decision == "EXISTING":
        event_id = out.get("eventId")
        if not _int(event_id) or event_id not in candidate_ids:
            raise OutputInvalid(f"EXISTING eventId {event_id!r} 가 후보 밖")
        return {
            "decision": "EXISTING",
            "eventId": event_id,
            "newEvent": None,
            "reason": reason.strip(),
        }, []

    new = out.get("newEvent")
    if not isinstance(new, dict):
        raise OutputInvalid("NEW 인데 newEvent 가 없음")
    title, label, summary, role = (
        new.get(k) for k in ("title", "label", "summary", "role")
    )
    if blank(title) or blank(label) or blank(summary):
        raise OutputInvalid("title · label · summary 중 빈 칸")
    if has_nul(title, label, summary):
        raise OutputInvalid("NUL 글자")
    title, label, summary = title.strip(), label.strip(), summary.strip()
    if role not in ROLES:
        raise OutputInvalid(f"role {role!r}")
    if len(title) > TITLE_MAX:
        raise OutputInvalid(f"title {len(title)}자(최대 {TITLE_MAX})")
    if not LABEL_MIN <= len(label) <= LABEL_MAX:
        raise OutputInvalid(f"label {len(label)}자({LABEL_MIN}~{LABEL_MAX})")
    if POLITE_ENDING.search(summary):
        raise OutputInvalid("summary 가 합니다 · 해요체")
    for name in banned:
        if name in title + label + summary:
            raise OutputInvalid("쓰면 안 되는 이름을 씀")

    warnings: list[str] = []
    reacts_to, target = None, None
    if role == "REACTION":
        text = new.get("reactsTo")
        reacts_to = (
            text.strip()
            if isinstance(text, str) and text.strip() and not has_nul(text)
            else None
        )
        target = new.get("reactsToEventId")
        if target is not None and (not _int(target) or target not in candidate_ids):
            # 백엔드도 null 로 받는다(AC-13). 미리 지우고 경고만 남긴다
            warnings.append(f"reactsToEventId {str(target)[:20]} 후보 밖 → null")
            target = None
    result = {
        "decision": "NEW",
        "eventId": None,
        "newEvent": {
            "title": title,
            "label": label,
            "summary": summary,
            "role": role,
            "reactsTo": reacts_to,
            "reactsToEventId": target,
        },
        "reason": reason.strip(),
    }
    return result, warnings
