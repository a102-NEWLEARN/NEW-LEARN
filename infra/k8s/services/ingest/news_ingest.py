"""뉴스 수집 배치 — NewsData 기사 → B2 기사 적재 → (full 이면) B1 분석 걸기 (Jira S15P31A102-154 · 156)

CronJob news-ingest(옆의 news-ingest.yaml)가 ConfigMap 으로 얹어 돌린다. 계약은 docs/api-internal.md 2절,
정한 것과 까닭은 docs/plans/2026-11-03-news-ingest-batch.md · 2026-11-04-ingest-load-only-data-load.md,
설정 표 · 손으로 돌리는 법 · 로그 읽는 법은 infra/server/ingest.md

- INGEST_MODE=fetch-only — NewsData 요청 하나만 보내고 받은 수 · 거른 수 · 처음 몇 건의 B2 요청 모양을 찍는다(B2 · B1 안 부름)
- INGEST_MODE=load-only — 걸러 남은 기사를 발행 순서대로 B2 로 넣기만 한다(B1 안 부름 — AI 결과 덤프가 들어갈 때까지)
- INGEST_MODE=full — B2 로 넣고, 돌려받은 id 로 B1 을 부른다
- 무엇을 받나: INGEST_SOURCE(latest · archive) · INGEST_TIMEFRAME · INGEST_ARCHIVE_FROM/TO · INGEST_QUERY(고르는 조건),
  INGEST_DAYS(발행 시각의 KST 날짜로 거르기) · INGEST_REQUEST_INTERVAL(요청 사이 쉬기). 뜻과 값은 ingest.md 「설정」
- 상한: INGEST_MAX_ARTICLES(B2 로 보낼 기사) · INGEST_MAX_REQUESTS(NewsData 요청)
- 키: NEWSDATA_API_KEY(봉인 Secret newsdata-api) · INTERNAL_BATCH_KEY(internal-api 의 배치 키, load-only · full)

로그는 줄마다 JSON 하나이고 키는 모두 *** 로 가린다. 끝에 {"msg": "수집 결과", …} 한 줄
종료 코드 0 · 1 · 2 의 뜻은 infra/server/ingest.md 「로그 읽기」의 표 — CronJob 은 2(다시 해도 같음)면 다시 시도하지 않는다

표준 라이브러리만 쓴다 — 공개 Python 이미지에 이 파일만 얹는다. 불러올 때는 env 를 읽지 않는다(시험이 main 에 넘긴다)
"""

import http.client
import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

NEWSDATA_API = "https://newsdata.io/api/1/"
# 요청마다 깎이는 크레딧 — NewsData 「API credit usage」 문서(2026-11-04 확인)
SOURCES = {"latest": 1, "archive": 5}
# INGEST_QUERY 가 비면 — 11-03 에 통한 질의 그대로. 고르는 조건(분야 · 언론사)을 받으면 news-ingest.yaml 에서 바꾼다
DEFAULT_QUERY = "country=kr&language=ko"
# INGEST_QUERY 에 받는 키 — 키 · 쪽 · 기간 · 시간대는 스크립트가 정하고(시간대가 바뀌면 pubDate 를 UTC 로 못 읽는다), 모르는 키는 오타로 본다
QUERY_KEYS = frozenset({
    "country", "language", "category", "excludecategory", "domain", "excludedomain", "domainurl", "excludedomainurl",
    "prioritydomain", "q", "qInTitle", "qInMeta", "removeduplicate", "sort",
})
QUERY_MAX_CHARS = 1000
# 배치가 미리 거르는 분류 — 2026-11-03 인프라 담당 결정(docs/api-internal.md 2절)
SKIP_CATEGORIES = frozenset({"entertainment", "sports"})
PUB_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
KST = timezone(timedelta(hours=9))  # 서머타임이 없어 고정 오프셋 — slim 이미지에 시간대 자료가 없어도 된다
REPORTER_MAX = 200  # B2 의 reporter 상한
# 하루 7,000건(팀장 공지 2026-11-03) · archive 한 구간(UTC 이틀 약 280요청, ingest.md)이 여유 있게 들어가게
MAX_ARTICLES_CEILING = 20000
MAX_REQUESTS_CEILING = 500
INTERVAL_CEILING = 60
SAMPLE_COUNT = 3
TIMEOUT_SECONDS = 20
BODY_LOG_CHARS = 300  # 로그에 남길 응답 본문 길이 — 키를 가린 뒤 자른다
# backend 연결이 이어서 이만큼 실패하면 멈춘다 — 정책 실수로 패킷이 버려지면 요청마다 시간 초과라,
# 기사를 다 기다리면 Job 시간 상한에 잘려 결과 줄이 안 남는다
BACKEND_DOWN_AFTER = 3
MODES = ("fetch-only", "load-only", "full")
# 거르는 순서 — 범위 밖(10시 실행의 그날 0 ~ 10시) 기사가 기사 상한을 먹지 않게 out_of_range 가 over_limit 보다 앞이다
SKIP_REASONS = ("bad_item", "no_body", "category", "timezone", "bad_date", "out_of_range", "duplicate", "over_limit")
# 다음 쪽이 남았는데 이 까닭으로 멈추면 빠진 구간이 있다 — 상한이면 받은 데까지 넣고 종료 2
CAPPED = ("max_requests", "max_articles")
CONNECTION_ERRORS = (OSError, http.client.HTTPException)  # urllib.error.URLError · 끊김 · 시간 초과는 OSError
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
ARCHIVE_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?")
TIMEFRAME_RE = re.compile(r"(?P<hours>[1-9]\d?)|(?P<minutes>[1-9]\d{0,3})m")


