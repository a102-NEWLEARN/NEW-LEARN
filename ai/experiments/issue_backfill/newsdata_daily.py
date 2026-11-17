"""NewsData 기사를 한국 날짜(KST 00:00~24:00) 하루 단위로 받는다 (2026-11-04 팀 수집 계획).

- 48시간이 지난 날은 archive(요청당 5크레딧)로 받는다. 하루를 1시간 칸 24개로 나눠 칸마다 첫 쪽을 받고, 첫 쪽의
  totalResults 로 칸별 기사 수를 안 뒤 하루 목표(7,000건)를 칸의 기사 비율대로 나눠 나머지 쪽을 받는다.
  최신순으로 7,000건에서 자르면 밤 기사만 남는다. 목표보다 적은 날(주말)은 다 받는다
- 지난 하루는 latest(요청당 1크레딧)로 다 받는다. timeframe 은 '그날 00:00부터 지금까지 분 + 여유'로 매번 계산한다.
  36시간으로 고정하면 낮 12시 넘어 다시 받을 때 그날 새벽이 빠진다. 2,880분(48시간)이 지나면 latest 로는 못 받는다
- 요청마다 requests 표에 남긴다(성공 · 실패, 크레딧, 받은 건수). 15분에 1,800크레딧(유료 요금제 한도)을 넘지 않게 기다린다
- archive 는 칸마다 어디까지 받았는지 남겨, 같은 날을 다시 돌리면 이어 받는다
"""

import math
import time
from datetime import datetime, timedelta

try:
    from . import newsdata_fetch as nd
except ImportError:  # 노트북에서는 모듈을 옆에 풀어 바로 import 한다
    import newsdata_fetch as nd

TARGET = 7000
RATE_LIMIT, RATE_WINDOW = 1800, 900
LATEST_MAX_MINUTES = 2880
MARGIN_MINUTES = 15

SCHEMA = """
CREATE TABLE IF NOT EXISTS requests(
    at TEXT NOT NULL, endpoint TEXT NOT NULL, day TEXT NOT NULL, label TEXT NOT NULL,
    status INTEGER NOT NULL, credits INTEGER NOT NULL, received INTEGER NOT NULL,
    in_day INTEGER NOT NULL, inserted INTEGER NOT NULL, total INTEGER, message TEXT);
CREATE TABLE IF NOT EXISTS archive_hours(
    day TEXT NOT NULL, hour INTEGER NOT NULL, total INTEGER, quota INTEGER,
    got INTEGER NOT NULL, next_page TEXT, PRIMARY KEY(day, hour));
"""


class BudgetReached(RuntimeError):
    """이번 실행 크레딧 상한에 닿았다. 다시 돌리면 이어 받는다."""


class WindowMismatch(RuntimeError):
    """archive 가 돌려준 기사 시각이 요청한 칸 밖이다. from_date · to_date 를 다르게 읽는 것이라 멈춘다."""


class TooLateForLatest(ValueError):
    """그날 00:00 이 48시간보다 앞이라 latest 로는 못 받는다."""


def now_text():
    return datetime.now(nd.KST).strftime(nd.TIME_FORMAT)


def day_bounds(day):
    """한국 날짜 → ('YYYY-MM-DD 00:00:00', 다음 날 00:00:00). 저장된 published 와 같은 꼴이다."""
    nxt = day + timedelta(days=1)
    return f"{day.isoformat()} 00:00:00", f"{nxt.isoformat()} 00:00:00"


def hour_window_utc(day, hour):
    """한국 시각 hour:00:00 ~ hour:59:59 를 archive 의 from_date · to_date(UTC)로."""
    start = datetime(day.year, day.month, day.day, hour, tzinfo=nd.KST)
    end = start + timedelta(minutes=59, seconds=59)
    return tuple(t.astimezone(nd.UTC_TZ).strftime(nd.TIME_FORMAT) for t in (start, end))


