"""판정 · 이슈가 짓는 글(사건 이름 · 키워드 · 요약, 이슈 이름 · 요약)의 공통 규칙.

- 문장 끝은 기사체('~했다'). 합니다체 · 해요체는 형식 오류로 보고 다시 묻는다
- 공인이 아닌 사람(피의자 · 피해자 · 일반인) 실명은 쓰지 않는다. 기사에 「이름(나이)」 꼴로 나오고 앞뒤 12자에 직함이
  없는 이름을 찾아 프롬프트에 넘기고, 답에 그 이름이 있으면 형식 오류로 본다
  (규칙 출처: ai/experiments/issue_backfill/issue_summary.py v4, 2026-11-03 팀 결정)
"""

import re
from collections.abc import Iterable

POLITE_ENDING = re.compile(r"(니다|[어아여해돼에예]요|세요)[.!?]?(?=\s|$)")
PRIVATE_NAME = re.compile(r"(?<![가-힣])([가-힣]{2,4}?)씨?\(\d{1,3}\)")
PUBLIC_ROLE = re.compile(
    r"대통령|총리|장관|의원|대표|위원장|시장|지사|회장|사장|총재|청장|대법관|후보|감독|선수"
)


def private_names(texts: Iterable[str]) -> list[str]:
    """글들에 「이름(나이)」로 나온 이름 중 앞뒤에 직함이 없는 것. 처음 나온 순서."""
    found: list[str] = []
    public: set[str] = set()
    for text in texts:
        for m in PRIVATE_NAME.finditer(text):
            near = text[max(0, m.start() - 12) : m.end() + 12]
            if PUBLIC_ROLE.search(near):
                public.add(m.group(1))
            elif m.group(1) not in found:
                found.append(m.group(1))
    return [name for name in found if name not in public]


def blank(value: object) -> bool:
    return not isinstance(value, str) or not value.strip()


def has_nul(*values: object) -> bool:
    """U+0000 이 든 글. DB 가 받지 못해 API 가 400 으로 돌려준다(api-internal.md 5절)."""
    return any(isinstance(v, str) and "\x00" in v for v in values)