class ConfigError(Exception):
    """설정이 틀려 시작하지 않는다 — 종료 2"""


class AuthError(Exception):
    """NewsData 나 backend 가 키를 받지 않았다(401 · 403) — 다시 해도 같아 바로 멈춘다. 종료 2"""


class BackendDown(Exception):
    """backend 연결이 이어서 실패했다 — 남은 기사를 보내지 않고 멈춘다. 종료 1"""


def redact(text, secrets):
    """로그로 나갈 글에서 키 값과 apikey=… 를 가린다"""
    for secret in secrets:
        if secret:
            text = text.replace(secret, "***")
    # 역슬래시에서도 멈춘다 — JSON 으로 적은 줄에서 값 뒤 \" 까지 먹으면 줄이 깨진다
    return re.sub(r"apikey=[^&\s\"'\\]+", "apikey=***", text)


def skip_reason(item):
    """B2 를 부르기 전에 거를 까닭. 통과하면 None — 거르는 순서대로 하나만 센다"""
    content = item.get("content")
    if not isinstance(content, str) or not content.strip():
        return "no_body"
    categories = item.get("category")
    if isinstance(categories, list) and SKIP_CATEGORIES.intersection(c for c in categories if isinstance(c, str)):
        return "category"
    if item.get("pubDateTZ") != "UTC":
        return "timezone"
    try:
        datetime.strptime(item.get("pubDate"), PUB_DATE_FORMAT)
    except (TypeError, ValueError):
        return "bad_date"
    return None


def _strings(value):
    """배열이면 글자가 있는 항목만, 배열이 아니면 빈 목록"""
    if not isinstance(value, list):
        return []
    return [v for v in value if isinstance(v, str) and v.strip()]


