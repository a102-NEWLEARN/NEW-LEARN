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
        "INGEST_MODE": "full",
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
    """

    def __init__(self, pages=(), b2=None, b1=None):
        self.pages = list(pages)
        self.b2 = b2
        self.b1 = b1
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
        run(env(), net)
        self.assertNotIn("X-Internal-Key", net.newsdata_calls()[0][2])
        self.assertEqual(net.b2_calls()[0][2]["X-Internal-Key"], BATCH_KEY)
        self.assertEqual(net.b2_calls()[0][2]["Content-Type"], "application/json")
        self.assertEqual(net.b1_calls()[0][2]["X-Internal-Key"], BATCH_KEY)
        self.assertEqual(net.b1_calls()[0][3], b"")  # B1 은 본문 없이


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
            {"bad_item": 0, "no_body": 1, "category": 1, "marked_duplicate": 0, "timezone": 1, "bad_date": 0, "out_of_range": 0, "duplicate": 0, "over_limit": 0},
        )


class Flow(unittest.TestCase):
    def test_created_and_existing_both_released(self):
        def b2(article):
            return (201, {"articleId": 11, "created": True}) if article["url"].endswith("/1") else (200, {"articleId": 12, "created": False})

        net = FakeNet([page([item(1), item(2)])], b2=b2)
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(sorted(net.b1_tries), [11, 12])
        result = summary(lines)
        self.assertEqual(result["b2"], {"created": 1, "existing": 1, "rejected": 0, "failed": 0})
        self.assertEqual(result["b1"], {"released": 2, "already": 0, "failed": 0, "retried": 0})

    def test_rejected_article_is_not_released(self):
        def b2(article):
            if article["url"].endswith("/1"):
                return (400, {"code": "VALIDATION_FAILED", "errors": [{"field": "title", "reason": "too long"}]})
            return (201, {"articleId": 5, "created": True})

        net = FakeNet([page([item(1), item(2)])], b2=b2)
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(list(net.b1_tries), [5])
        self.assertEqual(summary(lines)["b2"]["rejected"], 1)

    def test_all_already_released_is_success(self):
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (409, {"code": "ALREADY_RELEASED"}))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["b1"]["already"], 2)

    def test_b1_server_error_retried_once_after_others(self):
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (503, b"") if aid == 1 and n == 1 else (202, {"articleId": aid}))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual([B1.fullmatch(c[1]).group(1) for c in net.b1_calls()], ["1", "2", "1"])
        self.assertEqual(summary(lines)["b1"], {"released": 2, "already": 0, "failed": 0, "retried": 1})

    def test_b1_connection_error_also_retried(self):
        def b1(aid, n):
            if n == 1:
                raise ConnectionResetError("끊김")
            return (202, {"articleId": aid})

        net = FakeNet([page([item(1)])], b1=b1)
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(summary(lines)["b1"]["released"], 1)

    def test_b1_failing_twice_is_logged_with_article_id(self):
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (500, b"") if aid == 1 else (202, {"articleId": aid}))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 0)
        self.assertEqual(net.b1_tries[1], 2)
        self.assertEqual(summary(lines)["b1"]["failed"], 1)
        self.assertTrue(any(line.get("articleId") == 1 and line.get("status") == 500 for line in lines if line.get("msg") != "수집 결과"))

    def test_auth_error_on_b2_stops_with_exit_2(self):
        net = FakeNet([page([item(1), item(2)])], b2=lambda article: (401, {"code": "UNAUTHORIZED"}))
        code, _, _ = run(env(), net)
        self.assertEqual(code, 2)
        self.assertEqual(len(net.b2_calls()), 1)

    def test_auth_error_on_b1_stops_with_exit_2(self):
        net = FakeNet([page([item(1), item(2)])], b1=lambda aid, n: (403, {"code": "FORBIDDEN"}))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 2)
        self.assertEqual(len(net.b1_calls()), 1)
        # 그때 걸던 기사 1 은 B2 는 됐으니 번호가 남아야 한다
        self.assertTrue(any(line.get("msg") == "B1 실패" and line.get("articleId") == 1 for line in lines))
        self.assertEqual(summary(lines)["b1"]["failed"], 1)

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

    def test_backend_down_keeps_pending_article_ids(self):
        # 기사 2 는 B2 는 됐는데 B1 이 503 → 끝에 다시 걸 목록에 있다가, 뒤 기사들의 B2 가 이어서 끊겨 멈춤 — 번호가 로그에 남아야 한다
        def b2(article):
            if article["url"].endswith("/2"):
                return (201, {"articleId": 102, "created": True})
            raise TimeoutError("timed out")

        net = FakeNet([page([item(i) for i in range(1, 6)])], b2=b2, b1=lambda aid, n: (503, b""))
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 1)
        self.assertTrue(any(line.get("msg") == "B1 실패" and line.get("articleId") == 102 for line in lines))
        self.assertEqual(summary(lines)["b1"]["failed"], 1)

    def test_backend_down_during_retry_logs_the_rest(self):
        # 다섯 모두 B1 첫 시도 503, 다시 걸 때는 연결 거부 → 세 번째에서 멈춰도 다섯 번호가 모두 남아야 한다
        def b1(aid, n):
            if n == 1:
                return (503, b"")
            raise ConnectionRefusedError("refused")

        net = FakeNet([page([item(i) for i in range(1, 6)])], b1=b1)
        code, lines, _ = run(env(), net)
        self.assertEqual(code, 1)
        logged = sorted(line["articleId"] for line in lines if line.get("msg") == "B1 실패")
        self.assertEqual(logged, [1, 2, 3, 4, 5])
        self.assertEqual(summary(lines)["b1"]["failed"], 5)

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
        self.assertEqual((result["mode"], result["requests"], result["fetched"], result["kept"]), ("full", 1, 3, 2))


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
        for mode in ("load-only", "full"):
            with self.subTest(mode=mode):
                net = FakeNet([page([item(1)], "n1"), page([item(2)], "n2")])
                code, lines, _ = run(env(INGEST_MODE=mode, INGEST_MAX_REQUESTS="2"), net)
                self.assertEqual(code, 2)
                self.assertEqual(len(net.b2_calls()), 2)
                self.assertEqual(summary(lines)["stoppedBy"], "max_requests")
        net = FakeNet([page([item(1)], "n1"), page([item(2)], "n2")])
        run(env(INGEST_MAX_REQUESTS="2"), net)
        self.assertEqual(len(net.b1_calls()), 2)  # full 은 넣은 기사에 B1 까지 건 뒤 종료 2

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
    """sort=pubdateasc 이고 날짜 범위가 있으면, 범위를 지난 기사가 나온 쪽에서 멈춘다 — 그날 0 ~ 10시 쪽들을 안 받는다"""

    ASC = "country=kr&language=ko&sort=pubdateasc"

    def pages(self):
        return [
            page([day_item(1, "2026-11-02 14:30:00"), day_item(2, "2026-11-02 15:10:00")], "n1"),   # 그제 밤 · 어제
            page([day_item(3, "2026-11-03 12:00:00"), day_item(4, "2026-11-03 15:00:01")], "n2"),   # 어제 · 오늘 0시 뒤
            page([day_item(5, "2026-11-03 18:00:00")]),                                           # 오늘 — 받으면 안 됨(마지막 쪽)
        ]

    def test_stops_after_page_past_range(self):
        net = FakeNet(self.pages())
        code, lines, _ = run(env(INGEST_MODE="load-only", INGEST_QUERY=self.ASC, INGEST_DAYS="yesterday"), net, now=NOW)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.newsdata_calls()), 2)
        self.assertEqual(sorted(json.loads(c[3])["url"].rsplit("/", 1)[1] for c in net.b2_calls()), ["2", "3"])
        result = summary(lines)
        self.assertEqual(result["stoppedBy"], "past_range")
        self.assertEqual(result["skipped"]["out_of_range"], 2)

    def test_no_stop_without_ascending_sort(self):
        net = FakeNet(self.pages())
        _, lines, _ = run(env(INGEST_MODE="load-only", INGEST_DAYS="yesterday"), net, now=NOW)
        self.assertEqual(len(net.newsdata_calls()), 3)
        self.assertEqual(summary(lines)["stoppedBy"], "end")

    def test_no_stop_without_days(self):
        net = FakeNet(self.pages())
        run(env(INGEST_MODE="load-only", INGEST_QUERY=self.ASC, INGEST_DAYS=""), net, now=NOW)
        self.assertEqual(len(net.newsdata_calls()), 3)

    def test_before_range_does_not_stop(self):
        # 오래된 순이라 처음 쪽은 그제 밤(범위 앞)이다 — 멈추면 안 된다
        pages = [page([day_item(1, "2026-11-02 14:00:00")], "n1"), page([day_item(2, "2026-11-02 16:00:00")])]
        net = FakeNet(pages)
        code, lines, _ = run(env(INGEST_MODE="load-only", INGEST_QUERY=self.ASC, INGEST_DAYS="yesterday"), net, now=NOW)
        self.assertEqual((code, len(net.newsdata_calls()), summary(lines)["stoppedBy"]), (0, 2, "end"))


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


if __name__ == "__main__":
    unittest.main()
