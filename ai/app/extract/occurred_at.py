"""대표 잎의 시점 표현(eventTimeText) → occurredAt (api-internal.md 5절 EXTRACT 결과).

- 시각까지 있으면 시각까지, 날짜까지만 있으면 그날 0시 +09:00
- 「지난 6일」 · 「어제」 같은 상대 날짜는 메시지의 publishedAt 기준. 연도가 바뀌는 경우도 푼다
- 「현지시간 6일」은 한국 시간으로 옮기지 않고 적힌 날짜 그대로
- 「지난달」 · 「올해 초」처럼 날짜보다 흐리거나 못 뽑으면 null (API 가 첫 기사 발행 시각으로 채운다)
- 이미 일어난 일인데 발행 시각보다 뒤로 계산되면 null
"""

import re
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

_MD = re.compile(r"(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})(?:\s*[~∼-]\s*\d{1,2})?일")
_D = re.compile(r"(?<![\d월])(\d{1,2})(?:\s*[~∼-]\s*\d{1,2})?일")
_SLASH = re.compile(r"(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/])")
_TIME = re.compile(
    r"(오전|오후|새벽|아침|낮|저녁|밤)?\s*(\d{1,2})시(?!간)(?:\s*(\d{1,2})분|\s*반)?"
)
_HHMM = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)")
_FUZZY = re.compile(
    r"지난주|이번\s*주|지난달|이달|올해|지난해|작년|최근|연초|연말"
    r"|초순|중순|하순|상반기|하반기|분기|무렵|께$"
)
_RELATIVE_DAYS = (
    ("그저께", 2),
    ("그제", 2),
    ("어제", 1),
    ("전날", 1),
    ("오늘", 0),
    ("이날", 0),
    ("금일", 0),
)


class _Unresolved(Exception):
    pass


def parse_published(s: str) -> datetime:
    """publishedAt(ISO 8601). 시간대가 없으면 한국 시간으로 본다."""
    s = s.strip()
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M")
    return dt if dt.tzinfo else dt.replace(tzinfo=KST)


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    m = year * 12 + (month - 1) + delta
    return m // 12, m % 12 + 1


def _clock(text: str) -> tuple[int, int] | None:
    if m := _HHMM.search(text):
        return int(m[1]), int(m[2])
    if m := _TIME.search(text):
        h, mi = int(m[2]), int(m[3] or (30 if "반" in m[0] else 0))
        if m[1] in ("오후", "저녁", "밤") and h < 12:
            h += 12
        elif m[1] in ("오전", "새벽", "아침") and h == 12:
            h = 0
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return h, mi
    return None


def _date(text: str, pub: datetime) -> tuple[int, int, int]:
    """(연, 월, 일). 못 풀거나 흐리면 _Unresolved."""
    t = text.replace("현지시간", "").replace("현지 시간", "")
    md = list(_MD.finditer(t))
    days = list(_D.finditer(_MD.sub(" ", t)))
    slash = list(_SLASH.finditer(t))
    if len(md) + len(days) + len(slash) > 1:
        raise _Unresolved("날짜가 둘 이상")
    if md:
        m = md[0]
        if m[1]:
            y = int(m[1])
        else:
            y = pub.year - bool(re.search("지난해|작년", t)) + ("내년" in t)
            # 연도 없는 1월 기사의 '12월 28일' — 발행일보다 뒤인 달이면 지난해
            if not re.search("지난해|작년|내년", t) and int(m[2]) > pub.month:
                y -= 1
        return y, int(m[2]), int(m[3])
    if slash:
        mo, d = int(slash[0][1]), int(slash[0][2])
        return pub.year - (mo > pub.month), mo, d
    if days:
        d = int(days[0][1])
        if "지난달" in t:
            y, mo = _shift_month(pub.year, pub.month, -1)
        elif re.search(r"다음\s*달|내달", t):
            y, mo = _shift_month(pub.year, pub.month, 1)
        elif d > pub.day:
            # '지난 28일'이 발행일보다 큰 날이면 지난달(1월 기사면 연도도 바뀐다)
            y, mo = _shift_month(pub.year, pub.month, -1)
        else:
            y, mo = pub.year, pub.month
        return y, mo, d
    for word, back in _RELATIVE_DAYS:
        if word in t:
            day = pub - timedelta(days=back)
            return day.year, day.month, day.day
    raise _Unresolved("흐린 표현" if _FUZZY.search(t) else "날짜 없음")


def resolve_occurred_at(text: str | None, published_at: str) -> tuple[str | None, str]:
    """(occurredAt ISO 8601 또는 None, 로그용 메모)."""
    if not text or not text.strip():
        return None, "시점 표현 없음"
    pub = parse_published(published_at)
    try:
        y, mo, d = _date(text, pub)
        hm = _clock(text) or (0, 0)
        at = datetime(y, mo, d, hm[0], hm[1], tzinfo=KST)
    except _Unresolved as e:
        return None, str(e)
    except ValueError:
        return None, "없는 날짜"
    late = at.date() > pub.date() if hm == (0, 0) else at > pub
    if late:
        return None, f"{at.isoformat()} 가 발행 시각보다 뒤"
    return at.isoformat(), "날짜까지" if hm == (0, 0) else "시각까지"
