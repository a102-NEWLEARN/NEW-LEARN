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
from collections import Counter

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "k8s" / "services" / "ingest" / "news_ingest.py"
_spec = importlib.util.spec_from_file_location("news_ingest", SCRIPT)
news_ingest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(news_ingest)

# 지어낸 키 — 로그에 이 글자가 나오면 안 된다
KEY = "pub_testkey0123456789abcdef"
BATCH_KEY = "batch-test-key-0123456789"
BACKEND = "http://backend.test:8080"
NEWSDATA = "https://newsdata.io/api/1/latest"
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
        if url.startswith(NEWSDATA):
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
        return [c for c in self.calls if c[1].startswith(NEWSDATA)]

    def b2_calls(self):
        return [c for c in self.calls if c[1] == B2]

    def b1_calls(self):
        return [c for c in self.calls if B1.fullmatch(c[1])]


def run(environ, net):
    """main 을 돌려 (종료 코드, JSON 줄 목록, 찍힌 글 전체)를 돌려준다. 줄마다 JSON 이 아니면 여기서 깨진다"""
    out = io.StringIO()
    code = news_ingest.main(environ, net, out)
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
            {"bad_item": 0, "no_body": 1, "category": 1, "timezone": 1, "bad_date": 0, "duplicate": 0, "over_limit": 0},
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


if __name__ == "__main__":
    unittest.main()
