"""뉴스 수집 배치 — NewsData 최신 기사 → B2 기사 적재 → B1 분석 걸기 (Jira S15P31A102-154)

CronJob news-ingest(옆의 news-ingest.yaml)가 ConfigMap 으로 얹어 돌린다. 계약은 docs/api-internal.md 2절,
정한 것과 까닭은 docs/plans/2026-11-03-news-ingest-batch.md, 손으로 돌리는 법 · 로그 읽는 법은 infra/server/ingest.md

- INGEST_MODE=fetch-only — NewsData 요청 하나만 보내고 받은 수 · 거른 수 · 처음 몇 건의 B2 요청 모양을 찍는다(B2 · B1 안 부름)
- INGEST_MODE=full — 걸러 남은 기사를 발행 순서대로 B2 로 넣고, 돌려받은 id 로 B1 을 부른다
- 상한: INGEST_MAX_ARTICLES(B2 로 보낼 기사) · INGEST_MAX_REQUESTS(NewsData 요청). 숫자는 팀 확정 전 임시값(Jira 156)
- 키: NEWSDATA_API_KEY(봉인 Secret newsdata-api) · INTERNAL_BATCH_KEY(internal-api 의 배치 키, full 만)

로그는 줄마다 JSON 하나이고 키는 모두 *** 로 가린다. 끝에 {"msg": "수집 결과", …} 한 줄
종료 코드 0 · 1 · 2 의 뜻은 infra/server/ingest.md 「로그 읽기」의 표 — CronJob 은 2(다시 해도 같음)면 다시 시도하지 않는다

표준 라이브러리만 쓴다 — 공개 Python 이미지에 이 파일만 얹는다. 불러올 때는 env 를 읽지 않는다(시험이 main 에 넘긴다)
"""

import http.client
import json
import os
import re
import sys
import traceback
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime

NEWSDATA_URL = "https://newsdata.io/api/1/latest"
# 11-03 에 통한 질의 그대로 — 고르는 조건(분야 · 언론사)이 정해지면 여기를 고친다(Jira 156)
NEWSDATA_QUERY = {"country": "kr", "language": "ko"}
# 배치가 미리 거르는 분류 — 2026-11-03 인프라 담당 결정(docs/api-internal.md 2절)
SKIP_CATEGORIES = frozenset({"entertainment", "sports"})
PUB_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
REPORTER_MAX = 200  # B2 의 reporter 상한
MAX_ARTICLES_CEILING = 200
MAX_REQUESTS_CEILING = 10
SAMPLE_COUNT = 3
TIMEOUT_SECONDS = 20
BODY_LOG_CHARS = 300  # 로그에 남길 응답 본문 길이 — 키를 가린 뒤 자른다
# backend 연결이 이어서 이만큼 실패하면 멈춘다 — 정책 실수로 패킷이 버려지면 요청마다 시간 초과라,
# 기사 50건을 다 기다리면 Job 시간 상한(900초)에 잘려 결과 줄이 안 남는다
BACKEND_DOWN_AFTER = 3
MODES = ("fetch-only", "full")
SKIP_REASONS = ("bad_item", "no_body", "category", "timezone", "bad_date", "duplicate", "over_limit")
CONNECTION_ERRORS = (OSError, http.client.HTTPException)  # urllib.error.URLError · 끊김 · 시간 초과는 OSError


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


def _bounded_int(environ, name, ceiling):
    raw = environ.get(name, "").strip()
    if not raw.isdigit() or not 1 <= int(raw) <= ceiling:
        raise ConfigError(f"{name} 는 1 ~ {ceiling} 의 정수여야 한다 (지금: {raw!r})")
    return int(raw)


