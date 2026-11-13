"""NewsData.io 기사를 SQLite 한 파일에 모은다.

- 키는 부르는 쪽(환경변수 · getpass)이 넘기고 머리(X-ACCESS-KEY)로만 보낸다. 주소 · 로그 · 파일에 남기지 않는다
- 크레딧은 요청마다 빠진다. latest 는 1, archive 는 5다(공식 문서 'How API credits get consumed').
  과거 기사(archive)는 최근 날부터 하루씩 받는다. 크레딧이 모자라도 최근 기간이 먼저 찬다
- 하루를 다 받으면 표시해 두고, 중간에 멈춘 날은 다음 쪽 표시(nextPage)부터 잇는다. 같은 조건으로 다시 돌리면 크레딧을 다시 쓰지 않는다
- 발행 시각은 한국 시간으로 바꿔 'YYYY-MM-DD HH:MM:SS' 로 저장한다(NewsData 의 pubDate 는 UTC)
"""

import hashlib
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_URL = "https://newsdata.io/api/1"
UTC_TZ = timezone(timedelta(0), "UTC")
KST = timezone(timedelta(hours=9), "KST")
PAID_ONLY = "ONLY AVAILABLE IN PAID"
TIME_FORMAT = "%Y-%m-%d %H:%M:%S"
CREDIT_COST = {"latest": 1, "archive": 5}

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles(
    article_id TEXT PRIMARY KEY, link TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    description TEXT NOT NULL, content TEXT NOT NULL, published TEXT NOT NULL,
    source_id TEXT NOT NULL, source_name TEXT NOT NULL, category TEXT NOT NULL,
    fetched_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS articles_published ON articles(published);
CREATE TABLE IF NOT EXISTS archive_days(
    query TEXT NOT NULL, day TEXT NOT NULL, next_page TEXT, done INTEGER NOT NULL,
    requests INTEGER NOT NULL, received INTEGER NOT NULL, PRIMARY KEY(query, day));
"""


class NewsDataError(RuntimeError):
    def __init__(self, status, code, message):
        super().__init__(f"NewsData HTTP {status} {code}: {message}")
        self.status, self.code, self.message = status, code, message


class CreditsExhausted(NewsDataError):
    """하루 · 달 크레딧을 다 썼다. 기다려도 풀리지 않으니 멈춘다."""


def open_store(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    return conn


def _clean(value):
    if not isinstance(value, str):
        return ""
    value = re.sub(r"\s+", " ", value).strip()
    return "" if PAID_ONLY in value.upper() else value


def to_kst(value, tz_name="UTC"):
    """NewsData pubDate('YYYY-MM-DD HH:MM:SS') → 한국 시간 문자열. 읽지 못하면 None."""
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.strptime(value.strip()[:19], TIME_FORMAT)
    except ValueError:
        return None
    if tz_name and str(tz_name).upper() not in ("UTC", "GMT", "Z"):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        # 튜플 상수로 둔다. `except A, B:` 는 3.14 문법이라 서버 커널(3.13 이하)에서 읽히지 않는다
        zone_errors = (ZoneInfoNotFoundError, ValueError)
        try:
            source = ZoneInfo(str(tz_name))
        except zone_errors:
            return None
    else:
        source = UTC_TZ
    return moment.replace(tzinfo=source).astimezone(KST).strftime(TIME_FORMAT)


def normalize(raw, fetched_at):
    """응답 기사 하나 → 저장할 행. 제목 · 링크 · 시각이 없거나 NewsData 가 중복이라 한 기사는 None."""
    if not isinstance(raw, dict) or raw.get("duplicate") is True:
        return None
    title, link = _clean(raw.get("title")), _clean(raw.get("link"))
    published = to_kst(raw.get("pubDate"), raw.get("pubDateTZ") or "UTC")
    if not title or not link or published is None:
        return None
    article_id = (
        _clean(raw.get("article_id")) or hashlib.sha1(link.encode()).hexdigest()
    )
    categories = raw.get("category") if isinstance(raw.get("category"), list) else []
    return (
        article_id,
        link,
        title,
        _clean(raw.get("description")),
        _clean(raw.get("content")),
        published,
        _clean(raw.get("source_id")),
        _clean(raw.get("source_name")) or _clean(raw.get("source_id")),
        ",".join(c for c in categories if isinstance(c, str)),
        fetched_at,
    )


def store_page(conn, results, fetched_at):
    rows = [row for row in (normalize(raw, fetched_at) for raw in results or []) if row]
    return store_rows(conn, rows)


def store_rows(conn, rows):
    """normalize 한 행을 넣는다. article_id · 링크가 이미 있으면 넣지 않는다. 새로 들어간 수를 돌려준다."""
    before = conn.total_changes
    conn.executemany("INSERT OR IGNORE INTO articles VALUES(?,?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    return conn.total_changes - before


def _call(opener, request):
    try:
        with opener(request, timeout=60) as response:
            return response.status, json.load(response), None
    except urllib.error.HTTPError as error:
        try:
            payload = json.load(error)
        except ValueError:
            payload = {}
        retry_after = error.headers.get("Retry-After") if error.headers else None
        return error.code, payload if isinstance(payload, dict) else {}, retry_after


def request_page(
    endpoint,
    params,
    api_key,
    *,
    opener=urllib.request.urlopen,
    sleep=time.sleep,
    max_wait=1800,
    log=print,
    on_error=None,
):
    """한 쪽을 받는다. 분당 한도(429)는 기다리고, 크레딧 소진은 CreditsExhausted 로 멈춘다.

    on_error(status, message): 실패한 시도마다 부른다(실패 요청도 크레딧이 빠지는지 대시보드와 맞춰 보려고 센다).
    """
    note = on_error or (lambda status, message: None)
    url = f"{BASE_URL}/{endpoint}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url, headers={"X-ACCESS-KEY": api_key, "Accept": "application/json"}
    )
    waited, failures = 0, 0
    while True:
        try:
            status, payload, retry_after = _call(opener, request)
        except (
            urllib.error.URLError,
            TimeoutError,
            ConnectionError,
            ValueError,
        ) as error:
            note(0, str(error))
            failures += 1
            if failures > 4:
                raise NewsDataError(0, "Network", str(error)) from None
            sleep(5 * failures)
            continue
        if status == 200 and payload.get("status") == "success":
            return payload
        info = (
            payload.get("results") if isinstance(payload.get("results"), dict) else {}
        )
        code = str(info.get("code") or payload.get("code") or "")
        message = str(info.get("message") or payload.get("message") or "")
        note(status, message)
        lowered = message.lower()
        if status == 429 or "ratelimit" in code.lower():
            if any(word in lowered for word in ("daily", "monthly", "credit", "quota")):
                raise CreditsExhausted(status, code, message)
            wait = int(retry_after) if str(retry_after or "").isdigit() else 60
            if waited + wait > max_wait:
                raise NewsDataError(
                    status, code, f"{waited}초 기다려도 한도가 풀리지 않음: {message}"
                )
            log(f"요청 한도(429). {wait}초 기다립니다. {message}")
            sleep(wait)
            waited += wait
            continue
        if status >= 500:
            failures += 1
            if failures > 4:
                raise NewsDataError(status, code, message)
            sleep(5 * failures)
            continue
        raise NewsDataError(status, code, message)


def archive_days(now, days):
    """창(now-days ~ now, 한국 시간)을 덮는 UTC 날짜, 최근 날부터."""
    end = now.astimezone(UTC_TZ).date()
    start = (now - timedelta(days=days)).astimezone(UTC_TZ).date()
    return [end - timedelta(days=offset) for offset in range((end - start).days + 1)]


def query_key(query, page_size):
    return json.dumps({**query, "size": page_size}, sort_keys=True, ensure_ascii=False)


def fetch_archive(
    conn, api_key, query, days, budget, *, page_size=None, fetch=request_page, log=print
):
    """날마다 끝까지 받는다. budget(크레딧)을 다 쓰면 그 자리에서 멈추고 다음 실행이 잇는다."""
    key = query_key(query, page_size)
    cost = CREDIT_COST["archive"]
    used, inserted, finished = 0, 0, []
    for day in days:
        row = conn.execute(
            "SELECT next_page, done, requests, received FROM archive_days WHERE query=? AND day=?",
            (key, day.isoformat()),
        ).fetchone()
        next_page, done, requests, received = row or (None, 0, 0, 0)
        if done:
            continue
        while used + cost <= budget:
            params = {**query, "from_date": day.isoformat(), "to_date": day.isoformat()}
            if page_size:
                params["size"] = page_size
            if next_page:
                params["page"] = next_page
            payload = fetch("archive", params, api_key, log=log)
            used += cost
            results = payload.get("results") or []
            inserted += store_page(
                conn, results, datetime.now(KST).strftime(TIME_FORMAT)
            )
            requests, received = requests + 1, received + len(results)
            next_page = payload.get("nextPage") or None
            done = int(next_page is None or not results)
            conn.execute(
                "INSERT OR REPLACE INTO archive_days VALUES(?,?,?,?,?,?)",
                (key, day.isoformat(), next_page, done, requests, received),
            )
            conn.commit()
            if done:
                finished.append((day, requests, received))
                left = sum(1 for d in days if d < day)
                per_day = sum(r for _, r, _ in finished) / len(finished)
                log(
                    f"{day} 완료: 요청 {requests}번 · 기사 {received}건. 남은 {left}일 예상 약 {per_day * left * cost:,.0f} 크레딧"
                )
                break
        if used + cost > budget:
            log(
                f"이번 실행 크레딧 상한 {budget}에 닿아 멈춥니다. 다시 실행하면 {day}부터 잇습니다."
            )
            break
    return {"credits": used, "inserted": inserted, "finished_days": len(finished)}


def fetch_latest(
    conn, api_key, query, budget, *, page_size=None, fetch=request_page, log=print
):
    """최근 기사. 새로 들어온 것이 없는 쪽을 만나면 그 뒤는 이미 받은 기사라 멈춘다."""
    used, inserted, next_page = 0, 0, None
    while used < budget:
        params = dict(query)
        if page_size:
            params["size"] = page_size
        if next_page:
            params["page"] = next_page
        payload = fetch("latest", params, api_key, log=log)
        used += 1
        results = payload.get("results") or []
        added = store_page(conn, results, datetime.now(KST).strftime(TIME_FORMAT))
        inserted += added
        next_page = payload.get("nextPage") or None
        if not next_page or not results or added == 0:
            break
    return {"credits": used, "inserted": inserted}


def collect(
    db_path,
    api_key,
    query,
    *,
    days=90,
    mode="auto",
    max_credits=2000,
    page_size=None,
    now=None,
    fetch=request_page,
    log=print,
):
    """mode: archive(과거 기사, 유료) · latest(최근 48시간) · auto(archive 가 막히면 latest).

    archive 를 쓴 뒤에도 latest 를 한 번 더 불러 마지막 몇 시간을 채운다(새 기사가 없으면 1크레딧).
    """
    if mode not in ("auto", "archive", "latest"):
        raise ValueError("mode 는 auto · archive · latest 중 하나")
    if not api_key:
        raise ValueError(
            "NewsData 키가 비었습니다. 환경변수 NEWSDATA_API_KEY 나 입력창으로 넣으세요."
        )
    now = now or datetime.now(KST)
    report = {"mode": mode, "credits": 0, "inserted": 0}
    with open_store(db_path) as conn:
        if mode in ("auto", "archive"):
            try:
                result = fetch_archive(
                    conn,
                    api_key,
                    query,
                    archive_days(now, days),
                    max_credits,
                    page_size=page_size,
                    fetch=fetch,
                    log=log,
                )
                report.update(
                    mode="archive",
                    credits=result["credits"],
                    inserted=result["inserted"],
                )
            except CreditsExhausted:
                raise
            except NewsDataError as error:
                if mode == "archive" or error.status in (0, 401):
                    raise
                log(
                    f"과거 기사(archive)를 못 받습니다 — {error.message}. 최근 기사(latest)만 받습니다."
                )
                report["mode"] = "latest"
        left = max_credits - report["credits"]
        if left > 0:
            result = fetch_latest(
                conn, api_key, query, left, page_size=page_size, fetch=fetch, log=log
            )
            report["credits"] += result["credits"]
            report["inserted"] += result["inserted"]
        start = (now - timedelta(days=days)).strftime(TIME_FORMAT)
        report["window_start"] = start
        report["by_day"] = conn.execute(
            "SELECT substr(published,1,10) AS day, COUNT(*) FROM articles WHERE published>=? "
            "GROUP BY day ORDER BY day",
            (start,),
        ).fetchall()
        report["stored"] = sum(n for _, n in report["by_day"])
    return report