def allocate(counts, target):
    """칸별 기사 수 → 칸별 몫. 합이 목표 이하면 전부, 넘으면 비율대로 나누고 나머지가 큰 칸부터 1씩 더해 합을 맞춘다."""
    total = sum(counts)
    if total <= target:
        return list(counts)
    shares = [target * c / total for c in counts]
    quota = [math.floor(s) for s in shares]
    order = sorted(range(len(shares)), key=lambda k: quota[k] - shares[k])
    for k in order[: target - sum(quota)]:
        quota[k] += 1
    return quota


class Meter:
    """요청을 보내고 requests 표에 남긴다. 이번 실행 상한(budget, 크레딧)과 15분 한도를 지킨다."""

    def __init__(
        self,
        conn,
        api_key,
        budget,
        *,
        fetch=nd.request_page,
        clock=time.time,
        sleep=time.sleep,
        log=print,
        limit=RATE_LIMIT,
        window=RATE_WINDOW,
    ):
        conn.executescript(SCHEMA)
        self.conn, self.api_key, self.budget = conn, api_key, budget
        self.fetch, self.clock, self.sleep, self.log = fetch, clock, sleep, log
        self.limit, self.window = limit, window
        self.used = 0
        self.recent = []  # (보낸 시각, 크레딧)

    def _wait_for_room(self, cost):
        now = self.clock()
        self.recent = [(t, c) for t, c in self.recent if now - t < self.window]
        over = sum(c for _, c in self.recent) + cost - self.limit
        if over <= 0:
            return
        freed, until = 0, now
        for t, c in self.recent:
            freed, until = freed + c, t + self.window
            if freed >= over:
                break
        pause = max(0.0, until - now) + 1
        # 한 번 닿은 뒤에는 오래된 요청이 하나씩 빠질 때마다 1~2초씩 기다린다. 그때마다 찍으면 출력이 넘친다
        if pause >= 10:
            self.log(f"15분 한도 {self.limit:,}크레딧에 닿아 {pause:.0f}초 기다립니다")
        self.sleep(pause)
        now = self.clock()
        self.recent = [(t, c) for t, c in self.recent if now - t < self.window]

    def _row(self, endpoint, day, label, status, credits, **kw):
        self.conn.execute(
            "INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (
                now_text(),
                endpoint,
                day,
                label,
                status,
                credits,
                kw.get("received", 0),
                kw.get("in_day", 0),
                kw.get("inserted", 0),
                kw.get("total"),
                kw.get("message"),
            ),
        )
        self.conn.commit()

    def __call__(self, endpoint, params, *, day, label, start=None, end=None):
        """한 쪽 → {'payload', 'rows'(normalize 한 행), 'inserted', 'in_day'}. 기사는 바로 저장한다."""
        cost = nd.CREDIT_COST[endpoint]
        if self.used + cost > self.budget:
            raise BudgetReached(
                f"이번 실행 크레딧 상한 {self.budget:,}에 닿았습니다(쓴 크레딧 {self.used:,})"
            )
        self._wait_for_room(cost)
        failures = []
        try:
            payload = self.fetch(
                endpoint,
                params,
                self.api_key,
                log=self.log,
                on_error=lambda status, message: failures.append((status, message)),
            )
        finally:
            for status, message in failures:
                self._row(endpoint, day, label, status, 0, message=message[:200])
        self.used += cost
        self.recent.append((self.clock(), cost))
        results = payload.get("results") or []
        rows = [r for r in (nd.normalize(x, now_text()) for x in results) if r]
        in_day = sum(1 for r in rows if start and start <= r[5] < end)
        inserted = nd.store_rows(self.conn, rows)
        total = payload.get("totalResults")
        self._row(
            endpoint,
            day,
            label,
            200,
            cost,
            received=len(results),
            in_day=in_day,
            inserted=inserted,
            total=total if isinstance(total, int) else None,
        )
        return {
            "payload": payload,
            "rows": rows,
            "inserted": inserted,
            "in_day": in_day,
        }


