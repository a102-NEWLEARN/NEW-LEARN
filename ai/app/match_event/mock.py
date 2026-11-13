"""mock 모드(LLM_MODE=mock) 판정 — GMS 없이 흐름만 본다. 늘 새 사건(MAIN)이고 이름은 대표 사건 글에서 딴다."""

import json

from app.gms import Completion


class MockMatchGms:
    async def complete(self, system: str, user: str, deadline: float) -> Completion:
        u = json.loads(user)
        text = u["extracted"]["primaryEvent"]["text"].strip() or "새 사건"
        words = text.split()
        label = words[0][:10] if words and len(words[0]) >= 2 else "새 사건"
        out = {
            "decision": "NEW",
            "eventId": None,
            "newEvent": {
                "title": text[:40],
                "label": label,
                "summary": (u["extracted"].get("summary") or text).strip(),
                "role": "MAIN",
                "reactsTo": None,
                "reactsToEventId": None,
            },
            "reason": "mock — 늘 새 사건으로 본다",
        }
        return Completion(json.dumps(out, ensure_ascii=False), "stop", {})