def to_article(item):
    """NewsData 기사 하나 → B2 요청 본문 (docs/api-internal.md 2절 표). skip_reason 을 지난 기사만 넣는다"""
    published = datetime.strptime(item["pubDate"], PUB_DATE_FORMAT)
    article = {
        "url": item.get("link"),
        "pressSourceId": item.get("source_id"),
        "pressName": item.get("source_name"),
        "title": item.get("title"),
        "body": item.get("content"),
        # pubDate 는 시간대 없이 오고 pubDateTZ 가 UTC 다 — B2 는 오프셋이 있어야 받는다
        "publishedAt": published.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    # creator 는 배열이고 언론사 이름이 들어오기도 한다 — 이어서 상한에서 자른다
    reporter = ", ".join(name.strip() for name in _strings(item.get("creator")))[:REPORTER_MAX].rstrip(", ")
    if reporter:
        article["reporter"] = reporter
    categories = _strings(item.get("category"))
    if categories:
        article["sourceCategories"] = categories
    tags = _strings(item.get("ai_tag"))  # keywords 가 아니다 — keywords 는 자주 비어 온다
    if tags:
        article["sourceTags"] = tags
    return article


def _bounded_int(environ, name, low, ceiling, default=None):
    raw = environ.get(name, "").strip()
    if not raw and default is not None:
        return default
    if not raw.isdigit() or not low <= int(raw) <= ceiling:
        raise ConfigError(f"{name} 는 {low} ~ {ceiling} 의 정수여야 한다 (지금: {raw!r})")
    return int(raw)


def _date(raw, name):
    if not DATE_RE.fullmatch(raw):
        raise ConfigError(f"{name} 의 날짜는 YYYY-MM-DD 여야 한다 (지금: {raw!r})")
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as err:
        raise ConfigError(f"{name} 의 날짜가 없는 날이다 (지금: {raw!r})") from err


def parse_days(raw, now):
    """INGEST_DAYS → (첫날, 끝날) KST 날짜. 비면 None(거르지 않음)"""
    if not raw:
        return None
    if raw == "yesterday":
        day = now.astimezone(KST).date() - timedelta(days=1)
        return day, day
    first, sep, last = raw.partition("..")
    start = _date(first, "INGEST_DAYS")
    end = _date(last, "INGEST_DAYS") if sep else start
    if start > end:
        raise ConfigError(f"INGEST_DAYS 의 범위가 거꾸로다 (지금: {raw!r})")
    return start, end


def parse_timeframe(raw):
    """INGEST_TIMEFRAME → NewsData timeframe 값. 1 ~ 48(시간) 또는 1m ~ 2880m(분), 비면 None"""
    if not raw:
        return None
    found = TIMEFRAME_RE.fullmatch(raw)
    hours = found and found.group("hours")
    minutes = found and found.group("minutes")
    if not (hours and int(hours) <= 48) and not (minutes and int(minutes) <= 2880):
        raise ConfigError(f"INGEST_TIMEFRAME 은 1 ~ 48(시간) 또는 1m ~ 2880m(분)이어야 한다 (지금: {raw!r})")
    return raw


def parse_query(raw):
    """INGEST_QUERY → [(키, 값)]. 받는 키만, 키마다 한 번, 값은 비지 않게"""
    if len(raw) > QUERY_MAX_CHARS:
        raise ConfigError(f"INGEST_QUERY 가 {QUERY_MAX_CHARS}자를 넘는다")
    try:
        pairs = urllib.parse.parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
    except ValueError as err:
        raise ConfigError(f"INGEST_QUERY 는 키=값&키=값 모양이어야 한다 (지금: {raw!r})") from err
    keys = [key for key, _ in pairs]
    bad = sorted({key for key in keys if key not in QUERY_KEYS} | {key for key, value in pairs if not value.strip()})
    if bad or len(keys) != len(set(keys)):
        raise ConfigError(f"INGEST_QUERY 에 받지 않는 키 · 빈 값 · 겹친 키가 있다 — {bad or keys} (받는 키: {' · '.join(sorted(QUERY_KEYS))})")
    return pairs


def parse_archive(environ, source):
    """INGEST_ARCHIVE_FROM/TO → (from_date, to_date) 그대로. archive 에만, 둘 다, 처음 ≤ 끝"""
    raw = [environ.get(name, "").strip() for name in ("INGEST_ARCHIVE_FROM", "INGEST_ARCHIVE_TO")]
    if source != "archive":
        if any(raw):
            raise ConfigError("INGEST_ARCHIVE_FROM/TO 는 INGEST_SOURCE=archive 일 때만 쓴다")
        return None
    stamps = []
    for name, value in zip(("INGEST_ARCHIVE_FROM", "INGEST_ARCHIVE_TO"), raw):
        if not ARCHIVE_DATE_RE.fullmatch(value):
            raise ConfigError(f"{name} 는 YYYY-MM-DD 또는 YYYY-MM-DD HH:MM:SS 여야 한다 (지금: {value!r})")
        try:
            stamps.append(datetime.strptime(value, PUB_DATE_FORMAT if " " in value else "%Y-%m-%d"))
        except ValueError as err:
            raise ConfigError(f"{name} 가 없는 시각이다 (지금: {value!r})") from err
    if " " not in raw[1]:
        stamps[1] += timedelta(days=1, seconds=-1)  # 끝을 날짜로만 주면 그날 끝까지로 견준다
    if stamps[0] > stamps[1]:
        raise ConfigError(f"INGEST_ARCHIVE_FROM 이 INGEST_ARCHIVE_TO 보다 늦다 (지금: {raw})")
    return raw[0], raw[1]


def load_config(environ, now):
    mode = environ.get("INGEST_MODE", "").strip()
    if mode not in MODES:
        raise ConfigError(f"INGEST_MODE 는 {' · '.join(MODES)} 중 하나여야 한다 (지금: {mode!r})")
    source = environ.get("INGEST_SOURCE", "").strip() or "latest"
    if source not in SOURCES:
        raise ConfigError(f"INGEST_SOURCE 는 {' · '.join(SOURCES)} 중 하나여야 한다 (지금: {source!r})")
    config = {
        "mode": mode,
        "source": source,
        "newsdata_key": environ.get("NEWSDATA_API_KEY", "").strip(),
        "max_articles": _bounded_int(environ, "INGEST_MAX_ARTICLES", 1, MAX_ARTICLES_CEILING),
        "max_requests": _bounded_int(environ, "INGEST_MAX_REQUESTS", 1, MAX_REQUESTS_CEILING),
        "interval": _bounded_int(environ, "INGEST_REQUEST_INTERVAL", 0, INTERVAL_CEILING, default=0),
        "timeframe": parse_timeframe(environ.get("INGEST_TIMEFRAME", "").strip()),
        "archive": parse_archive(environ, source),
        "days": parse_days(environ.get("INGEST_DAYS", "").strip(), now),
        "query": parse_query(environ.get("INGEST_QUERY", "").strip() or DEFAULT_QUERY),
        "batch_key": environ.get("INTERNAL_BATCH_KEY", "").strip(),
        "backend": environ.get("BACKEND_URL", "").strip().rstrip("/"),
    }
    if source == "archive" and config["timeframe"]:
        raise ConfigError("INGEST_TIMEFRAME 은 latest 에만 쓴다 — archive 는 INGEST_ARCHIVE_FROM/TO")
    if not config["newsdata_key"]:
        raise ConfigError("NEWSDATA_API_KEY 가 없다 — 봉인 Secret newsdata-api (infra/server/seal-secrets.sh newsdata)")
    if mode != "fetch-only":
        if not config["batch_key"]:
            raise ConfigError("INTERNAL_BATCH_KEY 가 없다 — Secret internal-api")
        if not re.fullmatch(r"https?://[^\s/]+", config["backend"]):
            raise ConfigError(f"BACKEND_URL 은 http(s)://<호스트> 모양이어야 한다 (지금: {config['backend']!r})")
    return config


def _json(body):
    try:
        return json.loads(body)
    except (ValueError, TypeError):
        return None


class Run:
    def __init__(self, config, send, log, sleep):
        self.config = config
        self.send = send
        self.log = log
        self.sleep = sleep
        self.secrets = [config["newsdata_key"], config["batch_key"]]
        self.requests = 0
        self.fetched = 0
        self.pub_dates = None  # 받은 기사 pubDate 의 [최소, 최대] — timeframe · archive 날짜가 생각대로 먹었는지 본다
        self.stopped_by = None
        self.connection_failures = 0  # backend 연결이 이어서 실패한 수
        self.skipped = Counter({reason: 0 for reason in SKIP_REASONS})
        self.b2 = Counter({"created": 0, "existing": 0, "rejected": 0, "failed": 0})
        self.b1 = Counter({"released": 0, "already": 0, "failed": 0, "retried": 0})

    def short(self, body):
        """로그에 남길 응답 본문 — 가린 뒤 자른다. 거꾸로 하면 자르는 자리에 걸친 키의 앞부분이 남는다"""
        text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
        return redact(text, self.secrets)[:BODY_LOG_CHARS]

    def newsdata_url(self, next_page):
        config = self.config
        query = [("apikey", config["newsdata_key"]), *config["query"]]
        if config["timeframe"]:
            query.append(("timeframe", config["timeframe"]))
        if config["archive"]:
            query += [("from_date", config["archive"][0]), ("to_date", config["archive"][1])]
        if next_page:
            query.append(("page", next_page))
        return f"{NEWSDATA_API}{config['source']}?{urllib.parse.urlencode(query)}"

    def note_pub_date(self, item):
        pub = item.get("pubDate")
        if not isinstance(pub, str):
            return
        try:
            datetime.strptime(pub, PUB_DATE_FORMAT)
        except ValueError:
            return
        # 모양이 고정이라 글자 순서 = 시각 순서
        self.pub_dates = [min(self.pub_dates[0], pub), max(self.pub_dates[1], pub)] if self.pub_dates else [pub, pub]

    def out_of_range(self, item):
        days = self.config["days"]
        if days is None:
            return False
        kst_day = (datetime.strptime(item["pubDate"], PUB_DATE_FORMAT) + timedelta(hours=9)).date()
        return not days[0] <= kst_day <= days[1]

    def fetch(self):
        """NewsData 를 상한까지 불러 걸러 남은 기사를 B2 요청 모양으로, 받은 순서대로 돌려준다

        첫 요청부터 실패하면 None. 받은 쪽이 있은 뒤 실패하면 받은 데까지 돌려주고 stopped_by 가 newsdata_error 다
        """
        config = self.config
        limit = 1 if config["mode"] == "fetch-only" else config["max_requests"]
        kept, links, article_ids, next_page = [], set(), set(), None
        while True:
            if self.requests >= limit:
                self.stopped_by = "max_requests"
                break
            if self.requests and config["interval"]:
                self.sleep(config["interval"])
            url = self.newsdata_url(next_page)
            self.log({"msg": "NewsData 요청", "url": url})
            try:
                status, body = self.send("GET", url, {"Accept": "application/json"}, None)
            except CONNECTION_ERRORS as err:
                self.log({"msg": "NewsData 연결 실패", "error": repr(err)})
                self.stopped_by = "newsdata_error"
                return kept if self.requests else None
            self.requests += 1
            if status in (401, 403):
                # 키가 틀렸거나 막혔다(구독이 끝난 뒤도) — 다시 해도 같다. 받은 쪽이 있으면 그것은 넣고 종료 2
                if self.requests == 1:
                    raise AuthError(f"NewsData → {status} {self.short(body)}")
                self.log({"msg": "NewsData 출입증 오류 — 받은 데까지 넣고 멈춘다", "status": status, "body": self.short(body)})
                self.stopped_by = "newsdata_auth"
                return kept
            data = _json(body)
            if status != 200 or not isinstance(data, dict) or data.get("status") != "success" or not isinstance(data.get("results"), list):
                self.log({"msg": "NewsData 실패", "status": status, "body": self.short(body)})
                self.stopped_by = "newsdata_error"
                return kept if self.requests > 1 else None
            if self.requests == 1 and data["results"]:
                first = data["results"][0]
                fields = sorted(first) if isinstance(first, dict) else type(first).__name__
                self.log({"msg": "받은 칸", "totalResults": data.get("totalResults"), "fields": fields})
            for item in data["results"]:
                self.fetched += 1
                if not isinstance(item, dict) or not isinstance(item.get("link"), str):
                    self.skipped["bad_item"] += 1
                    continue
                self.note_pub_date(item)
                article_id = item.get("article_id") if isinstance(item.get("article_id"), str) else None
                reason = skip_reason(item)
                if reason is None and self.out_of_range(item):
                    reason = "out_of_range"
                if reason is None and (item["link"] in links or article_id in article_ids):
                    reason = "duplicate"
                if reason is None and len(kept) >= config["max_articles"]:
                    reason = "over_limit"
                if reason:
                    self.skipped[reason] += 1
                    continue
                links.add(item["link"])
                if article_id:
                    article_ids.add(article_id)
                # 원본은 버리고 B2 요청 모양만 들고 있는다 — 하루 1만 건 안팎이라 메모리를 덜 쓴다
                kept.append(to_article(item))
            next_page = data.get("nextPage")
            if self.skipped["over_limit"] or (next_page and len(kept) >= config["max_articles"]):
                self.stopped_by = "max_articles"
                break
            if not next_page:
                self.stopped_by = "end"
                break
        return kept

    def post(self, path, payload):
        headers = {"Accept": "application/json", "X-Internal-Key": self.config["batch_key"]}
        body = b""  # B1 은 본문이 없다 — 11-02 사람이 건 B1 과 같은 모양(infra/server/ai-worker.md)
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload, ensure_ascii=False).encode()
        status, raw = self.send("POST", self.config["backend"] + path, headers, body)
        self.connection_failures = 0
        if status in (401, 403):
            raise AuthError(f"{path} → {status} {self.short(raw)}")
        return status, raw

    def connection_failed(self):
        """backend 연결 실패를 센다. 이어서 BACKEND_DOWN_AFTER 번이면 True — 부른 쪽이 센 뒤 멈춘다"""
        self.connection_failures += 1
        return self.connection_failures >= BACKEND_DOWN_AFTER

    def load(self, article):
        """B2 로 넣고 기사 번호를 돌려준다. 못 넣으면 None"""
        try:
            status, raw = self.post("/internal/v1/articles", article)
        except CONNECTION_ERRORS as err:
            self.b2["failed"] += 1
            self.log({"msg": "B2 연결 실패", "url": article["url"], "error": repr(err)})
            if self.connection_failed():
                raise BackendDown(f"backend 연결이 {BACKEND_DOWN_AFTER}번 이어서 실패했다") from err
            return None
        data = _json(raw)
        if status in (200, 201) and isinstance(data, dict) and isinstance(data.get("articleId"), int):
            self.b2["created" if status == 201 else "existing"] += 1
            return data["articleId"]
        if status == 400:
            self.b2["rejected"] += 1
            errors = data.get("errors") if isinstance(data, dict) else None
            self.log({"msg": "B2 거절", "url": article["url"], "status": status, "errors": errors})
            return None
        self.b2["failed"] += 1
        self.log({"msg": "B2 실패", "url": article["url"], "status": status, "body": self.short(raw)})
        return None

    def release(self, article_id, last_try):
        """B1 을 부른다. 다시 걸어 볼 실패(연결 · 5xx)면 False"""
        try:
            status, raw = self.post(f"/internal/v1/articles/{article_id}/release", None)
        except CONNECTION_ERRORS as err:
            status, raw = None, repr(err).encode()
            if self.connection_failed():
                # 이 기사 번호는 ingest() 가 멈추며 남긴다
                raise BackendDown(f"backend 연결이 {BACKEND_DOWN_AFTER}번 이어서 실패했다") from err
        if status == 202:
            self.b1["released"] += 1
            return True
        if status == 409:
            self.b1["already"] += 1
            return True
        if (status is None or status >= 500) and not last_try:
            return False
        self.b1["failed"] += 1
        self.log({"msg": "B1 실패", "articleId": article_id, "status": status, "body": self.short(raw)})
        return True

    def ingest(self, articles):
        retry, current = [], None
        load_only = self.config["mode"] == "load-only"
        try:
            for article in articles:
                article_id = self.load(article)
                if article_id is None or load_only:
                    continue
                current = article_id
                if not self.release(article_id, last_try=False):
                    retry.append(article_id)
                current = None
            # B2 는 됐는데 B1 이 연결 · 5xx 로 실패한 기사 — 최신 기사만 받아 다음 실행에 대개 다시 오지 않으니 끝에 한 번 더
            while retry:
                current = retry.pop(0)
                self.b1["retried"] += 1
                self.release(current, last_try=True)
                current = None
        except (AuthError, BackendDown):
            # 멈추면 B2 는 됐는데 B1 을 끝내 못 건 기사가 남는다 — 사람이 그 번호로 B1 을 걸게 번호를 남긴다(docs/api-internal.md 2절)
            for article_id in ([current] if current is not None else []) + retry:
                self.b1["failed"] += 1
                self.log({"msg": "B1 실패", "articleId": article_id, "status": None, "body": "멈춰서 걸지 못함"})
            raise

    def summary(self, kept):
        config = self.config
        days = config["days"]
        record = {
            "msg": "수집 결과",
            "mode": config["mode"],
            "source": config["source"],
            "days": [d.isoformat() for d in days] if days else None,
            "requests": self.requests,
            "credits": self.requests * SOURCES[config["source"]],
            "fetched": self.fetched,
            "kept": kept,
            "skipped": dict(self.skipped),
            "pubDates": {"min": self.pub_dates[0], "max": self.pub_dates[1]} if self.pub_dates else None,
            "stoppedBy": self.stopped_by,
        }
        if config["mode"] != "fetch-only":
            record["b2"] = dict(self.b2)
        if config["mode"] == "full":
            record["b1"] = dict(self.b1)
        self.log(record)