def _check_window(rows, day, hour):
    lo, hi = (
        f"{day.isoformat()} {hour:02d}:00:00",
        f"{day.isoformat()} {hour:02d}:59:59",
    )
    outside = [r[5] for r in rows if not lo <= r[5] <= hi]
    if rows and len(outside) > len(rows) // 10:
        raise WindowMismatch(
            f"{lo}~{hi} 칸을 요청했는데 {len(outside)}/{len(rows)}건이 칸 밖이다(예: {outside[0]})"
        )


def fetch_archive_day(
    conn, meter, query, day, *, target=TARGET, page_size=50, log=print
):
    """한국 날짜 하루를 archive 로 받는다. 칸마다 첫 쪽 → 칸별 몫 → 몫만큼 나머지 쪽."""
    conn.executescript(SCHEMA)
    key = day.isoformat()
    start, end = day_bounds(day)

    def ask(hour, page=None):
        lo, hi = hour_window_utc(day, hour)
        params = {**query, "from_date": lo, "to_date": hi, "size": page_size}
        if page:
            params["page"] = page
        label = f"h{hour:02d} " + ("p1" if page is None else "next")
        return meter("archive", params, day=key, label=label, start=start, end=end)

    done = {
        h for (h,) in conn.execute("SELECT hour FROM archive_hours WHERE day=?", (key,))
    }
    for hour in range(24):
        if hour in done:
            continue
        page = ask(hour)
        total = page["payload"].get("totalResults")
        if not isinstance(total, int):
            raise nd.NewsDataError(
                0,
                "NoTotal",
                "archive 응답에 totalResults 가 없어 칸별 몫을 못 정합니다",
            )
        _check_window(page["rows"], day, hour)
        got = len(page["payload"].get("results") or [])
        conn.execute(
            "INSERT INTO archive_hours VALUES(?,?,?,?,?,?)",
            (key, hour, total, None, got, page["payload"].get("nextPage")),
        )
        conn.commit()

    hours = conn.execute(
        "SELECT hour, total, got, next_page FROM archive_hours WHERE day=? ORDER BY hour",
        (key,),
    ).fetchall()
    quotas = allocate([total for _, total, _, _ in hours], target)
    for (hour, _, got, next_page), quota in zip(hours, quotas, strict=True):
        conn.execute(
            "UPDATE archive_hours SET quota=? WHERE day=? AND hour=?",
            (quota, key, hour),
        )
        conn.commit()
        while got < quota and next_page:
            page = ask(hour, next_page)
            got += len(page["payload"].get("results") or [])
            next_page = page["payload"].get("nextPage") or None
            conn.execute(
                "UPDATE archive_hours SET got=?, next_page=? WHERE day=? AND hour=?",
                (got, next_page, key, hour),
            )
            conn.commit()

    final = conn.execute(
        "SELECT hour, total, quota, got, next_page FROM archive_hours WHERE day=? ORDER BY hour",
        (key,),
    ).fetchall()
    short = [h for h, _, quota, got, nxt in final if got < quota and not nxt]
    result = {
        "day": key,
        "total": sum(r[1] for r in final),
        "quota": sum(r[2] for r in final),
        "got": sum(r[3] for r in final),
        "short_hours": short,
    }
    log(
        f"{key} archive: 그날 기사 {result['total']:,}건 중 몫 {result['quota']:,} · 받음 {result['got']:,}"
        + (f" · 몫보다 덜 나온 칸 {short}" if short else "")
    )
    return result