def load_config(environ):
    mode = environ.get("INGEST_MODE", "").strip()
    if mode not in MODES:
        raise ConfigError(f"INGEST_MODE 는 {' · '.join(MODES)} 중 하나여야 한다 (지금: {mode!r})")
    config = {
        "mode": mode,
        "newsdata_key": environ.get("NEWSDATA_API_KEY", "").strip(),
        "max_articles": _bounded_int(environ, "INGEST_MAX_ARTICLES", MAX_ARTICLES_CEILING),
        "max_requests": _bounded_int(environ, "INGEST_MAX_REQUESTS", MAX_REQUESTS_CEILING),
        "batch_key": environ.get("INTERNAL_BATCH_KEY", "").strip(),
        "backend": environ.get("BACKEND_URL", "").strip().rstrip("/"),
    }
    if not config["newsdata_key"]:
        raise ConfigError("NEWSDATA_API_KEY 가 없다 — 봉인 Secret newsdata-api (infra/server/seal-secrets.sh newsdata)")
    if mode == "full":
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
    def __init__(self, config, send, log):
        self.config = config
        self.send = send
        self.log = log
        self.secrets = [config["newsdata_key"], config["batch_key"]]
        self.requests = 0
        self.fetched = 0
        self.connection_failures = 0  # backend 연결이 이어서 실패한 수
        self.skipped = Counter({reason: 0 for reason in SKIP_REASONS})
        self.b2 = Counter({"created": 0, "existing": 0, "rejected": 0, "failed": 0})
        self.b1 = Counter({"released": 0, "already": 0, "failed": 0, "retried": 0})

    def short(self, body):
        """로그에 남길 응답 본문 — 가린 뒤 자른다. 거꾸로 하면 자르는 자리에 걸친 키의 앞부분이 남는다"""
        text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
        return redact(text, self.secrets)[:BODY_LOG_CHARS]

    def fetch(self):
        """NewsData 를 상한까지 불러 걸러 남은 기사를 받은 순서(최신부터)로 돌려준다. 실패하면 None"""
        config = self.config
        limit = 1 if config["mode"] == "fetch-only" else config["max_requests"]
        kept, seen, next_page = [], set(), None
        while self.requests < limit:
            query = {"apikey": config["newsdata_key"], **NEWSDATA_QUERY}
            if next_page:
                query["page"] = next_page
            url = f"{NEWSDATA_URL}?{urllib.parse.urlencode(query)}"
            self.log({"msg": "NewsData 요청", "url": url})
            try:
                status, body = self.send("GET", url, {"Accept": "application/json"}, None)
            except CONNECTION_ERRORS as err:
                self.log({"msg": "NewsData 연결 실패", "error": repr(err)})
                return None
            self.requests += 1
            if status in (401, 403):
                # 키가 틀렸거나 막혔다(구독이 끝난 뒤도) — 다시 해도 같다
                raise AuthError(f"NewsData → {status} {self.short(body)}")
            data = _json(body)
            if status != 200 or not isinstance(data, dict) or data.get("status") != "success" or not isinstance(data.get("results"), list):
                self.log({"msg": "NewsData 실패", "status": status, "body": self.short(body)})
                return None
            if self.requests == 1 and data["results"]:
                first = data["results"][0]
                fields = sorted(first) if isinstance(first, dict) else type(first).__name__
                self.log({"msg": "받은 칸", "totalResults": data.get("totalResults"), "fields": fields})
            for item in data["results"]:
                self.fetched += 1
                if not isinstance(item, dict) or not isinstance(item.get("link"), str):
                    reason = "bad_item"
                else:
                    reason = skip_reason(item)
                if reason is None and item.get("link") in seen:
                    reason = "duplicate"
                if reason is None and len(kept) >= config["max_articles"]:
                    reason = "over_limit"
                if reason:
                    self.skipped[reason] += 1
                    continue
                seen.add(item.get("link"))
                kept.append(item)
            next_page = data.get("nextPage")
            if not next_page or len(kept) >= config["max_articles"]:
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
        try:
            for article in articles:
                article_id = self.load(article)
                if article_id is None:
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
        record = {"msg": "수집 결과", "mode": self.config["mode"], "requests": self.requests, "fetched": self.fetched, "kept": kept, "skipped": dict(self.skipped)}
        if self.config["mode"] == "full":
            record["b2"] = dict(self.b2)
            record["b1"] = dict(self.b1)
        self.log(record)


def run(environ, send, log):
    try:
        config = load_config(environ)
    except ConfigError as err:
        log({"msg": "설정 오류", "error": str(err)})
        return 2
    job = Run(config, send, log)
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
    articles = sorted((to_article(item) for item in kept), key=lambda a: (a["publishedAt"], a["url"] or ""))
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
    went = job.b1["released"] + job.b1["already"]
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


def main(environ, send, out):
    keys = [environ.get("NEWSDATA_API_KEY", "").strip(), environ.get("INTERNAL_BATCH_KEY", "").strip()]
    # 로그는 JSON 으로 적은 뒤 가린다 — JSON 이 글자를 바꿔 적는 키도 가리게 그 모양도 같이
    secrets = keys + [json.dumps(k)[1:-1] for k in keys]

    def log(record):
        out.write(redact(json.dumps(record, ensure_ascii=False), secrets) + "\n")
        out.flush()

    try:
        return run(environ, send, log)
    except Exception:  # 예상 못 한 오류도 키를 가린 채 남기고 실패로 끝낸다
        log({"msg": "예상 못 한 오류", "traceback": traceback.format_exc()})
        return 1


if __name__ == "__main__":
    sys.exit(main(os.environ, urllib_send, sys.stdout))
