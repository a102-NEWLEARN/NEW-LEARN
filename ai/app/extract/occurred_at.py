"""대표 잎의 시점 표현(eventTimeText) → occurredAt (api-internal.md 5절 EXTRACT 결과).

- 시각까지 있으면 시각까지, 날짜까지만 있으면 그날 0시 +09:00
- 「지난 6일」 · 「어제」 같은 상대 날짜는 메시지의 publishedAt 기준. 연도가 바뀌는 경우도 푼다
- 「현지시간 6일」 · 「(현지시각)」은 한국 시간으로 옮기지 않고 적힌 날짜 그대로, 시각은 버린다(현지 시각에 +09:00 을 붙이면 틀린다)
- 「17일(현지시각) 기준 전날」처럼 기준 날짜가 함께 오면 그 날짜에서 하루 앞뒤로 푼다
- 날짜 없이 시각만 있으면(속보의 「오전 9시 47분」) 발행일의 그 시각. 「다음날 · 그날 · 당시」가 붙으면 기준을 몰라 null
- 「지난달」 · 「올해 초」처럼 날짜보다 흐리거나 못 뽑으면 null (API 가 첫 기사 발행 시각으로 채운다)
- 이미 일어난 일인데 발행 시각보다 뒤로 계산되거나, 「오는 28일」 · 「내일」처럼 앞일 표현이면 null
- 연도 없는 날짜는 발행 달보다 6달 넘게 뒤일 때만 지난해로 본다(1월 기사의 「12월 28일」)
- publishedAt 에 시간대가 붙어 오면(NewsData 의 UTC) 한국 시간으로 바꾼 뒤 「오늘 · 어제」를 푼다
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
_LOCAL = re.compile(r"\(?현지\s*(?:시간|시각)\)?")
_REL_ANCHOR = re.compile(r"전날|이튿날|다음\s*날")
_ANCHORED = re.compile(r"다음\s*날|이튿날|그날|당일|당시")
# 대표 사건은 이미 일어난 행위다. 앞일을 가리키는 표현은 날짜를 풀지 않는다
_FUTURE = re.compile(r"오는|다음\s*(?:달|주)|내달|내주|내일|모레|내년|예정")
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
    """publishedAt(ISO 8601). 시간대가 없으면 한국 시간으로 보고, 있으면 한국 시간으로 바꾼다."""
    s = s.strip()
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M")
    return dt.astimezone(KST) if dt.tzinfo else dt.replace(tzinfo=KST)


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


def _year_of(month: int, pub: datetime) -> int:
    # 발행 달보다 6달 넘게 뒤인 달이면 지난해(1월 기사의 '12월 28일'). 가까운 뒤 달은 올해로 두어
    # 발행 뒤 날짜 검사에서 null 이 되게 한다(10월 기사의 '11월 2일'을 지난해로 돌리지 않는다)
    return pub.year - (month - pub.month > 6)


def _date(text: str, pub: datetime) -> tuple[int, int, int]:
    """(연, 월, 일). 못 풀거나 흐리거나 앞일이면 _Unresolved."""
    t = _LOCAL.sub("", text)
    if _FUTURE.search(t):
        raise _Unresolved("앞일 표현")
    # 기준 날짜 없는 「전날」은 아래에서 발행일 기준, 「이튿날 · 다음날」은 기준을 몰라 풀지 않는다
    rel = _REL_ANCHOR.search(t)
    base = _REL_ANCHOR.sub(" ", t).replace("기준", " ")
    if rel and (_MD.search(base) or _D.search(base) or _SLASH.search(base)):
        y, mo, d = _date(base, pub)
        day = datetime(y, mo, d) + timedelta(days=-1 if rel[0] == "전날" else 1)
        return day.year, day.month, day.day
    md = list(_MD.finditer(t))
    days = list(_D.finditer(_MD.sub(" ", t)))
    slash = list(_SLASH.finditer(t))
    if len(md) + len(days) + len(slash) > 1:
        raise _Unresolved("날짜가 둘 이상")
    if md:
        m = md[0]
        if m[1]:
            y = int(m[1])
        elif re.search("지난해|작년", t):
            y = pub.year - 1
        else:
            y = _year_of(int(m[2]), pub)
        return y, int(m[2]), int(m[3])
    if slash:
        mo, d = int(slash[0][1]), int(slash[0][2])
        return _year_of(mo, pub), mo, d
    if days:
        d = int(days[0][1])
        if "지난달" in t:
            y, mo = _shift_month(pub.year, pub.month, -1)
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
    if _FUZZY.search(t):
        raise _Unresolved("흐린 표현")
    if _clock(t) and not _ANCHORED.search(t):
        return pub.year, pub.month, pub.day
    raise _Unresolved("날짜 없음")


def resolve_occurred_at(text: str | None, published_at: str) -> tuple[str | None, str]:
    """(occurredAt ISO 8601 또는 None, 로그용 메모)."""
    if not text or not text.strip():
        return None, "시점 표현 없음"
    pub = parse_published(published_at)
    try:
        y, mo, d = _date(text, pub)
        hm = (0, 0) if _LOCAL.search(text) else (_clock(text) or (0, 0))
        at = datetime(y, mo, d, hm[0], hm[1], tzinfo=KST)
    except _Unresolved as e:
        return None, str(e)
    except ValueError:
        return None, "없는 날짜"
    late = at.date() > pub.date() if hm == (0, 0) else at > pub
    if late:
        return None, f"{at.isoformat()} 가 발행 시각보다 뒤"
    return at.isoformat(), "날짜까지" if hm == (0, 0) else "시각까지"