def latest_timeframe(day, now, margin=MARGIN_MINUTES):
    """그날 00:00(한국)부터 지금까지 분 + 여유. 48시간(2,880분)을 넘으면 latest 로는 못 받는다."""
    start = datetime(day.year, day.month, day.day, tzinfo=nd.KST)
    elapsed = math.ceil((now - start).total_seconds() / 60)
    if elapsed > LATEST_MAX_MINUTES:
        raise TooLateForLatest(
            f"{day} 00:00 이 {elapsed:,}분 전이라 latest(최대 2,880분)로는 못 받습니다. archive 로 받으세요"
        )
    return min(elapsed + margin, LATEST_MAX_MINUTES)


def _ascending(rows, start):
    times = [r[5] for r in rows]
    first_ok = not times or times[0] <= _shift(start, minutes=60)
    return times == sorted(times) and first_ok


def _shift(text, **delta):
    moment = datetime.strptime(text, nd.TIME_FORMAT) + timedelta(**delta)
    return moment.strftime(nd.TIME_FORMAT)


def fetch_latest_day(
    conn, meter, query, day, now, *, page_size=50, order="asc", log=print
):
    """한국 날짜 하루를 latest 로 다 받는다.

    order="asc" 면 sort=pubdateasc 로 그날 00:00 부터 읽어 다음 날 00:00 을 넘으면 멈춘다(오늘 아침 기사를 넘겨 가지
    않아도 된다). 첫 쪽이 오래된 순이 아니면 sort 가 안 먹는 것이라 최신순(desc)으로 처음부터 다시 받는다.
    최신순은 그날 00:00 보다 이른 기사가 나오거나 쪽이 끝나면 멈춘다.
    """
    key = day.isoformat()
    start, end = day_bounds(day)
    minutes = latest_timeframe(day, now)
    base = {**query, "timeframe": f"{minutes}m", "size": page_size}
    if order == "asc":
        base["sort"] = "pubdateasc"
    next_page, pages, oldest, newest = None, 0, None, None
    reached_start = reached_end = False
    while True:
        params = dict(base)
        if next_page:
            params["page"] = next_page
        page = meter(
            "latest",
            params,
            day=key,
            label=f"{order} p{pages + 1}",
            start=start,
            end=end,
        )
        pages += 1
        rows = page["rows"]
        if order == "asc" and pages == 1 and not _ascending(rows, start):
            log(
                "latest 가 sort=pubdateasc 를 따르지 않아 최신순으로 처음부터 다시 받습니다"
            )
            result = fetch_latest_day(
                conn, meter, query, day, now, page_size=page_size, order="desc", log=log
            )
            result["pages"] += pages
            return result
        if rows:
            low, high = min(r[5] for r in rows), max(r[5] for r in rows)
            oldest = low if oldest is None else min(oldest, low)
            newest = high if newest is None else max(newest, high)
        next_page = page["payload"].get("nextPage") or None
        exhausted = not next_page or not rows
        if order == "asc" and (exhausted or (newest and newest >= end)):
            reached_end = bool(newest and newest >= end) or exhausted
            reached_start = oldest is None or oldest <= _shift(start, minutes=30)
            break
        if order == "desc" and (exhausted or (oldest and oldest < start)):
            reached_start, reached_end = True, True
            break
    result = {
        "day": key,
        "order": order,
        "timeframe": minutes,
        "pages": pages,
        "oldest": oldest,
        "newest": newest,
        "reached_start": reached_start,
        "reached_end": reached_end,
    }
    log(
        f"{key} latest({order}, timeframe {minutes}분): {pages}쪽 · 가장 이른 {oldest} · 가장 늦은 {newest}"
    )
    return result


def hour_counts(conn, day):
    """그날 저장된 기사의 시간별 건수 24칸. 0 인 칸은 빈 구간이다."""
    start, end = day_bounds(day)
    counts = dict(
        conn.execute(
            "SELECT CAST(substr(published, 12, 2) AS INTEGER), COUNT(*) FROM articles "
            "WHERE published >= ? AND published < ? GROUP BY 1",
            (start, end),
        ).fetchall()
    )
    return [counts.get(h, 0) for h in range(24)]
