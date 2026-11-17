"""mock 모드(LLM_MODE=mock) 이슈 판정 — GMS 없이 흐름만 본다.
이슈 밖 앞선 사건이 2개 이상이면 가까운 두 개와 묶어 새 이슈(CREATE), 아니면 그대로(NONE).
"""

import json

from app.gms import Completion


class MockIssueGms:
    async def complete(self, system: str, user: str, deadline: float) -> Completion:
        u = json.loads(user)
        event, others = u["event"], u["candidateEvents"]
        if len(others) >= 2:
            title = (event.get("title") or "새 이슈").strip()[:40]
            out = {
                "decision": "CREATE",
                "eventIds": [event["id"], others[0]["eventId"], others[1]["eventId"]],
                "issueTitle": title if len(title) >= 2 else "새 이슈",
                "issueSummary": f"{title} 등 사건 3개를 묶은 mock 이슈다.",
                "reason": "mock — 앞선 사건 둘과 묶는다",
            }
        else:
            out = {"decision": "NONE", "reason": "mock — 묶을 사건이 모자란다"}
        return Completion(json.dumps(out, ensure_ascii=False), "stop", {})