def run(environ, send, log, now, sleep):
    try:
        config = load_config(environ, now)
    except ConfigError as err:
        log({"msg": "설정 오류", "error": str(err)})
        return 2
    job = Run(config, send, log, sleep)
    try:
        kept = job.fetch()
    except AuthError as err:
        log({"msg": "출입증 오류 — 멈춘다", "error": str(err)})
        job.summary(0)
        return 2
    if kept is None:
        job.summary(0)
        return 1
    # 보낼 때는 발행 시각이 이른 것부터 — 판정이 앞선 기사들과만 비교한다(docs/api-internal.md 3절)
    articles = sorted(kept, key=lambda a: (a["publishedAt"], a["url"] or ""))
    if config["mode"] == "fetch-only":
        for article in articles[:SAMPLE_COUNT]:
            sample = {k: v for k, v in article.items() if k != "body"}
            sample["bodyChars"] = len(article["body"])
            log({"msg": "견본", "article": sample})
        job.summary(len(articles))
        return 0
    try:
        job.ingest(articles)
    except AuthError as err:
        log({"msg": "출입증 오류 — 멈춘다", "error": str(err)})
        job.summary(len(articles))
        return 2
    except BackendDown as err:
        log({"msg": "backend 연결 실패 — 멈춘다", "error": str(err)})
        job.summary(len(articles))
        return 1
    job.summary(len(articles))
    if job.stopped_by in CAPPED:
        # 다음 쪽이 남았다 — 받은 데까지는 넣었다. 다시 돌아도 같은 상한이라 2(다시 시도 없음 → 경보)
        log({"msg": "상한에 닿아 멈춤 — 빠진 구간이 있다", "stoppedBy": job.stopped_by})
        return 2
    if job.stopped_by == "newsdata_auth":
        return 2
    if job.stopped_by == "newsdata_error":
        return 1
    went = job.b1["released"] + job.b1["already"] if config["mode"] == "full" else job.b2["created"] + job.b2["existing"]
    return 1 if articles and went == 0 else 0


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """3xx 를 따라가지 않는다 — urllib 은 따라가며 X-Internal-Key 를 새 주소로도 옮긴다. 3xx 는 그대로 실패 상태로 돌려준다"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def urllib_send(method, url, headers, body):
    """(상태, 본문)을 돌려준다. 3xx · 4xx · 5xx 도 상태로 돌려주고, 연결 실패는 예외로 둔다"""
    request = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": "newlearn-news-ingest/1", **headers})
    try:
        with _OPENER.open(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def main(environ, send, out, now=None, sleep=None):
    """now: 「지금」(INGEST_DAYS=yesterday 를 셀 때, 비우면 시계), sleep: 요청 사이 쉬기(비우면 time.sleep) — 시험이 바꿔 넣는다"""
    keys = [environ.get("NEWSDATA_API_KEY", "").strip(), environ.get("INTERNAL_BATCH_KEY", "").strip()]
    # 로그는 JSON 으로 적은 뒤 가린다 — JSON 이 글자를 바꿔 적는 키도 가리게 그 모양도 같이
    secrets = keys + [json.dumps(k)[1:-1] for k in keys]

    def log(record):
        out.write(redact(json.dumps(record, ensure_ascii=False), secrets) + "\n")
        out.flush()

    try:
        return run(environ, send, log, now or datetime.now(KST), sleep or time.sleep)
    except Exception:  # 예상 못 한 오류도 키를 가린 채 남기고 실패로 끝낸다
        log({"msg": "예상 못 한 오류", "traceback": traceback.format_exc()})
        return 1


if __name__ == "__main__":
    sys.exit(main(os.environ, urllib_send, sys.stdout))
