"""news_ingest.py 시험 — 뉴스 수집 배치 (Jira S15P31A102-154)

스크립트는 kustomize 가 ConfigMap 으로 얹는 자리(infra/k8s/services/ingest/)에 있어 경로로 불러온다.
NewsData · backend 는 가짜 보내기 함수로 대신한다. 견본 기사는 2026-11-03 실제 응답의 칸 모양만 따서 지어낸 값이다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import http.server
import importlib.util
import io
import json
import pathlib
import re
import threading
import unittest
import urllib.error
import urllib.parse
from collections import Counter
from unittest import mock
from datetime import datetime, timedelta, timezone

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "k8s" / "services" / "ingest" / "news_ingest.py"
_spec = importlib.util.spec_from_file_location("news_ingest", SCRIPT)
news_ingest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(news_ingest)

# 지어낸 키 — 로그에 이 글자가 나오면 안 된다
KEY = "pub_testkey0123456789abcdef"
BATCH_KEY = "batch-test-key-0123456789"
BACKEND = "http://backend.test:8080"
NEWSDATA_API = "https://newsdata.io/api/1/"
NEWSDATA = NEWSDATA_API + "latest"
ARCHIVE = NEWSDATA_API + "archive"
KST = timezone(timedelta(hours=9))
NOW = datetime(2026, 11, 4, 10, 0, tzinfo=KST)  # 매일 10시 실행 — 전날은 11-03
B2 = BACKEND + "/internal/v1/articles"
B1 = re.compile(re.escape(BACKEND) + r"/internal/v1/articles/(\d+)/release")
B3 = BACKEND + "/internal/v1/articles/release-candidates"
HEALTH = "http://ai.test:8000/health"


def item(n, **over):
    """NewsData 최신 기사 하나 — n 이 클수록 늦게 나온 기사"""
    base = {
        "article_id": f"a{n:031d}",
        "title": f"가람시 {n}번 소식",
        "link": f"https://news.example.com/articles/{n}",
        "keywords": ["가람시"],
        "creator": [f"기자{n}"],
        "description": "요약",
        "content": f"가람시는 {n}일 새 정책을 발표했다.",
        "pubDate": f"2026-11-02 10:{n:02d}:00",
        "pubDateTZ": "UTC",
        "image_url": None,
        "video_url": None,
        "source_id": "garam_kr",
        "source_name": "가람일보",
        "source_priority": 1000,
        "source_url": "https://news.example.com",
        "source_icon": "https://news.example.com/icon.png",
        "language": "korean",
        "country": ["south korea"],
        "category": ["top"],
        "ai_tag": ["politics"],
        "ai_region": "ONLY AVAILABLE IN CORPORATE PLANS",
        "ai_org": "ONLY AVAILABLE IN CORPORATE PLANS",
        "ai_summary": None,
        "sentiment": "neutral",
        "sentiment_stats": {"positive": 1.0, "neutral": 98.0, "negative": 1.0},
        "duplicate": False,
        "datatype": "news",
        "fetched_at": "2026-11-02 23:20:00",
    }
    base.update(over)
    return base


def page(items, next_page=None):
    return (200, {"status": "success", "totalResults": 1234, "results": items, "nextPage": next_page})


def env(**over):
    values = {
        "INGEST_MODE": "load-only",
        "NEWSDATA_API_KEY": KEY,
        "INTERNAL_BATCH_KEY": BATCH_KEY,
        "BACKEND_URL": BACKEND,
        "INGEST_MAX_ARTICLES": "50",
        "INGEST_MAX_REQUESTS": "3",
    }
    values.update(over)
    return {k: v for k, v in values.items() if v is not None}


class FakeNet:
    """가짜 보내기 함수 — 부른 순서를 남기고 주소에 따라 답한다

    pages: NewsData 가 차례로 돌려줄 (상태, 본문) 또는 던질 예외
    b2: 기사(dict) → (상태, 본문). 없으면 처음 보는 URL 은 201, 본 URL 은 200
    b1: (기사 번호, 몇 번째 시도) → (상태, 본문). 없으면 202
    b3: 질의 dict → (상태, 본문) 또는 던질 예외. 없으면 이 가짜 망이 B2 로 받은 기사를 넣은 차례의 거꾸로(최신부터) 후보로, 대기 0
    health: (상태, 본문) 또는 던질 예외. 없으면 200 UP
    """

    def __init__(self, pages=(), b2=None, b1=None, b3=None, health=None):
        self.pages = list(pages)
        self.b2 = b2
        self.b1 = b1
        self.b3 = b3
        self.health = health
        self.calls = []
        self.ids = {}
        self.b1_tries = Counter()

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, dict(headers), body))
        if url.startswith(NEWSDATA_API):
            resp = self.pages.pop(0)
            if isinstance(resp, BaseException):
                raise resp
            return self._reply(*resp)
        if url == B2:
            article = json.loads(body)
            if self.b2:
                return self._reply(*self.b2(article))
            created = article["url"] not in self.ids
            article_id = self.ids.setdefault(article["url"], len(self.ids) + 1)
            return self._reply(201 if created else 200, {"articleId": article_id, "created": created})
        if url.startswith(B3 + "?"):
            query = dict(urllib.parse.parse_qsl(url.partition("?")[2], strict_parsing=True))
            resp = self.b3(query) if self.b3 else b3_state(candidates=sorted(self.ids.values(), reverse=True)[: int(query["limit"])])
            if isinstance(resp, BaseException):
                raise resp
            return self._reply(*resp)
        if url == HEALTH:
            resp = self.health or (200, {"status": "UP", "redis": "UP", "worker": "RUNNING"})
            if isinstance(resp, BaseException):
                raise resp
            return self._reply(*resp)
        found = B1.fullmatch(url)
        if found:
            article_id = int(found.group(1))
            self.b1_tries[article_id] += 1
            if self.b1:
                return self._reply(*self.b1(article_id, self.b1_tries[article_id]))
            return self._reply(202, {"articleId": article_id, "jobs": []})
        raise AssertionError(f"모르는 주소: {method} {url}")

    @staticmethod
    def _reply(status, payload):
        if isinstance(payload, bytes):
            return status, payload
        return status, json.dumps(payload, ensure_ascii=False).encode()

    def newsdata_calls(self):
        return [c for c in self.calls if c[1].startswith(NEWSDATA_API)]

    def newsdata_query(self, n=0):
        """n 번째 NewsData 요청의 (주소, 질의 dict) — 같은 키가 둘이면 시험이 깨지게 dict 로"""
        url = self.newsdata_calls()[n][1]
        base, _, query = url.partition("?")
        return base, dict(urllib.parse.parse_qsl(query, strict_parsing=True))

    def b2_calls(self):
        return [c for c in self.calls if c[1] == B2]

    def b1_calls(self):
        return [c for c in self.calls if B1.fullmatch(c[1])]

    def b1_ids(self):
        return [int(B1.fullmatch(c[1]).group(1)) for c in self.b1_calls()]

    def b3_calls(self):
        return [c for c in self.calls if c[1].startswith(B3 + "?")]

    def health_calls(self):
        return [c for c in self.calls if c[1] == HEALTH]


def b3_state(today=0, queued=0, retry=0, oldest=None, succeeded=0, failed=0, candidates=()):
    """B3 200 (상태, 본문) — 값은 지어낸 것"""
    return (200, {
        "releasedToday": today,
        "extract": {"queued": queued, "retryPending": retry, "oldestQueuedAt": oldest,
                    "succeededLast15Minutes": succeeded, "failedLast15Minutes": failed},
        "candidates": [{"articleId": i, "publishedAt": "2026-11-13T10:40:00+09:00"} for i in candidates],
    })


def auto_env(**over):
    """INGEST_MODE=auto — 자동 투입 설정까지(계획 docs/plans/2026-11-10-ingest-15min-auto-b1.md 의 값)"""
    values = {
        "INGEST_MODE": "auto",
        "INGEST_RELEASE_FROM": "2026-11-12",
        "INGEST_RELEASE_PER_RUN": "50",
        "INGEST_RELEASE_PER_DAY": "5000",
        "INGEST_RELEASE_CAPACITY": "60",
        "INGEST_RELEASE_MAX_WAIT_MINUTES": "30",
        "AI_HEALTH_URL": HEALTH,
    }
    values.update(over)
    return env(**values)


def run(environ, net, now=None, sleep=None):
    """main 을 돌려 (종료 코드, JSON 줄 목록, 찍힌 글 전체)를 돌려준다. 줄마다 JSON 이 아니면 여기서 깨진다

    now: 「지금」(KST) — 전날을 셀 때. sleep: 요청 사이 쉬기를 대신 받는 함수(진짜로 쉬지 않게)
    """
    out = io.StringIO()
    extra = {k: v for k, v in (("now", now), ("sleep", sleep)) if v is not None}
    code = news_ingest.main(environ, net, out, **extra)
    text = out.getvalue()
    lines = [json.loads(line) for line in text.splitlines()]
    return code, lines, text


def summary(lines):
    found = [line for line in lines if line.get("msg") == "수집 결과"]
    assert found, f"결과 줄이 없다: {lines}"
    return found[-1]


class SkipReason(unittest.TestCase):
    def test_body_null_or_blank(self):
        self.assertEqual(news_ingest.skip_reason(item(1, content=None)), "no_body")
        self.assertEqual(news_ingest.skip_reason(item(1, content=" \n ")), "no_body")

    def test_entertainment_or_sports_even_with_other_category(self):
        self.assertEqual(news_ingest.skip_reason(item(1, category=["top", "entertainment"])), "category")
        self.assertEqual(news_ingest.skip_reason(item(1, category=["sports"])), "category")

    def test_timezone_not_utc(self):
        self.assertEqual(news_ingest.skip_reason(item(1, pubDateTZ="Asia/Seoul")), "timezone")
        self.assertEqual(news_ingest.skip_reason(item(1, pubDateTZ=None)), "timezone")

    def test_bad_date_shape(self):
        self.assertEqual(news_ingest.skip_reason(item(1, pubDate="2026-11-02T10:00:00Z")), "bad_date")
        self.assertEqual(news_ingest.skip_reason(item(1, pubDate=None)), "bad_date")

    def test_normal_article_passes(self):
        self.assertIsNone(news_ingest.skip_reason(item(1, category=["top", "business"])))

    def test_same_five_categories_as_query(self):
        # INGEST_QUERY 의 excludecategory 와 같은 다섯 — 쿼리를 바꿔도 로컬에서 한 번 더 거른다(팀장 2026-11-04)
        for category in ("sports", "entertainment", "lifestyle", "food", "tourism"):
            with self.subTest(category=category):
                self.assertEqual(news_ingest.skip_reason(item(1, category=["top", category])), "category")

    def test_marked_duplicate_skipped(self):
        # NewsData 가 duplicate=true 로 표시한 기사는 뺀다(팀원 수집과 같게, 팀장 2026-11-04)
        self.assertEqual(news_ingest.skip_reason(item(1, duplicate=True)), "marked_duplicate")
        self.assertIsNone(news_ingest.skip_reason(item(1, duplicate=False)))
        self.assertIsNone(news_ingest.skip_reason(item(1, duplicate=None)))


class ToArticle(unittest.TestCase):
    def test_maps_fields_like_api_internal_b2(self):
        got = news_ingest.to_article(
            item(7, creator=["기자7", " 기자8 ", ""], category=["top", "business"], ai_tag=["politics"], keywords=["다른 것"])
        )
        self.assertEqual(
            got,
            {
                "url": "https://news.example.com/articles/7",
                "pressSourceId": "garam_kr",
                "pressName": "가람일보",
                "title": "가람시 7번 소식",
                "reporter": "기자7, 기자8",
                "body": "가람시는 7일 새 정책을 발표했다.",
                "publishedAt": "2026-11-02T10:07:00Z",
                "sourceCategories": ["top", "business"],
                "sourceTags": ["politics"],
            },
        )

    def test_reporter_cut_to_200_chars(self):
        got = news_ingest.to_article(item(1, creator=["가" * 150, "나" * 150]))
        self.assertLessEqual(len(got["reporter"]), 200)
        self.assertTrue(got["reporter"].startswith("가" * 150 + ", 나"))

    def test_reporter_left_out_when_no_names(self):
        for creator in ([], None, ["", "  "]):
            self.assertNotIn("reporter", news_ingest.to_article(item(1, creator=creator)))

    def test_tags_come_from_ai_tag_only_when_list(self):
        self.assertNotIn("sourceTags", news_ingest.to_article(item(1, ai_tag="ONLY AVAILABLE IN PROFESSIONAL PLANS")))
        self.assertEqual(news_ingest.to_article(item(1, ai_tag=["", "economy"]))["sourceTags"], ["economy"])


class Secrets(unittest.TestCase):
    def test_redact_hides_key_and_query(self):
        text = news_ingest.redact(f"{NEWSDATA}?apikey={KEY}&country=kr 그리고 {KEY}", [KEY])
        self.assertNotIn(KEY, text)
        self.assertIn("apikey=***&country=kr", text)

    def test_fetch_only_logs_request_url_masked(self):
        net = FakeNet([page([item(1)])])
        code, _, text = run(env(INGEST_MODE="fetch-only"), net)
        self.assertEqual(code, 0)
        self.assertIn(KEY, net.newsdata_calls()[0][1])  # 진짜 요청에는 키가 실린다
        self.assertNotIn(KEY, text)
        self.assertIn("apikey=***", text)

    def test_redact_hides_query_even_when_key_was_encoded(self):
        # 쿼리에 실리며 모양이 바뀐 키(+ → %2B)는 원문 바꾸기로 못 잡는다 — apikey= 쪽이 잡는다
        text = news_ingest.redact(f"{NEWSDATA}?apikey=ab%2Bcd&country=kr", ["ab+cd"])
        self.assertIn("apikey=***&country=kr", text)

    def test_newsdata_error_body_with_key_is_masked(self):
        net = FakeNet([(500, {"status": "error", "results": {"message": f"API key invalid: {KEY}"}})])
        code, _, text = run(env(), net)
        self.assertEqual(code, 1)
        self.assertNotIn(KEY, text)

    def test_masked_url_in_error_body_keeps_line_json(self):
        # 오류 본문의 주소가 apikey=… 로 끝나고 바로 따옴표가 오면, 가릴 때 JSON 의 \" 까지 먹어 줄이 깨지면 안 된다
        body = b'{"status":"error","results":{"message":"bad","url":"https://newsdata.io/api/1/latest?country=kr&apikey=zzz"}}'
        net = FakeNet([(500, body)])
        code, lines, text = run(env(), net)  # run() 이 줄마다 json.loads 한다
        self.assertEqual(code, 1)
        self.assertIn("apikey=***", text)

    def test_key_with_json_escaped_chars_is_masked(self):
        # JSON 으로 적으며 모양이 바뀌는 글자(따옴표)가 든 키도 가린다
        odd = 'ab"cd-0123456789xyz'
        net = FakeNet([ValueError(f"뜻밖의 오류 {odd}")])
        _, _, text = run(env(NEWSDATA_API_KEY=odd), net)
        self.assertNotIn(odd, text)
        self.assertNotIn(json.dumps(odd)[1:-1], text)  # 로그에 실제로 적히는 모양(ab\"cd…)

    def test_key_cut_at_body_limit_is_still_masked(self):
        # 본문을 자르는 자리에 키가 걸쳐도 앞부분이 남으면 안 된다 — 가린 뒤 자른다
        for filler in range(280, 300):
            with self.subTest(filler=filler):
                net = FakeNet([(500, ("x" * filler + KEY).encode())])
                _, _, text = run(env(), net)
                self.assertNotIn(KEY[:6], text)

    def test_connection_error_with_url_is_masked(self):
        net = FakeNet([urllib.error.URLError(f"연결 실패 {NEWSDATA}?apikey={KEY}")])
        code, _, text = run(env(), net)
        self.assertEqual(code, 1)
        self.assertNotIn(KEY, text)

    def test_unexpected_exception_traceback_is_masked(self):
        net = FakeNet([ValueError(f"뜻밖의 오류 apikey={KEY} {BATCH_KEY}")])
        code, lines, text = run(env(), net)
        self.assertEqual(code, 1)
        self.assertNotIn(KEY, text)
        self.assertNotIn(BATCH_KEY, text)
        self.assertTrue(any("Traceback" in line.get("traceback", "") for line in lines))

    def test_batch_key_goes_only_to_backend(self):
        net = FakeNet([page([item(1)])])
        run(auto_env(), net)
        self.assertNotIn("X-Internal-Key", net.newsdata_calls()[0][2])
        self.assertEqual(net.b2_calls()[0][2]["X-Internal-Key"], BATCH_KEY)
        self.assertEqual(net.b2_calls()[0][2]["Content-Type"], "application/json")
        self.assertEqual(net.b3_calls()[0][2]["X-Internal-Key"], BATCH_KEY)
        self.assertEqual(net.b3_calls()[0][0], "GET")
        self.assertEqual(net.b1_calls()[0][2]["X-Internal-Key"], BATCH_KEY)
        self.assertEqual(net.b1_calls()[0][3], b"")  # B1 은 본문 없이
        self.assertNotIn("X-Internal-Key", net.health_calls()[0][2])  # AI 워커 /health 에는 키를 안 보낸다


class NoRedirect(unittest.TestCase):
    """urllib 은 3xx 를 따라가며 X-Internal-Key 를 새 주소로도 옮긴다 — 따라가지 않고 3xx 를 그대로 돌려줘야 한다"""

    def test_redirect_is_not_followed(self):
        hits = []

        class Target(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                hits.append(self.headers.get("X-Internal-Key"))
                self.send_response(200)
                self.end_headers()

            do_GET = do_POST

            def log_message(self, *args):
                pass

        target = http.server.HTTPServer(("127.0.0.1", 0), Target)

        class Mover(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length") or 0))
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{target.server_port}/steal")
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *args):
                pass

        mover = http.server.HTTPServer(("127.0.0.1", 0), Mover)
        for server in (target, mover):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            status, _ = news_ingest.urllib_send("POST", f"http://127.0.0.1:{mover.server_port}/internal/v1/articles", {"X-Internal-Key": BATCH_KEY}, b"{}")
        finally:
            for server in (target, mover):
                server.shutdown()
                server.server_close()
        self.assertEqual(status, 302)
        self.assertEqual(hits, [])


class Limits(unittest.TestCase):
    def test_fetch_only_sends_one_request_even_with_next_page(self):
        net = FakeNet([page([item(1), item(2)], "next-1"), page([item(3)])])
        code, lines, _ = run(env(INGEST_MODE="fetch-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.newsdata_calls()), 1)
        self.assertEqual(net.b2_calls() + net.b1_calls(), [])
        self.assertEqual(summary(lines)["requests"], 1)

    def test_fetch_only_needs_no_batch_key_or_backend(self):
        net = FakeNet([page([item(1)])])
        code, _, _ = run(env(INGEST_MODE="fetch-only", INTERNAL_BATCH_KEY=None, BACKEND_URL=None), net)
        self.assertEqual(code, 0)

    def test_fetch_only_prints_samples_without_body(self):
        net = FakeNet([page([item(i) for i in range(1, 6)])])
        _, lines, _ = run(env(INGEST_MODE="fetch-only"), net)
        samples = [line for line in lines if line.get("msg") == "견본"]
        self.assertEqual(len(samples), 3)
        self.assertNotIn("body", samples[0]["article"])
        self.assertEqual(samples[0]["article"]["bodyChars"], len(item(1)["content"]))

    def test_full_stops_at_max_requests(self):
        net = FakeNet([page([item(1)], "n1"), page([item(2)], "n2"), page([item(3)], "n3")])
        run(env(INGEST_MAX_REQUESTS="2"), net)
        self.assertEqual(len(net.newsdata_calls()), 2)
        self.assertIn("page=n1", net.newsdata_calls()[1][1])

    def test_b2_calls_capped_by_max_articles(self):
        net = FakeNet([page([item(i) for i in range(1, 6)])])
        _, lines, _ = run(env(INGEST_MAX_ARTICLES="3"), net)
        self.assertEqual(len(net.b2_calls()), 3)
        self.assertEqual(summary(lines)["skipped"]["over_limit"], 2)

    def test_stops_fetching_when_enough_articles(self):
        net = FakeNet([page([item(1), item(2), item(3)], "n1"), page([item(4)])])
        run(env(INGEST_MAX_ARTICLES="2"), net)
        self.assertEqual(len(net.newsdata_calls()), 1)

    def test_bad_config_exits_2_without_calls(self):
        bad = [
            env(INGEST_MODE=None),
            env(INGEST_MODE="go"),
            env(NEWSDATA_API_KEY=None),
            env(NEWSDATA_API_KEY="  "),
            env(INGEST_MAX_ARTICLES="0"),
            env(INGEST_MAX_ARTICLES=str(news_ingest.MAX_ARTICLES_CEILING + 1)),
            env(INGEST_MAX_REQUESTS=str(news_ingest.MAX_REQUESTS_CEILING + 1)),
            env(INGEST_MAX_REQUESTS="abc"),
            env(INGEST_MAX_REQUESTS=None),
            env(INTERNAL_BATCH_KEY=None),
            env(BACKEND_URL=None),
            env(BACKEND_URL="backend:8080"),
        ]
        for environ in bad:
            with self.subTest(environ=environ):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(environ, net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])

    def test_same_link_across_pages_sent_once(self):
        net = FakeNet([page([item(1)], "n1"), page([item(1), item(2)])])
        _, lines, _ = run(env(), net)
        self.assertEqual(len(net.b2_calls()), 2)
        self.assertEqual(summary(lines)["skipped"]["duplicate"], 1)

    def test_filtered_articles_never_reach_b2(self):
        items = [item(1, content=None), item(2, category=["sports"]), item(3, pubDateTZ="EST"), item(4)]
        net = FakeNet([page(items)])
        _, lines, _ = run(env(), net)
        self.assertEqual([json.loads(c[3])["url"] for c in net.b2_calls()], [item(4)["link"]])
        self.assertEqual(
            summary(lines)["skipped"],
            {"bad_item": 0, "no_body": 1, "notice_only": 0, "category": 1, "marked_duplicate": 0, "timezone": 1, "bad_date": 0, "out_of_range": 0, "duplicate": 0, "over_limit": 0, "wrong_body": 0},
        )


class Flow(unittest.TestCase):
    # auto — B2 로 모두 넣은 뒤 회차 끝에 B3 후보로 B1. 후보는 넣은 차례 거꾸로(가짜 망 기본 B3)
    def test_auto_loads_all_then_releases_newest_inserted_first(self):
        net = FakeNet([page([item(1), item(2)])])
        code, lines, _ = run(auto_env(), net)
        self.assertEqual(code, 0)
        b3_at = net.calls.index(net.b3_calls()[0])
        self.assertTrue(all(net.calls.index(c) < b3_at for c in net.b2_calls()))  # B2 를 다 넣은 뒤에 B3
        self.assertEqual(net.b1_ids(), [2, 1])
        result = summary(lines)
        self.assertEqual(result["b2"], {"created": 2, "existing": 0, "rejected": 0, "failed": 0})
        self.assertEqual(result["b1"], {"released": 2, "already": 0, "failed": 0})

    def test_all_already_released_is_success(self):
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (409, {"code": "ALREADY_RELEASED"}))
        code, lines, _ = run(auto_env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["b1"]["already"], 2)

    def test_b1_server_error_is_not_retried_in_the_same_run(self):
        # 다음 회차 B3 가 작업 행이 없는 기사만 후보로 주니 그때 다시 나온다(AI 팀장 「다시 걸기 전에 작업 행 확인」)
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (503, b"") if aid == 1 else (202, {"articleId": aid}))
        code, lines, _ = run(auto_env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(net.b1_ids(), [2, 1])
        self.assertEqual(summary(lines)["b1"], {"released": 1, "already": 0, "failed": 1})
        self.assertTrue(any(line.get("msg") == "B1 실패" and line.get("articleId") == 1 and line.get("status") == 503 for line in lines))

    def test_b1_connection_error_counts_and_none_went_exits_1(self):
        def b1(aid, n):
            raise ConnectionResetError("끊김")

        net = FakeNet([page([item(1)])], b1=b1)
        code, lines, _ = run(auto_env(), net)
        self.assertEqual(code, 1)
        self.assertEqual(len(net.b1_calls()), 1)
        self.assertEqual(summary(lines)["b1"]["failed"], 1)

    def test_auth_error_on_b2_stops_with_exit_2(self):
        net = FakeNet([page([item(1), item(2)])], b2=lambda article: (401, {"code": "UNAUTHORIZED"}))
        code, _, _ = run(env(), net)
        self.assertEqual(code, 2)
        self.assertEqual(len(net.b2_calls()), 1)

    def test_auth_error_on_b1_stops_with_exit_2(self):
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (403, {"code": "FORBIDDEN"}))
        code, lines, _ = run(auto_env(), net)
        self.assertEqual(code, 2)
        self.assertEqual(len(net.b1_calls()), 1)
        self.assertEqual(summary(lines)["release"]["skippedBy"], "auth")
        self.assertTrue(any(line.get("msg") == "출입증 오류 — 멈춘다" for line in lines))

    def test_none_reached_b1_exits_1(self):
        net = FakeNet([page([item(1), item(2)])], b2=lambda article: (500, {"code": "INTERNAL_ERROR"}))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 1)
        self.assertEqual(summary(lines)["b2"]["failed"], 2)

    def test_nothing_left_after_filter_is_success(self):
        net = FakeNet([page([item(1, content=None)])])
        code, _, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(net.b2_calls(), [])

    def test_newsdata_not_success_exits_1(self):
        net = FakeNet([(200, {"status": "error", "results": {"message": "limit"}})])
        code, _, _ = run(env(), net)
        self.assertEqual(code, 1)

    def test_newsdata_not_json_exits_1(self):
        net = FakeNet([(200, b"<html>busy</html>")])
        code, _, _ = run(env(), net)
        self.assertEqual(code, 1)

    def test_newsdata_rejects_key_exits_2(self):
        # 키가 틀렸거나 막힘 — 다시 해도 같다
        for status in (401, 403):
            with self.subTest(status=status):
                net = FakeNet([(status, {"status": "error", "results": {"message": "API key invalid"}})])
                code, _, _ = run(env(), net)
                self.assertEqual(code, 2)

    def test_odd_items_counted_not_crash(self):
        items = [7, item(1, link=["https://a"]), item(2)]
        net = FakeNet([page(items)])
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["skipped"]["bad_item"], 2)
        self.assertEqual(len(net.b2_calls()), 1)

    def test_b2_success_without_number_id_is_failure(self):
        net = FakeNet([page([item(1)])], b2=lambda article: (201, {"articleId": "11"}))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 1)
        self.assertEqual(summary(lines)["b2"]["failed"], 1)
        self.assertEqual(net.b1_calls(), [])

    def test_backend_down_during_release_stops_with_1(self):
        # B1 이 이어서 셋 끊기면 남은 후보는 걸지 않고 멈춘다 — 작업 행이 없으니 다음 회차 후보로 다시 나온다
        def b1(aid, n):
            raise ConnectionRefusedError("refused")

        net = FakeNet([page([item(i) for i in range(1, 6)])], b1=b1)
        code, lines, _ = run(auto_env(), net)
        self.assertEqual(code, 1)
        self.assertEqual(len(net.b1_calls()), news_ingest.BACKEND_DOWN_AFTER)
        self.assertTrue(any(line.get("msg") == "backend 연결 실패 — 멈춘다" for line in lines))

    def test_scattered_connection_failures_do_not_stop(self):
        # 이어서가 아니라 띄엄띄엄 끊기면 멈추지 않는다 — 사이에 답이 오면 센 수가 0 으로
        def b2(article):
            if int(article["url"].rsplit("/", 1)[1]) % 2:
                raise TimeoutError("timed out")
            return (201, {"articleId": int(article["url"].rsplit("/", 1)[1]), "created": True})

        net = FakeNet([page([item(i) for i in range(1, 8)])], b2=b2)
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.b2_calls()), 7)
        self.assertEqual(summary(lines)["b2"]["failed"], 4)

    def test_backend_unreachable_stops_early_with_summary(self):
        # 정책 실수로 패킷이 버려지면 요청마다 시간 초과다 — 이어서 3번이면 멈춰 시간 상한 전에 결과 줄을 남긴다
        def b2(article):
            raise TimeoutError("timed out")

        net = FakeNet([page([item(i) for i in range(1, 11)])], b2=b2)
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 1)
        self.assertEqual(len(net.b2_calls()), news_ingest.BACKEND_DOWN_AFTER)
        self.assertEqual(summary(lines)["b2"]["failed"], news_ingest.BACKEND_DOWN_AFTER)

    def test_sent_oldest_first(self):
        # NewsData 는 최신부터 준다
        net = FakeNet([page([item(3), item(1), item(2)])])
        run(env(), net)
        self.assertEqual([json.loads(c[3])["url"][-1] for c in net.b2_calls()], ["1", "2", "3"])

    def test_summary_line_counts(self):
        net = FakeNet([page([item(1), item(2, content=None), item(3)])])
        _, lines, _ = run(env(), net)
        result = summary(lines)
        self.assertEqual((result["mode"], result["requests"], result["fetched"], result["kept"]), ("load-only", 1, 3, 2))


def day_item(n, pub_date, **over):
    """발행 시각(UTC)을 정한 기사 — 링크 · article_id 는 n 으로 서로 다르게"""
    return item(n, pubDate=pub_date, **over)


class LoadOnly(unittest.TestCase):
    """넣기만 — B2 만 부르고 B1 은 부르지 않는다(Jira 156, 덤프가 들어갈 때까지)"""

    def test_calls_b2_never_b1(self):
        net = FakeNet([page([item(1), item(2)])])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.b2_calls()), 2)
        self.assertEqual(net.b1_calls(), [])
        result = summary(lines)
        self.assertEqual(result["b2"], {"created": 2, "existing": 0, "rejected": 0, "failed": 0})
        self.assertNotIn("b1", result)

    def test_existing_articles_count_as_loaded(self):
        net = FakeNet([page([item(1)])], b2=lambda article: (200, {"articleId": 7, "created": False}))
        code, _, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)

    def test_none_loaded_exits_1(self):
        for b2 in (lambda a: (500, {"code": "INTERNAL_ERROR"}), lambda a: (400, {"code": "VALIDATION_FAILED", "errors": []})):
            with self.subTest(b2=b2):
                net = FakeNet([page([item(1), item(2)])], b2=b2)
                code, _, _ = run(env(INGEST_MODE="load-only"), net)
                self.assertEqual(code, 1)

    def test_needs_batch_key_and_backend(self):
        for environ in (env(INGEST_MODE="load-only", INTERNAL_BATCH_KEY=None), env(INGEST_MODE="load-only", BACKEND_URL=None)):
            with self.subTest(environ=environ):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(environ, net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])


class Timeframe(unittest.TestCase):
    def test_hours_and_minutes_sent(self):
        for value in ("36", "48", "1", "30m", "2880m"):
            with self.subTest(value=value):
                net = FakeNet([page([item(1)])])
                run(env(INGEST_TIMEFRAME=value), net)
                self.assertEqual(net.newsdata_query()[1]["timeframe"], value)

    def test_not_sent_when_empty(self):
        net = FakeNet([page([item(1)])])
        run(env(INGEST_TIMEFRAME=""), net)
        self.assertNotIn("timeframe", net.newsdata_query()[1])

    def test_bad_values_exit_2(self):
        for value in ("0", "49", "036", "0m", "2881m", "36h", "abc", "3 6", "-1"):
            with self.subTest(value=value):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(env(INGEST_TIMEFRAME=value), net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])


class Days(unittest.TestCase):
    """발행 시각(pubDate, UTC)을 KST 날짜로 바꿔 거른다 — KST 11-03 은 UTC 11-02 15:00 ~ 11-03 14:59:59"""

    EDGES = [
        day_item(1, "2026-11-02 14:59:59"),  # KST 11-02 23:59:59 — 빠짐
        day_item(2, "2026-11-02 15:00:00"),  # KST 11-03 00:00 — 들어감
        day_item(3, "2026-11-03 14:59:59"),  # KST 11-03 23:59:59 — 들어감
        day_item(4, "2026-11-03 15:00:00"),  # KST 11-04 00:00 — 빠짐
    ]

    def sent_numbers(self, net):
        return sorted(int(json.loads(c[3])["url"].rsplit("/", 1)[1]) for c in net.b2_calls())

    def test_yesterday_kst_edges(self):
        net = FakeNet([page(self.EDGES)])
        code, lines, _ = run(env(INGEST_DAYS="yesterday"), net, now=NOW)
        self.assertEqual(code, 0)
        self.assertEqual(self.sent_numbers(net), [2, 3])
        result = summary(lines)
        self.assertEqual(result["skipped"]["out_of_range"], 2)
        self.assertEqual(result["days"], ["2026-11-03", "2026-11-03"])

    def test_yesterday_right_after_midnight(self):
        net = FakeNet([page(self.EDGES)])
        run(env(INGEST_DAYS="yesterday"), net, now=datetime(2026, 11, 4, 0, 30, tzinfo=KST))
        self.assertEqual(self.sent_numbers(net), [2, 3])

    def test_yesterday_uses_kst_even_if_now_is_utc(self):
        # 서버 시계가 UTC 여도 KST 로 센다 — UTC 11-03 16:00 은 KST 11-04 01:00
        net = FakeNet([page(self.EDGES)])
        run(env(INGEST_DAYS="yesterday"), net, now=datetime(2026, 11, 3, 16, 0, tzinfo=timezone.utc))
        self.assertEqual(self.sent_numbers(net), [2, 3])

    def test_fixed_day_and_range(self):
        net = FakeNet([page(self.EDGES)])
        run(env(INGEST_DAYS="2026-11-03"), net, now=NOW)
        self.assertEqual(self.sent_numbers(net), [2, 3])
        net = FakeNet([page(self.EDGES)])
        _, lines, _ = run(env(INGEST_DAYS="2026-11-02..2026-11-03"), net, now=NOW)
        self.assertEqual(self.sent_numbers(net), [1, 2, 3])
        self.assertEqual(summary(lines)["days"], ["2026-11-02", "2026-11-03"])

    def test_empty_keeps_all(self):
        net = FakeNet([page(self.EDGES)])
        _, lines, _ = run(env(INGEST_DAYS=""), net, now=NOW)
        self.assertEqual(self.sent_numbers(net), [1, 2, 3, 4])
        self.assertIsNone(summary(lines)["days"])

    def test_bad_days_exit_2(self):
        for value in ("tomorrow", "2026-13-01", "2026-11-3", "20261103", "2026-11-03..2026-11-01", "2026-11-01..", "..2026-11-01", "2026-11-01...2026-11-02"):
            with self.subTest(value=value):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(env(INGEST_DAYS=value), net, now=NOW)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])

    def test_out_of_range_does_not_use_up_article_limit(self):
        # 범위 밖 기사는 상한을 먹지 않고, 상한이 찬 뒤에 와도 「상한 넘침」이 아니라 「범위 밖」으로 센다 —
        # 거꾸로 세면 하루치를 다 받았는데도 max_articles 로 멈춘 것(종료 2)이 된다
        items = [day_item(10, "2026-11-04 00:30:00"), day_item(2, "2026-11-02 15:00:00"), day_item(11, "2026-11-03 23:00:00"), day_item(1, "2026-11-01 09:00:00")]
        net = FakeNet([page(items)])
        code, lines, _ = run(env(INGEST_DAYS="yesterday", INGEST_MAX_ARTICLES="1"), net, now=NOW)
        self.assertEqual(self.sent_numbers(net), [2])
        result = summary(lines)
        self.assertEqual((result["skipped"]["out_of_range"], result["skipped"]["over_limit"]), (3, 0))
        self.assertEqual((code, result["stoppedBy"]), (0, "end"))


class Archive(unittest.TestCase):
    def archive_env(self, **over):
        values = {"INGEST_SOURCE": "archive", "INGEST_ARCHIVE_FROM": "2026-10-28", "INGEST_ARCHIVE_TO": "2026-10-30", "INGEST_MODE": "load-only"}
        values.update(over)
        return env(**values)

    def test_archive_url_and_dates_as_given(self):
        net = FakeNet([page([item(1)])])
        code, lines, _ = run(self.archive_env(), net)
        self.assertEqual(code, 0)
        base, query = net.newsdata_query()
        self.assertEqual(base, ARCHIVE)
        self.assertEqual((query["from_date"], query["to_date"]), ("2026-10-28", "2026-10-30"))
        self.assertNotIn("timeframe", query)
        result = summary(lines)
        self.assertEqual((result["source"], result["credits"]), ("archive", 5))

    def test_archive_datetime_form_passes(self):
        net = FakeNet([page([item(1)])])
        run(self.archive_env(INGEST_ARCHIVE_FROM="2026-10-28 15:00:00", INGEST_ARCHIVE_TO="2026-11-02 14:59:59"), net)
        query = net.newsdata_query()[1]
        self.assertEqual((query["from_date"], query["to_date"]), ("2026-10-28 15:00:00", "2026-11-02 14:59:59"))

    def test_date_only_to_means_end_of_that_day(self):
        # 끝을 날짜로만 주면 그날 끝까지로 견준다 — 같은 날 낮부터 그날까지는 거꾸로가 아니다
        net = FakeNet([page([item(1)])])
        code, _, _ = run(self.archive_env(INGEST_ARCHIVE_FROM="2026-10-30 12:00:00", INGEST_ARCHIVE_TO="2026-10-30"), net)
        self.assertEqual(code, 0)

    def test_bad_archive_config_exits_2(self):
        bad = [
            self.archive_env(INGEST_ARCHIVE_FROM=None),
            self.archive_env(INGEST_ARCHIVE_TO=""),
            self.archive_env(INGEST_ARCHIVE_FROM="2026-10-31", INGEST_ARCHIVE_TO="2026-10-30"),
            self.archive_env(INGEST_ARCHIVE_FROM="2026-10-28T15:00:00"),
            self.archive_env(INGEST_ARCHIVE_TO="2026-10-32"),
            self.archive_env(INGEST_TIMEFRAME="36"),
            env(INGEST_SOURCE="latest", INGEST_ARCHIVE_FROM="2026-10-28"),
            env(INGEST_ARCHIVE_TO="2026-10-30"),
            env(INGEST_SOURCE="history"),
        ]
        for environ in bad:
            with self.subTest(environ=environ):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(environ, net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])

    def test_sleeps_only_between_requests(self):
        slept = []
        net = FakeNet([page([item(1)], "n1"), page([item(2)], "n2"), page([item(3)])])
        code, lines, _ = run(self.archive_env(INGEST_REQUEST_INTERVAL="3"), net, sleep=slept.append)
        self.assertEqual(code, 0)
        self.assertEqual(slept, [3, 3])
        self.assertEqual(summary(lines)["credits"], 15)

    def test_no_sleep_when_interval_empty(self):
        slept = []
        net = FakeNet([page([item(1)], "n1"), page([item(2)])])
        run(env(), net, sleep=slept.append)
        self.assertEqual(slept, [])

    def test_bad_interval_exits_2(self):
        for value in ("-1", "61", "abc", "1.5"):
            with self.subTest(value=value):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(env(INGEST_REQUEST_INTERVAL=value), net)
                self.assertEqual(code, 2)


class Query(unittest.TestCase):
    def test_default_is_korea_korean(self):
        net = FakeNet([page([item(1)])])
        run(env(), net)
        _, query = net.newsdata_query()
        self.assertEqual({k: v for k, v in query.items() if k != "apikey"}, {"country": "kr", "language": "ko"})

    def test_conditions_are_sent(self):
        raw = "country=kr&language=ko&category=politics,business&domainurl=yna.co.kr,news1.kr&sort=pubdateasc&removeduplicate=1"
        net = FakeNet([page([item(1)])])
        run(env(INGEST_QUERY=raw), net)
        _, query = net.newsdata_query()
        self.assertEqual(query["category"], "politics,business")
        self.assertEqual(query["domainurl"], "yna.co.kr,news1.kr")
        self.assertEqual((query["sort"], query["removeduplicate"]), ("pubdateasc", "1"))
        self.assertEqual(query["apikey"], KEY)  # 키는 스크립트가 붙인다

    def test_blocked_unknown_or_empty_keys_exit_2(self):
        for raw in ("apikey=zzz", "country=kr&page=abc", "timeframe=3", "from_date=2026-10-01", "to_date=2026-10-02", "timezone=asia/seoul",
                    "country=kr&foo=1", "country=", "country", "country=kr&country=us", "country=kr&&language=ko"):
            with self.subTest(raw=raw):
                net = FakeNet([page([item(1)])])
                code, _, _ = run(env(INGEST_QUERY=raw), net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])


class Dedupe(unittest.TestCase):
    def test_same_article_id_with_other_link_sent_once(self):
        net = FakeNet([page([item(1), item(2, article_id=item(1)["article_id"])])])
        _, lines, _ = run(env(), net)
        self.assertEqual(len(net.b2_calls()), 1)
        self.assertEqual(summary(lines)["skipped"]["duplicate"], 1)


class StopReasons(unittest.TestCase):
    """stoppedBy — 다음 쪽이 남았는데 멈추면 빠진 구간이 있다. 상한이면 받은 데까지 넣고 종료 2(다시 해도 같은 상한)"""

    def test_end_when_no_next_page(self):
        net = FakeNet([page([item(1)], "n1"), page([item(2)])])
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["stoppedBy"], "end")

    def test_ceilings_accept_planned_values(self):
        net = FakeNet([page([item(1)])])
        code, _, _ = run(env(INGEST_MAX_ARTICLES="20000", INGEST_MAX_REQUESTS="500"), net)
        self.assertEqual(code, 0)

    def test_max_requests_with_next_page_loads_then_exits_2(self):
        for make in (env, auto_env):
            with self.subTest(mode=make().get("INGEST_MODE")):
                net = FakeNet([page([item(1)], "n1"), page([item(2)], "n2")])
                code, lines, _ = run(make(INGEST_MAX_REQUESTS="2"), net)
                self.assertEqual(code, 2)
                self.assertEqual(len(net.b2_calls()), 2)
                self.assertEqual(summary(lines)["stoppedBy"], "max_requests")
        net = FakeNet([page([item(1)], "n1"), page([item(2)], "n2")])
        run(auto_env(INGEST_MAX_REQUESTS="2"), net)
        self.assertEqual(len(net.b1_calls()), 2)  # auto 는 상한에 닿아도 자동 투입까지 한 뒤 종료 2(큰 값)

    def test_max_articles_with_more_left_exits_2(self):
        net = FakeNet([page([item(1), item(2), item(3)])])
        code, lines, _ = run(env(INGEST_MODE="load-only", INGEST_MAX_ARTICLES="2"), net)
        self.assertEqual(code, 2)
        self.assertEqual(len(net.b2_calls()), 2)
        self.assertEqual(summary(lines)["stoppedBy"], "max_articles")

    def test_fetch_only_with_next_page_is_still_success(self):
        net = FakeNet([page([item(1)], "n1")])
        code, lines, _ = run(env(INGEST_MODE="fetch-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["stoppedBy"], "max_requests")

    def test_later_newsdata_failure_loads_what_came_then_exits_1(self):
        for failure in ((500, {"status": "error"}), urllib.error.URLError("끊김")):
            with self.subTest(failure=failure):
                net = FakeNet([page([item(1), item(2)], "n1"), failure])
                code, lines, _ = run(env(INGEST_MODE="load-only"), net)
                self.assertEqual(code, 1)
                self.assertEqual(len(net.b2_calls()), 2)
                self.assertEqual(summary(lines)["stoppedBy"], "newsdata_error")

    def test_later_newsdata_auth_error_loads_what_came_then_exits_2(self):
        # 둘째 쪽에서 키를 안 받음(구독 · 크레딧이 끝남 등) — 받은 쪽은 넣고, 다시 해도 같으니 2
        for status in (401, 403):
            with self.subTest(status=status):
                net = FakeNet([page([item(1), item(2)], "n1"), (status, {"status": "error"})])
                code, lines, _ = run(env(INGEST_MODE="load-only"), net)
                self.assertEqual(code, 2)
                self.assertEqual(len(net.b2_calls()), 2)
                self.assertEqual(summary(lines)["stoppedBy"], "newsdata_auth")

    def test_first_newsdata_failure_sends_nothing(self):
        net = FakeNet([(500, {"status": "error"})])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 1)
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual(summary(lines)["stoppedBy"], "newsdata_error")


class AscendingStop(unittest.TestCase):
    """sort=pubdateasc 이고 날짜 범위가 있으면, 쪽 전체가 범위 뒤일 때 멈춘다 — 그날 0 ~ 10시 쪽들을 안 받는다.
    한 건만 범위 뒤인 쪽에서는 멈추지 않는다(정렬이 한 건 어긋나도 어제 기사를 잃지 않게, 요청 하나를 더 쓴다)"""

    ASC = "country=kr&language=ko&sort=pubdateasc"

    def pages(self):
        return [
            page([day_item(1, "2026-11-02 14:30:00"), day_item(2, "2026-11-02 15:10:00")], "n1"),   # 그제 밤 · 어제
            page([day_item(3, "2026-11-03 12:00:00"), day_item(4, "2026-11-03 15:00:01")], "n2"),   # 어제 · 오늘 0시 뒤 — 섞임
            page([day_item(5, "2026-11-03 18:00:00"), day_item(6, "2026-11-03 19:00:00")], "n3"),   # 모두 오늘 — 여기서 멈춤
            page([day_item(7, "2026-11-03 20:00:00")]),                                           # 받으면 안 됨
        ]

    def asc_env(self, **over):
        return env(INGEST_MODE="load-only", INGEST_QUERY=self.ASC, INGEST_DAYS="yesterday", **over)

    def sent(self, net):
        return sorted(json.loads(c[3])["url"].rsplit("/", 1)[1] for c in net.b2_calls())

    def test_stops_after_page_entirely_past_range(self):
        net = FakeNet(self.pages())
        code, lines, _ = run(self.asc_env(INGEST_MAX_REQUESTS="10"), net, now=NOW)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.newsdata_calls()), 3)
        self.assertEqual(self.sent(net), ["2", "3"])
        result = summary(lines)
        self.assertEqual(result["stoppedBy"], "past_range")
        self.assertEqual(result["skipped"]["out_of_range"], 4)

    def test_one_late_item_does_not_stop(self):
        # 범위 뒤 기사가 한 건 끼어도 그 쪽에 범위 안 기사가 있으면 다음 쪽을 받는다
        pages = [page([day_item(1, "2026-11-03 01:00:00"), day_item(9, "2026-11-04 01:00:00")], "n1"), page([day_item(2, "2026-11-03 02:00:00")])]
        net = FakeNet(pages)
        code, lines, _ = run(self.asc_env(), net, now=NOW)
        self.assertEqual((code, len(net.newsdata_calls()), self.sent(net), summary(lines)["stoppedBy"]), (0, 2, ["1", "2"], "end"))

    def test_no_stop_without_ascending_sort(self):
        net = FakeNet(self.pages())
        _, lines, _ = run(env(INGEST_MODE="load-only", INGEST_DAYS="yesterday", INGEST_MAX_REQUESTS="10"), net, now=NOW)
        self.assertEqual(len(net.newsdata_calls()), 4)
        self.assertEqual(summary(lines)["stoppedBy"], "end")

    def test_no_stop_without_days(self):
        net = FakeNet(self.pages())
        run(env(INGEST_MODE="load-only", INGEST_QUERY=self.ASC, INGEST_DAYS="", INGEST_MAX_REQUESTS="10"), net, now=NOW)
        self.assertEqual(len(net.newsdata_calls()), 4)

    def test_before_range_does_not_stop(self):
        # 오래된 순이라 처음 쪽은 그제 밤(범위 앞)이다 — 멈추면 안 된다
        pages = [page([day_item(1, "2026-11-02 14:00:00")], "n1"), page([day_item(2, "2026-11-02 16:00:00")])]
        net = FakeNet(pages)
        code, lines, _ = run(self.asc_env(), net, now=NOW)
        self.assertEqual((code, len(net.newsdata_calls()), summary(lines)["stoppedBy"]), (0, 2, "end"))

    def test_article_limit_wins_over_past_range(self):
        # 상한에 걸린 범위 안 기사가 있으면 범위를 지나도 「상한」 — 종료 2(경보)
        pages = [page([day_item(2, "2026-11-02 16:00:00"), day_item(3, "2026-11-02 17:00:00"), day_item(5, "2026-11-03 18:00:00")], "n1"), page([day_item(6, "2026-11-03 19:00:00")], "n2")]
        net = FakeNet(pages)
        code, lines, _ = run(self.asc_env(INGEST_MAX_ARTICLES="1"), net, now=NOW)
        self.assertEqual(code, 2)
        self.assertEqual(summary(lines)["stoppedBy"], "max_articles")

    def test_filtered_items_still_mark_position(self):
        # 본문 없는 기사도 시각이 있으면 위치를 알려 준다 — 그 쪽 전체가 범위 뒤면 멈춘다
        pages = [page([day_item(2, "2026-11-02 16:00:00")], "n1"), page([day_item(5, "2026-11-03 18:00:00", content=None)], "n2"), page([day_item(6, "2026-11-03 19:00:00")])]
        net = FakeNet(pages)
        _, lines, _ = run(self.asc_env(), net, now=NOW)
        self.assertEqual((len(net.newsdata_calls()), summary(lines)["stoppedBy"]), (2, "past_range"))

    def test_items_without_usable_time_do_not_stop_or_crash(self):
        # pubDate 칸이 없거나 UTC 가 아닌 기사는 위치로 쓰지 않는다(KeyError 로 실행 전체가 죽으면 안 된다)
        no_time = item(5, content=None)
        del no_time["pubDate"]
        pages = [page([day_item(2, "2026-11-02 16:00:00")], "n1"), page([no_time, day_item(6, "2026-11-03 19:00:00", pubDateTZ="Asia/Seoul")], "n2"), page([day_item(3, "2026-11-02 17:00:00")])]
        net = FakeNet(pages)
        code, lines, _ = run(self.asc_env(), net, now=NOW)
        self.assertEqual((code, len(net.newsdata_calls()), summary(lines)["stoppedBy"]), (0, 3, "end"))


class SummaryFields(unittest.TestCase):
    def test_pub_dates_source_and_credits(self):
        net = FakeNet([page([day_item(3, "2026-11-02 10:03:00"), day_item(1, "2026-11-01 23:59:00"), day_item(2, "bad")])])
        _, lines, _ = run(env(), net)
        result = summary(lines)
        self.assertEqual(result["pubDates"], {"min": "2026-11-01 23:59:00", "max": "2026-11-02 10:03:00"})
        self.assertEqual((result["source"], result["credits"]), ("latest", 1))

    def test_pub_dates_null_when_nothing_fetched(self):
        net = FakeNet([page([])])
        _, lines, _ = run(env(), net)
        self.assertIsNone(summary(lines)["pubDates"])


# ── INGEST_SOURCE=file — 지난 기사 파일(B2 요청 모양 JSONL)을 표준 입력으로 넣기 (Jira S15P31A102-169) ──

def b2_line(n, **over):
    """infra/server/sqlite_to_b2.py 가 쓰는 줄 모양 — 값은 지어낸 것"""
    body = {
        "url": f"https://news.example.com/old/{n}",
        "pressSourceId": "garam_kr",
        "pressName": "가람일보",
        "title": f"지난 기사 {n}",
        "body": f"본문 {n}",
        "publishedAt": f"2026-10-2{n % 10}T09:00:00+09:00",
        "sourceCategories": ["top", "business"],
    }
    body.update(over)
    return body


def jsonl(*rows):
    """줄 목록 → 바이트. dict 는 JSON 으로, 글자는 그대로(깨진 줄 시험)"""
    out = []
    for row in rows:
        out.append(json.dumps(row, ensure_ascii=False) if isinstance(row, dict) else row)
    return "".join(line + "\n" for line in out).encode("utf-8")


def daily_env(**over):
    """news-ingest.yaml 의 매일 env 에서 INGEST_SOURCE 만 file 로 — 손 Job 이 CronJob 틀을 그대로 물려받는다"""
    values = {
        "INGEST_MODE": "load-only",
        "INGEST_SOURCE": "file",
        "INGEST_TIMEFRAME": "36",
        "INGEST_DAYS": "yesterday",
        "INGEST_QUERY": "country=kr&language=ko&removeduplicate=1&sort=pubdateasc",
        "INGEST_MAX_REQUESTS": "500",
        "INGEST_MAX_ARTICLES": "2",
        "NEWSDATA_API_KEY": KEY,
        "INTERNAL_BATCH_KEY": BATCH_KEY,
        "BACKEND_URL": BACKEND,
    }
    values.update(over)
    return {k: v for k, v in values.items() if v is not None}


def run_file(environ, net, data):
    out = io.StringIO()
    stdin = data if not isinstance(data, bytes) else io.BytesIO(data)
    code = news_ingest.main(environ, net, out, stdin=stdin)
    text = out.getvalue()
    return code, [json.loads(line) for line in text.splitlines()], text


class FileSource(unittest.TestCase):
    def test_daily_env_with_file_source_sends_every_line_and_ignores_newsdata_settings(self):
        net = FakeNet()
        rows = [b2_line(1), b2_line(2), b2_line(3)]
        code, lines, _ = run_file(daily_env(), net, jsonl(*rows))
        self.assertEqual(code, 0)
        self.assertEqual(net.newsdata_calls(), [])
        self.assertEqual(net.b1_calls(), [])
        # INGEST_MAX_ARTICLES=2 · INGEST_DAYS=yesterday 가 있어도 파일의 줄을 모두 보낸다
        self.assertEqual([json.loads(c[3]) for c in net.b2_calls()], rows)
        result = summary(lines)
        self.assertEqual(result["source"], "file")
        self.assertEqual(result["mode"], "load-only")
        self.assertEqual(result["lines"], 3)
        self.assertEqual(result["badLines"], 0)
        self.assertEqual(result["b2"], {"created": 3, "existing": 0, "rejected": 0, "failed": 0})

    def test_newsdata_key_is_not_needed(self):
        net = FakeNet()
        code, _, _ = run_file(daily_env(NEWSDATA_API_KEY=None), net, jsonl(b2_line(1)))
        self.assertEqual(code, 0)
        self.assertEqual(len(net.b2_calls()), 1)

    def test_only_load_only(self):
        for mode in ("full", "fetch-only"):
            net = FakeNet()
            code, lines, _ = run_file(daily_env(INGEST_MODE=mode), net, jsonl(b2_line(1)))
            self.assertEqual(code, 2, mode)
            self.assertEqual(lines[0]["msg"], "설정 오류")
            self.assertEqual(net.calls, [])

    def test_batch_key_and_backend_still_required(self):
        for over in ({"INTERNAL_BATCH_KEY": None}, {"BACKEND_URL": "backend:8080"}):
            net = FakeNet()
            code, _, _ = run_file(daily_env(**over), net, jsonl(b2_line(1)))
            self.assertEqual(code, 2, over)
            self.assertEqual(net.calls, [])

    def test_bad_lines_are_not_sent_and_fail_the_run(self):
        net = FakeNet()
        no_url = b2_line(3)
        del no_url["url"]
        data = jsonl(b2_line(1), "{not json", '["array"]', no_url, b2_line(4, title="   "), "", b2_line(5))
        data += b"\xff\xfe\n"  # UTF-8 이 아닌 줄
        code, lines, _ = run_file(daily_env(), net, data)
        self.assertEqual(code, 1)
        self.assertEqual([json.loads(c[3])["url"] for c in net.b2_calls()],
                         ["https://news.example.com/old/1", "https://news.example.com/old/5"])
        result = summary(lines)
        self.assertEqual(result["lines"], 8)
        self.assertEqual(result["badLines"], 6)
        bad = [line["line"] for line in lines if line.get("msg") == "못 읽은 줄"]
        self.assertEqual(bad, [2, 3, 4, 5, 6, 8])

    def test_expected_lines_must_match(self):
        net = FakeNet()
        code, lines, _ = run_file(daily_env(INGEST_FILE_LINES="4"), net, jsonl(b2_line(1), b2_line(2), b2_line(3)))
        self.assertEqual(code, 1)
        self.assertEqual(len(net.b2_calls()), 3)
        self.assertEqual(summary(lines)["expectedLines"], 4)
        self.assertTrue(any(line.get("msg") == "줄 수가 다르다" for line in lines))

    def test_expected_lines_match_is_success(self):
        code, lines, _ = run_file(daily_env(INGEST_FILE_LINES="2"), FakeNet(), jsonl(b2_line(1), b2_line(2)))
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["expectedLines"], 2)

    def test_expected_lines_must_be_a_positive_integer(self):
        for raw in ("abc", "0", "-1", "1e3"):
            net = FakeNet()
            code, _, _ = run_file(daily_env(INGEST_FILE_LINES=raw), net, jsonl(b2_line(1)))
            self.assertEqual(code, 2, raw)
            self.assertEqual(net.calls, [])

    def test_existing_urls_are_fine_so_a_rerun_succeeds(self):
        code, lines, _ = run_file(daily_env(), FakeNet(), jsonl(b2_line(1), b2_line(1)))
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["b2"]["existing"], 1)

    def test_rejected_line_fails_the_run(self):
        def b2(article):
            if article["url"].endswith("/2"):
                return 400, {"errors": [{"field": "body"}]}
            return 201, {"articleId": 7, "created": True}

        code, lines, _ = run_file(daily_env(), FakeNet(b2=b2), jsonl(b2_line(1), b2_line(2), b2_line(3)))
        self.assertEqual(code, 1)
        self.assertEqual(summary(lines)["b2"]["rejected"], 1)

    def test_server_error_fails_the_run(self):
        code, lines, _ = run_file(daily_env(), FakeNet(b2=lambda a: (500, b"oops")), jsonl(b2_line(1)))
        self.assertEqual(code, 1)
        self.assertEqual(summary(lines)["b2"]["failed"], 1)

    def test_auth_error_stops_with_two(self):
        net = FakeNet(b2=lambda a: (401, {"title": "no"}))
        code, lines, text = run_file(daily_env(), net, jsonl(b2_line(1), b2_line(2)))
        self.assertEqual(code, 2)
        self.assertEqual(len(net.b2_calls()), 1)
        self.assertEqual(summary(lines)["source"], "file")
        self.assertNotIn(BATCH_KEY, text)

    def test_backend_down_stops_with_one(self):
        def b2(article):
            raise ConnectionRefusedError("refused")

        net = FakeNet(b2=b2)
        code, lines, _ = run_file(daily_env(), net, jsonl(*[b2_line(n) for n in range(1, 7)]))
        self.assertEqual(code, 1)
        self.assertEqual(len(net.b2_calls()), news_ingest.BACKEND_DOWN_AFTER)
        self.assertEqual(summary(lines)["b2"]["failed"], news_ingest.BACKEND_DOWN_AFTER)

    def test_progress_line_every_n_lines(self):
        with mock.patch.object(news_ingest, "FILE_PROGRESS_LINES", 2):
            code, lines, _ = run_file(daily_env(), FakeNet(), jsonl(*[b2_line(n) for n in range(1, 6)]))
        self.assertEqual(code, 0)
        progress = [line for line in lines if line.get("msg") == "진행"]
        self.assertEqual([p["lines"] for p in progress], [2, 4])
        self.assertIn("b2", progress[0])

    def test_reads_one_line_at_a_time(self):
        """8만 줄 · 270MB 를 메모리에 올리지 않는다 — 첫 B2 를 부를 때 한 줄만 읽혀 있어야 한다"""
        data = jsonl(b2_line(1), b2_line(2), b2_line(3)).splitlines(keepends=True)

        class Stream:
            consumed = 0

            def __iter__(self):
                for line in data:
                    Stream.consumed += 1
                    yield line

            def read(self, *args):
                raise AssertionError("통째로 읽지 않는다")

        seen = []

        def b2(article):
            seen.append(Stream.consumed)
            return 201, {"articleId": len(seen), "created": True}

        code, _, _ = run_file(daily_env(), FakeNet(b2=b2), Stream())
        self.assertEqual(code, 0)
        self.assertEqual(seen, [1, 2, 3])

    def test_empty_file_fails(self):
        code, lines, _ = run_file(daily_env(), FakeNet(), b"")
        self.assertEqual(code, 1)
        self.assertEqual(summary(lines)["lines"], 0)

    def test_latest_still_ignores_stdin(self):
        """매일 수집(latest)은 표준 입력을 읽지 않는다"""
        net = FakeNet(pages=[page([item(1)])])

        class Untouched(io.BytesIO):
            def __iter__(self):
                raise AssertionError("latest 가 표준 입력을 읽었다")

        out = io.StringIO()
        code = news_ingest.main(env(INGEST_MODE="load-only"), net, out, now=NOW, stdin=Untouched(b""))
        self.assertEqual(code, 0)
        self.assertEqual(len(net.b2_calls()), 1)


# ── 다른 기사 본문을 달고 온 기사 (Jira S15P31A102-183) ─ NewsData content 가 짧은 기사에 다른 기사 묶음 · 안내문을 준다


def filler(chars, text="오늘 날씨는 맑고 바람이 조금 분다. "):
    """제목 낱말이 안 나오는 본문 — 정확히 chars 글자"""
    return (text * (chars // len(text) + 1))[:chars]


def urls_sent(net):
    return [json.loads(c[3])["url"] for c in net.b2_calls()]


class WrongBodySameBody(unittest.TestCase):
    """(a) 한 번 수집 안에서 같은 언론사 · 같은 본문을 제목이 다른 기사 3건 이상이 쓰면 모두 뺀다"""

    def fetch(self, items):
        net = FakeNet([page(items)])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        return net, summary(lines)

    def test_three_titles_all_dropped(self):
        body = filler(600)
        items = [item(n, title=f"가람시 소식 {n}", content=body) for n in (1, 2, 3)] + [item(4)]
        net, result = self.fetch(items)
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        self.assertEqual(result["skipped"]["wrong_body"], 3)
        self.assertEqual(result["kept"], 1)

    def test_two_titles_with_title_words_kept(self):
        # 같은 기사에 제목만 달리 단 정상 기사가 있다 — 제목 낱말이 본문에 있으면 짝 규칙에도 안 걸린다
        body = filler(600) + " 가람시 소식"
        net, result = self.fetch([item(n, title=f"가람시 소식 {n}", content=body) for n in (1, 2)])
        self.assertEqual(len(net.b2_calls()), 2)
        self.assertEqual(result["skipped"]["wrong_body"], 0)

    def test_same_title_three_times_kept(self):
        # 제목이 같으면 같은 기사가 URL 만 다른 것이다
        body = filler(600)
        net, result = self.fetch([item(n, title="가람시 소식", content=body) for n in (1, 2, 3)])
        self.assertEqual(len(net.b2_calls()), 3)
        self.assertEqual(result["skipped"]["wrong_body"], 0)

    def test_short_body_kept_at_499_dropped_at_500(self):
        short = "가" * 499
        net, _ = self.fetch([item(n, title=f"가람시 소식 {n}", content=short) for n in (1, 2, 3)])
        self.assertEqual(len(net.b2_calls()), 3)
        enough = "가" * 500
        net, _ = self.fetch([item(n, title=f"가람시 소식 {n}", content=enough) for n in (1, 2, 3)])
        self.assertEqual(net.b2_calls(), [])

    def test_other_press_not_grouped(self):
        body = filler(600)
        items = [item(n, title=f"가람시 소식 {n}", content=body, source_id=f"press_{n}") for n in (1, 2, 3)]
        net, _ = self.fetch(items)
        self.assertEqual(len(net.b2_calls()), 3)

    def test_spaces_around_body_do_not_matter(self):
        body = filler(600)
        items = [
            item(1, title="가람시 소식 1", content=" " + body),
            item(2, title="가람시 소식 2", content=body + "\n"),
            item(3, title="가람시 소식 3", content=body),
        ]
        net, _ = self.fetch(items)
        self.assertEqual(net.b2_calls(), [])

    def test_spaces_do_not_reach_the_500_limit(self):
        body = "가" * 499 + " "
        net, _ = self.fetch([item(n, title=f"가람시 소식 {n}", content=body) for n in (1, 2, 3)])
        self.assertEqual(len(net.b2_calls()), 3)

    def test_same_body_across_pages_grouped(self):
        # 다 받은 뒤 견준다 — 실제 실행은 300쪽 가까이 돈다
        body = filler(600)
        first = [item(n, title=f"가람시 소식 {n}", content=body) for n in (1, 2)]
        last = [item(3, title="가람시 소식 3", content=body), item(4)]
        net = FakeNet([page(first, "n1"), page(last)])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        self.assertEqual(summary(lines)["skipped"]["wrong_body"], 3)

    def test_title_words_do_not_save_it(self):
        # 묶음의 1등을 남기지 않는다 — 흔한 낱말이 긴 본문에 우연히 있어도 다른 기사 본문이다
        body = filler(600) + " 가람시 소식"
        items = [item(n, title="가람시 소식" if n == 1 else f"다른 제목 {n}", content=body) for n in (1, 2, 3)]
        net, result = self.fetch(items)
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual(result["skipped"]["wrong_body"], 3)


class WrongBodySameBodyPair(unittest.TestCase):
    """(c) 같은 언론사 · 같은 본문을 제목 정확히 2개가 쓰고, 두 제목 모두 낱말 비율 20% 이하면 둘 다 뺀다"""

    TITLE_A = "가람시 소식"
    TITLE_B = "나래군 안내"

    def fetch(self, items):
        net = FakeNet([page(items)])
        code, lines, text = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        return net, lines, text

    def pair(self, share_a, share_b):
        """제목 낱말 100개 중 앞의 share 개만 본문에 나오는 기사 둘. 자릿수를 맞춰 낱말끼리 부분 문자열로 맞지 않게 한다"""
        words_a = [f"가말{n:03d}" for n in range(100)]
        words_b = [f"나말{n:03d}" for n in range(100)]
        body = " ".join([filler(600)] + words_a[:share_a] + words_b[:share_b])
        return [item(1, title=" ".join(words_a), content=body), item(2, title=" ".join(words_b), content=body)]

    def dropped(self, lines):
        return {d["url"]: d for d in lines if d.get("msg") == "본문 불일치로 뺌"}

    def test_pair_without_title_words_dropped(self):
        net, lines, text = self.fetch(self.pair(0, 0) + [item(4)])
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        result = summary(lines)
        self.assertEqual(result["skipped"]["wrong_body"], 2)
        self.assertEqual(result["kept"], 1)
        self.assertEqual(result["fetched"], result["kept"] + sum(result["skipped"].values()))
        dropped = self.dropped(lines)
        self.assertEqual(set(dropped), {item(1)["link"], item(2)["link"]})
        self.assertEqual({d["rule"] for d in dropped.values()}, {"same_body_pair"})
        self.assertEqual({d["sameBodyTitles"] for d in dropped.values()}, {2})
        self.assertNotIn(filler(600), text)

    def test_exactly_20_percent_dropped(self):
        net, lines, _ = self.fetch(self.pair(20, 20))
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual(summary(lines)["skipped"]["wrong_body"], 2)

    def test_one_title_over_20_percent_keeps_both(self):
        # 한쪽 제목 낱말이 본문에 있으면 정상 기사에 다른 제목을 단 경우일 수 있다
        for shares in ((21, 0), (0, 21)):
            with self.subTest(shares=shares):
                net, lines, _ = self.fetch(self.pair(*shares))
                self.assertEqual(len(net.b2_calls()), 2)
                self.assertEqual(summary(lines)["skipped"]["wrong_body"], 0)

    def test_counts_titles_not_articles(self):
        # 제목 A · A · B — 같은 제목이 URL 만 달라도 제목은 2개다
        body = filler(600)
        items = [item(1, title=self.TITLE_A, content=body), item(2, title=self.TITLE_A, content=body), item(3, title=self.TITLE_B, content=body)]
        net, lines, _ = self.fetch(items)
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual({d["rule"] for d in self.dropped(lines).values()}, {"same_body_pair"})
        self.assertEqual(summary(lines)["skipped"]["wrong_body"], 3)

    def test_three_titles_stay_with_same_body_rule(self):
        body = filler(600)
        net, lines, _ = self.fetch([item(n, title=f"가람시 소식 {n}", content=body) for n in (1, 2)] + [item(3, title=self.TITLE_B, content=body)])
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual({d["rule"] for d in self.dropped(lines).values()}, {"same_body"})

    def test_body_length_boundary(self):
        for body, sent in (("가" * 499, 2), ("가" * 499 + " ", 2), ("가" * 500, 0)):
            with self.subTest(chars=len(body), sent=sent):
                net, _, _ = self.fetch([item(1, title=self.TITLE_A, content=body), item(2, title=self.TITLE_B, content=body)])
                self.assertEqual(len(net.b2_calls()), sent)

    def test_spaces_around_body_do_not_matter(self):
        body = filler(600)
        net, _, _ = self.fetch([item(1, title=self.TITLE_A, content=" " + body), item(2, title=self.TITLE_B, content=body + "\n")])
        self.assertEqual(net.b2_calls(), [])

    def test_other_press_not_grouped(self):
        body = filler(600)
        net, _, _ = self.fetch([item(1, title=self.TITLE_A, content=body, source_id="press_1"), item(2, title=self.TITLE_B, content=body, source_id="press_2")])
        self.assertEqual(len(net.b2_calls()), 2)

    def test_same_title_twice_kept(self):
        # 제목이 같으면 같은 기사가 URL 만 다른 것이다
        body = filler(600)
        net, _, _ = self.fetch([item(n, title=self.TITLE_A, content=body) for n in (1, 2)])
        self.assertEqual(len(net.b2_calls()), 2)

    def test_title_without_words_keeps_pair(self):
        # 낱말이 없는 제목은 비율 1.0 — 판단할 근거가 없다
        body = filler(600)
        net, _, _ = self.fetch([item(1, title="!!", content=body), item(2, title=self.TITLE_B, content=body)])
        self.assertEqual(len(net.b2_calls()), 2)

    def test_title_not_text_is_left_to_b2_and_rest_judged(self):
        body = filler(600)
        for title in (None, 123, ["가람시"]):
            with self.subTest(title=title):
                items = [item(1, title=self.TITLE_A, content=body), item(2, title=self.TITLE_B, content=body), item(3, title=title, content=body)]
                net, lines, _ = self.fetch(items)
                self.assertEqual([json.loads(c[3])["title"] for c in net.b2_calls()], [title])
                self.assertEqual(summary(lines)["skipped"]["wrong_body"], 2)

    def test_title_not_text_does_not_make_a_pair(self):
        body = filler(600)
        net, lines, _ = self.fetch([item(1, title=self.TITLE_A, content=body), item(2, title=None, content=body)])
        self.assertEqual(len(net.b2_calls()), 2)
        self.assertEqual(summary(lines)["skipped"]["wrong_body"], 0)

    def test_press_not_text_is_not_judged(self):
        body = filler(600)
        items = [item(1, title=self.TITLE_A, content=body, source_id=["garam_kr"]), item(2, title=self.TITLE_B, content=body, source_id=["garam_kr"])]
        net, _, _ = self.fetch(items)
        self.assertEqual(len(net.b2_calls()), 2)

    def test_pair_across_pages_dropped(self):
        first, second = self.pair(0, 0)
        net = FakeNet([page([first], "n1"), page([second, item(4)])])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        self.assertEqual(summary(lines)["skipped"]["wrong_body"], 2)

    def test_long_brief_keeps_its_rule(self):
        # 기존 규칙에 걸리던 기사의 rule 이 바뀌지 않는다
        body = filler(6000)
        net, lines, _ = self.fetch([item(1, title="[부고] 김가람씨 별세", content=body), item(2, title=self.TITLE_B, content=body)])
        self.assertEqual(net.b2_calls(), [])
        rules = {url: d["rule"] for url, d in self.dropped(lines).items()}
        self.assertEqual(rules, {item(1)["link"]: "long_brief", item(2)["link"]: "same_body_pair"})


class WrongBodyLongBrief(unittest.TestCase):
    """(b) 단신 제목 + 본문 5,000자 이상 + 제목 낱말 비율 50% 이하"""

    def sent(self, title, content):
        net = FakeNet([page([item(1, title=title, content=content)])])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        return len(net.b2_calls()), summary(lines)["skipped"]["wrong_body"]

    def test_brief_title_long_body_no_title_words_dropped(self):
        for title in ("[부고] 김가람씨 별세", "[부음] 김가람씨", "[인사] 가람시청", "[포토] 가을 은행나무길", "[사진] 가을 은행나무길",
                      "[속보] 가람시 화재", "[그래픽] 가람시 예산", "[영상] 가람시 축제", "[만평] 가람시", " [속보] 앞에 공백"):
            with self.subTest(title=title):
                self.assertEqual(self.sent(title, filler(5000)), (0, 1))

    def test_brief_word_anywhere_in_title_dropped(self):
        for title in ("김가람(가람일보 부장)씨 부친상", "김가람씨 모친상", "김가람씨 빙부상", "김가람씨 빙모상", "김가람씨 시모상", "김가람씨 장인상",
                      "[국민만평-김가람 화백] 11월 5일"):
            with self.subTest(title=title):
                self.assertEqual(self.sent(title, filler(5000)), (0, 1))

    def test_body_shorter_than_5000_kept(self):
        self.assertEqual(self.sent("[부고] 김가람씨 별세", filler(4999)), (1, 0))

    def test_exactly_half_of_title_words_dropped(self):
        self.assertEqual(self.sent("[속보] 가람시 화재", filler(5000) + " 가람시"), (0, 1))

    def test_more_than_half_of_title_words_kept(self):
        # 진짜 긴 부고 · 속보
        self.assertEqual(self.sent("[속보] 가람시 화재 진압", filler(5000) + " 가람시 화재"), (1, 0))

    def test_not_brief_title_kept(self):
        # 제목을 멋대로 단 사설 · 칼럼은 비율이 낮아도 남는다
        self.assertEqual(self.sent("가을이 오면 생각나는 것들", filler(9000)), (1, 0))

    def test_tag_after_title_kept(self):
        # 제목 뒤에 붙은 태그는 단신이 아니다 — 인터뷰 · 사진 기사
        self.assertEqual(self.sent("가을 은행나무길 인터뷰 [영상]", filler(7000)), (1, 0))
        self.assertEqual(self.sent("가을 은행나무길 수달 [포토]", filler(7000)), (1, 0))

    def test_title_without_words_counts_as_full_share(self):
        self.assertEqual(self.sent("[속보] !!", filler(5000)), (1, 0))
        # 한 글자는 낱말로 세지 않는다
        self.assertEqual(self.sent("[속보] 가 나 다", filler(5000)), (1, 0))

    def test_spaces_do_not_reach_the_5000_limit(self):
        self.assertEqual(self.sent("[부고] 김가람씨 별세", "가" * 4999 + " "), (1, 0))


class NoticeOnly(unittest.TestCase):
    """본문이 언론사 안내문뿐인 기사 — skipped.notice_only 로 따로 센다(다른 기사 본문인 wrong_body 와 결과 줄에서 나뉘게)

    screen_text: 경향 날씨 · 만평이 화면 문구(설정 · 뉴스레터 · 개인정보 안내) 478자만 달고 온다(11/2 ~ 11/10 에 7번)
    video_only: SBS 「클로징」 · 「여담야담」이 RSS 안내 + 구분선 + 「자세한 내용은 동영상으로」만 달고 온다(운영 7건, 430 ~ 495자)
    """

    SCREEN = "공유하기 보기 설정 글자 크기 보통 크게 아주 크게 컬러 모드 라이트 다크 베이지 그린 본문 요약 "
    VIDEO_TAIL = "※ 자세한 내용은 동영상으로 확인하실 수 있습니다. ▶ 이 기사의 전체 내용 확인하기"

    def video(self, before="ⓒ 가람방송 / RSS 피드 안내문 ", rule="-" * 42, gap=" "):
        return before + rule + gap + self.VIDEO_TAIL

    def sent(self, content, **over):
        net = FakeNet([page([item(1, content=content, **over), item(2)])])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        dropped = [line for line in lines if line.get("msg") == "안내문뿐이라 뺌"]
        skipped = summary(lines)["skipped"]
        return len(net.b2_calls()), skipped["notice_only"], skipped["wrong_body"], [d["rule"] for d in dropped]

    def test_screen_text_only_dropped(self):
        self.assertEqual(self.sent(self.SCREEN + filler(478 - len(self.SCREEN))), (1, 1, 0, ["screen_text"]))

    def test_one_article_is_enough(self):
        # 같은 본문 규칙과 달리 묶음이 필요 없다 — 15분 수집은 한 회차에 한두 건만 본다
        self.assertEqual(self.sent(self.SCREEN + "뉴스레터 구독이 완료되었습니다."), (1, 1, 0, ["screen_text"]))

    def test_spaces_and_line_breaks_do_not_matter(self):
        self.assertEqual(self.sent("\n " + self.SCREEN.replace(" ", "\n  ") + filler(300)), (1, 1, 0, ["screen_text"]))
        self.assertEqual(self.sent(self.video(gap="\n\n").replace(" ", "\n ") + "\n"), (1, 1, 0, ["video_only"]))

    def test_real_text_before_screen_text_kept(self):
        # 경향 단신 · 사진 기사는 실제 본문 뒤에 같은 안내문이 붙어 온다 — 본문이 있으니 남긴다
        self.assertEqual(self.sent("가람시청 앞에서 가을 축제가 열렸다. " + self.SCREEN + filler(400)), (2, 0, 0, []))

    def test_long_body_after_screen_text_kept(self):
        # 화면 문구 뒤에 긴 글이 이어지면 본문이 있는 것이다
        self.assertEqual(self.sent(self.SCREEN + "가" * (600 - len(self.SCREEN))), (1, 1, 0, ["screen_text"]))
        self.assertEqual(self.sent(self.SCREEN + "가" * (601 - len(self.SCREEN))), (2, 0, 0, []))

    def test_cap_counts_spaces_collapsed(self):
        # 600자는 공백 · 줄바꿈을 한 칸으로 줄인 길이다 — 원본이 줄바꿈으로 600자를 넘어도 줄이면 600자라 뺀다
        body = self.SCREEN.replace(" ", "\n\n\n") + "가" * (600 - len(self.SCREEN))
        self.assertGreater(len(body.strip()), 600)
        self.assertEqual(self.sent(body), (1, 1, 0, ["screen_text"]))
        self.assertEqual(self.sent(body + "가"), (2, 0, 0, []))
        # 로그의 bodyChars 도 판정에 쓴 줄인 길이다
        net = FakeNet([page([item(1, content=body), item(2)])])
        _, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual([line["bodyChars"] for line in lines if line.get("msg") == "안내문뿐이라 뺌"], [600])

    def test_video_notice_only_dropped(self):
        self.assertEqual(self.sent(self.video()), (1, 1, 0, ["video_only"]))
        # 구분선 길이 · 구분선과 안내 사이 공백은 운영 본문마다 다를 수 있다
        self.assertEqual(self.sent(self.video(rule="-" * 10, gap="")), (1, 1, 0, ["video_only"]))

    def test_video_notice_not_at_the_end_kept(self):
        # 같은 안내 뒤에 본문이 이어지는 SBS 기사가 72건 — 끝에 있을 때만 뺀다
        self.assertEqual(self.sent(self.video() + " 가람시청 앞에서 가을 축제가 열렸다."), (2, 0, 0, []))

    def test_video_notice_without_divider_kept(self):
        self.assertEqual(self.sent("ⓒ 가람방송 " + self.VIDEO_TAIL), (2, 0, 0, []))
        self.assertEqual(self.sent(self.video(rule="-" * 9)), (2, 0, 0, []))

    def test_long_body_ending_with_video_notice_kept(self):
        # 긴 실제 본문 끝에 같은 안내가 붙으면 본문이 있는 것이다 — 운영 7건은 모두 495자 이하
        body = self.video(before="가" * (600 - len(self.video(before=""))))
        self.assertEqual(len(body), 600)
        self.assertEqual(self.sent(body), (1, 1, 0, ["video_only"]))
        self.assertEqual(self.sent("가" + body), (2, 0, 0, []))

    def test_log_line_has_url_and_title_but_no_body(self):
        net = FakeNet([page([item(1, title="[클로징] 가람시 소식", content=self.video()), item(2)])])
        _, lines, text = run(env(INGEST_MODE="load-only"), net)
        dropped = [line for line in lines if line.get("msg") == "안내문뿐이라 뺌"]
        self.assertEqual(len(dropped), 1)
        self.assertEqual(dropped[0]["url"], item(1)["link"])
        self.assertEqual(dropped[0]["title"], "[클로징] 가람시 소식")
        self.assertEqual(dropped[0]["rule"], "video_only")
        self.assertEqual(dropped[0]["bodyChars"], len(self.video()))
        self.assertNotIn("가람방송", text)

    def test_skip_reason_order(self):
        # 본문 없음이 먼저, 안내문뿐이 분야 · 시간대보다 먼저
        self.assertEqual(news_ingest.skip_reason(item(1, content=self.video())), "notice_only")
        self.assertEqual(news_ingest.skip_reason(item(1, content=self.video(), category=["sports"], pubDateTZ="EST")), "notice_only")
        self.assertEqual(news_ingest.skip_reason(item(1, content=" ")), "no_body")


class WrongBodyFlow(unittest.TestCase):
    def same_body(self, *numbers):
        body = filler(600)
        return [item(n, title=f"가람시 소식 {n}", content=body) for n in numbers]

    def test_log_line_has_url_and_rule_but_no_body(self):
        marker = "이문장은로그에나오면안된다"
        body = marker + filler(600)
        items = [item(n, title=f"가람시 소식 {n}", content=body) for n in (1, 2, 3)]
        items.append(item(4, title="[부고] 김가람씨 별세", content=marker + filler(5000, "다른 문장을 이어 붙인다. ")))
        net = FakeNet([page(items)])
        _, lines, text = run(env(INGEST_MODE="load-only"), net)
        dropped = [line for line in lines if line.get("msg") == "본문 불일치로 뺌"]
        self.assertEqual({d["url"] for d in dropped}, {item(n)["link"] for n in (1, 2, 3, 4)})
        self.assertEqual({d["url"]: d["rule"] for d in dropped}[item(1)["link"]], "same_body")
        self.assertEqual({d["url"]: d["rule"] for d in dropped}[item(4)["link"]], "long_brief")
        first = next(d for d in dropped if d["url"] == item(1)["link"])
        self.assertEqual(first["title"], "가람시 소식 1")
        self.assertEqual(first["sameBodyTitles"], 3)
        self.assertEqual(first["bodyChars"], len(body))
        self.assertEqual(first["pressSourceId"], "garam_kr")
        self.assertEqual(first["titleWordShare"], 0.0)
        self.assertNotIn(marker, text)

    def test_fetched_equals_kept_plus_skipped(self):
        items = self.same_body(1, 2, 3) + [item(4), item(5, content=None), item(6, category=["sports"])]
        net = FakeNet([page(items)])
        _, lines, _ = run(env(INGEST_MODE="load-only"), net)
        result = summary(lines)
        self.assertEqual(result["fetched"], result["kept"] + sum(result["skipped"].values()))
        self.assertEqual((result["fetched"], result["kept"], result["skipped"]["wrong_body"]), (6, 1, 3))

    def test_auto_never_releases_dropped(self):
        net = FakeNet([page(self.same_body(1, 2, 3) + [item(4)])])
        code, _, _ = run(auto_env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        self.assertEqual(len(net.b1_calls()), 1)

    def test_fetch_only_counts_too(self):
        net = FakeNet([page(self.same_body(1, 2, 3) + [item(4)])])
        code, lines, _ = run(env(INGEST_MODE="fetch-only"), net)
        self.assertEqual(code, 0)
        result = summary(lines)
        self.assertEqual((result["kept"], result["skipped"]["wrong_body"]), (1, 3))

    def test_all_dropped_exits_0(self):
        net = FakeNet([page(self.same_body(1, 2, 3))])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual(summary(lines)["kept"], 0)

    def test_newsdata_failing_midway_still_judges_what_came(self):
        for failure, want in (((500, {"status": "error"}), 1), ((401, {"status": "error"}), 2)):
            with self.subTest(failure=failure):
                net = FakeNet([page(self.same_body(1, 2, 3) + [item(4)], "n1"), failure])
                code, lines, _ = run(env(INGEST_MODE="load-only"), net)
                self.assertEqual(code, want)
                self.assertEqual(urls_sent(net), [item(4)["link"]])
                self.assertEqual(summary(lines)["skipped"]["wrong_body"], 3)

    def test_cap_still_judges_and_exits_2(self):
        net = FakeNet([page(self.same_body(1, 2, 3) + [item(4)], "n1")])
        code, lines, _ = run(env(INGEST_MODE="load-only", INGEST_MAX_REQUESTS="1"), net)
        self.assertEqual(code, 2)
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        self.assertEqual(summary(lines)["skipped"]["wrong_body"], 3)

    def test_lone_surrogate_in_kept_article_still_loads(self):
        # NewsData JSON 의 짝 없는 \ud83d — 남는 기사도 B2 로 가고 그날 실행이 멈추지 않는다
        items = [item(1, title="\ud83d 가람시 소식", content="앞 \ud83d 뒤 본문"), item(2)]
        net = FakeNet([(200, json.dumps({"status": "success", "results": items, "nextPage": None}).encode())])
        code, lines, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(urls_sent(net), [item(1)["link"], item(2)["link"]])
        self.assertEqual(summary(lines)["b2"]["created"], 2)
        sent = [json.loads(call[3]) for call in net.calls if call[1] == B2]
        self.assertEqual(sent[0]["title"], "? 가람시 소식")
        self.assertEqual(sent[0]["body"], "앞 ? 뒤 본문")

    def test_lone_surrogate_in_dropped_title_does_not_stop_the_day(self):
        # 진짜 stdout 처럼 UTF-8 strict — StringIO 로는 이 실패가 보이지 않는다
        body = filler(600)
        items = [item(n, title=f"\ud83d 가람시 소식 {n}", content=body) for n in (1, 2, 3)] + [item(4)]
        net = FakeNet([(200, json.dumps({"status": "success", "results": items, "nextPage": None}).encode())])
        raw = io.BytesIO()
        out = io.TextIOWrapper(raw, encoding="utf-8", errors="strict")
        code = news_ingest.main(env(INGEST_MODE="load-only"), net, out)
        out.flush()
        self.assertEqual(code, 0)
        self.assertEqual(urls_sent(net), [item(4)["link"]])
        result = summary([json.loads(line) for line in raw.getvalue().decode("utf-8").splitlines()])
        self.assertEqual(result["skipped"]["wrong_body"], 3)

    def test_title_not_text_goes_to_b2_as_is(self):
        # 여기서 예외가 나면 전체 앞이라 하루치가 0건이 된다. 지금처럼 그 한 건만 B2 가 판단한다
        body = filler(6000)
        for title in (None, 123, ["가람시"]):
            with self.subTest(title=title):
                net = FakeNet([page([item(1, title=title, content=body)])])
                code, _, _ = run(env(INGEST_MODE="load-only"), net)
                self.assertEqual(code, 0)
                self.assertEqual([json.loads(c[3])["title"] for c in net.b2_calls()], [title])

    def test_press_not_text_is_not_grouped(self):
        body = filler(600)
        items = [item(n, title=f"가람시 소식 {n}", content=body, source_id=["garam_kr"]) for n in (1, 2, 3)]
        net = FakeNet([page(items)])
        code, _, _ = run(env(INGEST_MODE="load-only"), net)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.b2_calls()), 3)

    def test_file_source_not_filtered(self):
        # 사람이 고른 목록을 넣는 길이다
        body = filler(6000)
        rows = [b2_line(n, title=f"[부고] 김가람 {n}", body=body) for n in (1, 2, 3)]
        net = FakeNet()
        code, _, _ = run_file(daily_env(INGEST_MAX_ARTICLES="5"), net, jsonl(*rows))
        self.assertEqual(code, 0)
        self.assertEqual(len(net.b2_calls()), 3)


# ── 자동 투입 auto · release-only (Jira S15P31A102-156, 계획 docs/plans/2026-11-10-ingest-15min-auto-b1.md) ──

AT = datetime(2026, 11, 13, 10, 30, tzinfo=KST)  # 15분 회차 — 대기 시간을 셀 「지금」


def kst(minutes_ago):
    """AT 에서 minutes_ago 분 전의 B3 시각(+09:00)"""
    return (AT - timedelta(minutes=minutes_ago)).isoformat()


def release(lines):
    return summary(lines)["release"]


class AutoConfig(unittest.TestCase):
    RELEASE_KEYS = ("INGEST_RELEASE_FROM", "INGEST_RELEASE_PER_RUN", "INGEST_RELEASE_PER_DAY",
                    "INGEST_RELEASE_CAPACITY", "INGEST_RELEASE_MAX_WAIT_MINUTES", "AI_HEALTH_URL")

    def test_full_is_gone_and_points_to_auto(self):
        net = FakeNet()
        code, lines, _ = run(env(INGEST_MODE="full"), net)
        self.assertEqual(code, 2)
        self.assertEqual(net.calls, [])
        self.assertIn("auto", lines[0]["error"])

    def test_every_release_setting_is_required_in_auto(self):
        for key in self.RELEASE_KEYS:
            with self.subTest(key=key):
                net = FakeNet()
                code, lines, _ = run(auto_env(**{key: None}), net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])  # NewsData 를 부르기 전에 멈춘다(크레딧 0)
                self.assertEqual(lines[0]["msg"], "설정 오류")

    def test_release_settings_out_of_range(self):
        for key, raw in (("INGEST_RELEASE_PER_RUN", "0"), ("INGEST_RELEASE_PER_RUN", "501"),
                         ("INGEST_RELEASE_PER_DAY", "20001"), ("INGEST_RELEASE_CAPACITY", "0"),
                         ("INGEST_RELEASE_MAX_WAIT_MINUTES", "1441"), ("INGEST_RELEASE_FROM", "2026-13-01"),
                         ("INGEST_RELEASE_FROM", "yesterday"), ("AI_HEALTH_URL", "ftp://ai/health"),
                         ("AI_HEALTH_URL", "http://ai.ai.svc:8000")):
            with self.subTest(key=key, raw=raw):
                net = FakeNet()
                code, _, _ = run(auto_env(**{key: raw}), net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])

    def test_other_modes_neither_read_nor_check_release_settings(self):
        # 손 실행이 CronJob(auto)의 env 를 물려받아도 INGEST_MODE 하나만 덮으면 돈다
        broken = {key: "엉터리" for key in self.RELEASE_KEYS}
        for mode in ("load-only", "fetch-only"):
            with self.subTest(mode=mode):
                net = FakeNet([page([item(1)])])
                code, lines, _ = run(env(INGEST_MODE=mode, **broken), net)
                self.assertEqual(code, 0)
                self.assertEqual(net.b3_calls() + net.health_calls() + net.b1_calls(), [])
                self.assertNotIn("release", summary(lines))

    def test_health_off_skips_the_check(self):
        net = FakeNet([page([item(1)])])
        code, lines, _ = run(auto_env(AI_HEALTH_URL="off"), net)
        self.assertEqual(code, 0)
        self.assertEqual(net.health_calls(), [])
        self.assertEqual(release(lines)["ai"], "off")
        self.assertEqual(net.b1_ids(), [1])


class AutoBudget(unittest.TestCase):
    """몫 = min(PER_RUN, PER_DAY − 오늘 건 수, CAPACITY − queued − retryPending) — AI 팀장 b1_state.sql 의 budget 과 같은 차례"""

    def go(self, net, **over):
        return run(auto_env(**over), net, now=AT)

    def test_b3_query_and_record(self):
        net = FakeNet([page([])], b3=lambda q: b3_state(today=7, queued=2, retry=1, oldest=kst(3), succeeded=40, failed=1, candidates=[9, 8]))
        code, lines, _ = self.go(net)
        self.assertEqual(code, 0)
        _, query = net.b3_calls()[0][1].split("?")
        self.assertEqual(dict(urllib.parse.parse_qsl(query)), {"publishedFrom": "2026-11-12", "limit": "50"})
        result = release(lines)
        expected = {"from": "2026-11-12", "today": 7, "queued": 2, "retryPending": 1, "oldestWaitMinutes": 3.0,
                    "succeeded15m": 40, "failed15m": 1, "candidates": 2, "ai": "UP", "budget": 50, "picked": 2,
                    "skippedBy": None}
        self.assertEqual({k: result[k] for k in expected}, expected)
        self.assertIsInstance(result["b3Ms"], int)
        self.assertEqual(net.b1_ids(), [9, 8])

    def test_budget_is_min_of_per_run_day_left_and_capacity_left(self):
        cases = [
            (dict(), 50),                                # 회차 최대
            (dict(today=4990), 10),                       # 하루 남은 수
            (dict(queued=55, retry=2), 3),                # 대기 상한 − queued − retryPending
            (dict(today=4999, queued=59), 1),
        ]
        for state, budget in cases:
            with self.subTest(state=state):
                net = FakeNet([page([])], b3=lambda q, s=state: b3_state(candidates=range(1000, 1060), **s))
                code, lines, _ = self.go(net)
                self.assertEqual(code, 0)
                self.assertEqual(release(lines)["budget"], budget)
                self.assertEqual(net.b1_ids(), list(range(1000, 1000 + budget)))  # 후보 앞에서부터

    def test_zero_budget_rests_without_alarm(self):
        for state, reason in ((dict(today=5000), "daily_cap"), (dict(today=6000), "daily_cap"),
                              (dict(queued=60), "capacity"), (dict(queued=40, retry=20), "capacity")):
            with self.subTest(state=state):
                net = FakeNet([page([])], b3=lambda q, s=state: b3_state(candidates=[1, 2], **s))
                code, lines, _ = self.go(net)
                self.assertEqual(code, 0)
                self.assertEqual((release(lines)["skippedBy"], release(lines)["budget"]), (reason, 0))
                self.assertEqual(net.b1_calls(), [])
                self.assertTrue(any(line.get("msg") == "자동 투입 쉼" and line.get("skippedBy") == reason for line in lines))

    def test_oldest_wait_30_minutes_rests_with_alarm(self):
        for minutes, code_expected, reason in ((29.9, 0, None), (30, 1, "wait"), (95, 1, "wait")):
            with self.subTest(minutes=minutes):
                net = FakeNet([page([])], b3=lambda q, m=minutes: b3_state(queued=1, oldest=kst(m), succeeded=5, candidates=[1]))
                code, lines, _ = self.go(net)
                self.assertEqual(code, code_expected)
                self.assertEqual(release(lines)["skippedBy"], reason)
                self.assertEqual(len(net.b1_calls()), 0 if reason else 1)

    def test_failing_needs_ten_failures_and_more_than_successes(self):
        for failed, succeeded, reason in ((9, 0, None), (10, 9, "failing"), (10, 10, None), (30, 2, "failing")):
            with self.subTest(failed=failed, succeeded=succeeded):
                net = FakeNet([page([])], b3=lambda q, f=failed, s=succeeded: b3_state(failed=f, succeeded=s, candidates=[1]))
                code, lines, _ = self.go(net)
                self.assertEqual(code, 1 if reason else 0)
                self.assertEqual(release(lines)["skippedBy"], reason)

    def test_ai_down_rests_before_anything_else(self):
        for health in ((503, {"status": "DOWN", "worker": "BLOCKED"}), ConnectionRefusedError("refused"), TimeoutError("timed out")):
            with self.subTest(health=health):
                net = FakeNet([page([])], b3=lambda q: b3_state(today=5000, candidates=[1]), health=health)
                code, lines, _ = self.go(net)
                self.assertEqual(code, 0)  # NewlearnServiceDown 이 따로 운다
                self.assertEqual((release(lines)["ai"], release(lines)["skippedBy"]), ("DOWN", "ai_down"))
                self.assertEqual(net.b1_calls(), [])


class AutoB3Errors(unittest.TestCase):
    def go(self, b3):
        net = FakeNet([page([item(1)])], b3=b3)
        code, lines, _ = run(auto_env(), net, now=AT)
        return net, code, lines

    def test_b3_status_decides_exit_code(self):
        for resp, code_expected, reason in (((401, {"code": "UNAUTHORIZED"}), 2, "auth"), ((403, {"code": "FORBIDDEN"}), 2, "auth"),
                                            ((400, {"code": "VALIDATION_FAILED"}), 2, "bad_request"),
                                            ((500, {"code": "INTERNAL_ERROR"}), 1, "status_error"),
                                            (ConnectionResetError("끊김"), 1, "status_error")):
            with self.subTest(resp=resp):
                net, code, lines = self.go(lambda q, r=resp: r)
                self.assertEqual(code, code_expected)
                self.assertEqual(release(lines)["skippedBy"], reason)
                self.assertEqual((net.b1_calls(), net.health_calls()), ([], []))
                self.assertEqual(summary(lines)["b2"]["created"], 1)  # 수집은 그대로 넣었다

    def test_b3_odd_shape_is_status_error(self):
        good = b3_state(candidates=[1])[1]
        broken = [
            b"<html>",
            {**good, "extract": None},
            {**good, "releasedToday": True},
            {**good, "releasedToday": -1},
            {**good, "candidates": [{"articleId": "1"}]},
            {**good, "extract": {**good["extract"], "oldestQueuedAt": "2026-11-13T10:00:00"}},  # 오프셋 없음
            {**good, "extract": {**good["extract"], "oldestQueuedAt": "어제"}},
        ]
        for body in broken:
            with self.subTest(body=body):
                net, code, lines = self.go(lambda q, b=body: (200, b))
                self.assertEqual(code, 1)
                self.assertEqual(release(lines)["skippedBy"], "status_error")
                self.assertEqual(net.b1_calls(), [])


class AutoFlow(unittest.TestCase):
    """종료 코드 = 수집 쪽과 투입 쪽 중 큰 값. NewsData 가 실패해도 밀린 후보는 건다"""

    def test_newsdata_failure_still_releases_backlog(self):
        net = FakeNet([(500, {"status": "error"})], b3=lambda q: b3_state(candidates=[7, 8]))
        code, lines, _ = run(auto_env(), net, now=AT)
        self.assertEqual(code, 1)  # 수집 쪽 1
        self.assertEqual(net.b2_calls(), [])
        self.assertEqual(net.b1_ids(), [7, 8])
        self.assertEqual(summary(lines)["b1"]["released"], 2)

    def test_newsdata_key_rejected_still_releases_backlog(self):
        net = FakeNet([(401, {"status": "error"})], b3=lambda q: b3_state(candidates=[7]))
        code, _, _ = run(auto_env(), net, now=AT)
        self.assertEqual(code, 2)
        self.assertEqual(net.b1_ids(), [7])

    def test_batch_key_rejected_at_b2_skips_release(self):
        net = FakeNet([page([item(1)])], b2=lambda article: (401, {"code": "UNAUTHORIZED"}))
        code, lines, _ = run(auto_env(), net, now=AT)
        self.assertEqual(code, 2)
        self.assertEqual(net.b3_calls(), [])
        self.assertIsNone(summary(lines)["release"])

    def test_rest_with_normal_collection_is_success(self):
        net = FakeNet([page([item(1)])], b3=lambda q: b3_state(today=5000, candidates=[1]))
        code, _, _ = run(auto_env(), net, now=AT)
        self.assertEqual(code, 0)

    def test_nothing_to_release_is_success(self):
        net = FakeNet([page([])], b3=lambda q: b3_state(candidates=[]))
        code, lines, _ = run(auto_env(), net, now=AT)
        self.assertEqual(code, 0)
        self.assertEqual(release(lines)["picked"], 0)


class ReleaseOnly(unittest.TestCase):
    """손으로 소량 걸 때 — NewsData · B2 없이 같은 몫 계산(AI 팀장 「하루 합계가 한 군데로」)"""

    def test_runs_without_newsdata_settings(self):
        net = FakeNet(b3=lambda q: b3_state(candidates=[5, 6]))
        environ = auto_env(INGEST_MODE="release-only", NEWSDATA_API_KEY=None, INGEST_RELEASE_PER_RUN="3", INGEST_TIMEFRAME="엉터리")
        code, lines, _ = run(environ, net, now=AT)
        self.assertEqual(code, 0)
        self.assertEqual((net.newsdata_calls(), net.b2_calls()), ([], []))
        _, query = net.b3_calls()[0][1].split("?")
        self.assertEqual(dict(urllib.parse.parse_qsl(query))["limit"], "3")
        self.assertEqual(net.b1_ids(), [5, 6])
        result = summary(lines)
        self.assertEqual((result["mode"], result["b1"]["released"], result["release"]["budget"]), ("release-only", 2, 3))

    def test_same_budget_rules(self):
        net = FakeNet(b3=lambda q: b3_state(today=5000, candidates=[5]))
        code, lines, _ = run(auto_env(INGEST_MODE="release-only"), net, now=AT)
        self.assertEqual(code, 0)
        self.assertEqual(release(lines)["skippedBy"], "daily_cap")
        self.assertEqual(net.b1_calls(), [])

    def test_needs_release_settings_and_backend(self):
        for over in (dict(INGEST_RELEASE_CAPACITY=None), dict(INTERNAL_BATCH_KEY=None), dict(BACKEND_URL=None)):
            with self.subTest(over=over):
                net = FakeNet()
                code, _, _ = run(auto_env(INGEST_MODE="release-only", **over), net)
                self.assertEqual(code, 2)
                self.assertEqual(net.calls, [])


def yaml_env():
    """news-ingest.yaml 의 컨테이너 env 중 value 가 있는 것 — 표준 라이브러리만이라 모양만 읽는다(name 바로 다음 줄의 value)"""
    text = (SCRIPT.parent / "news-ingest.yaml").read_text(encoding="utf-8")
    pairs = re.findall(r"- name: (\S+)\n\s+value: (.+)", text)
    return {name: value.strip().strip('"') for name, value in pairs}


class YamlEnv(unittest.TestCase):
    """CronJob 의 env 가 이 스크립트로 그대로 도는지 — 손 실행은 그 env 를 물려받는다(ingest.md 「손 실행」)"""

    def secrets(self):
        return {"NEWSDATA_API_KEY": KEY, "INTERNAL_BATCH_KEY": BATCH_KEY, "BACKEND_URL": BACKEND}

    def test_cronjob_env_is_auto_and_runs(self):
        values = yaml_env()
        self.assertEqual((values["INGEST_MODE"], values["INGEST_TIMEFRAME"]), ("auto", "30m"))
        self.assertNotIn("INGEST_DAYS", values)
        environ = {**values, **self.secrets(), "AI_HEALTH_URL": HEALTH}
        net = FakeNet([page([item(1)])])
        code, lines, _ = run(environ, net, now=AT)
        self.assertEqual(code, 0)
        self.assertEqual(net.b1_ids(), [1])
        self.assertEqual(release(lines)["budget"], int(values["INGEST_RELEASE_PER_RUN"]))

    def test_manual_run_overrides_only_the_mode(self):
        environ = {**yaml_env(), **self.secrets(), "INGEST_MODE": "load-only", "INGEST_DAYS": "2026-11-02", "INGEST_TIMEFRAME": "35"}
        net = FakeNet([page([item(1)])])
        code, lines, _ = run(environ, net, now=AT)
        self.assertEqual(code, 0)
        self.assertEqual(net.b3_calls() + net.health_calls() + net.b1_calls(), [])
        self.assertEqual(summary(lines)["b2"]["created"], 1)


if __name__ == "__main__":
    unittest.main()
