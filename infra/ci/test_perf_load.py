"""load.py 시험 — 발표 전 단계 부하 시험 도구 (Jira S15P31A102-193)

스크립트는 관리 서버에서 돌리는 자리(infra/server/perf/)에 있어 경로로 불러온다.
backend 는 가짜 서버(http.server)로 대신한다 — CSRF 번호표를 로그인 · 로그아웃 때 바꾸고,
머리와 쿠키가 다르면 403 을 준다(운영 SecurityConfig · LoginSessions 와 같은 모양).

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import http.server
import importlib.util
import json
import pathlib
import random
import threading
import unittest
from collections import Counter
from datetime import datetime, timezone
from http.cookies import SimpleCookie

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "perf" / "load.py"
_spec = importlib.util.spec_from_file_location("perf_load", SCRIPT)
load = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(load)


class FakeSite(http.server.BaseHTTPRequestHandler):
    """번호표 · 로그인 · 세션을 운영처럼 흉내 내는 가짜 사이트."""

    tokens = iter(f"t{i}" for i in range(1, 10_000))
    sessions: set = set()
    fail_path = None  # 이 경로로 오면 500 을 준다
    lock = threading.Lock()
    seen = Counter()
    posts = Counter()

    def log_message(self, *args):
        pass

    def _cookies(self):
        jar = SimpleCookie()
        jar.load(self.headers.get("Cookie", ""))
        return {k: m.value for k, m in jar.items()}

    def _send(self, status, body=None, cookies=()):
        payload = json.dumps(body).encode() if body is not None else b""
        self.send_response(status)
        for c in cookies:
            self.send_header("Set-Cookie", c)
        if payload:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _new_token(self):
        with FakeSite.lock:
            return next(FakeSite.tokens)

    def do_GET(self):
        path = self.path.split("?")[0]
        with FakeSite.lock:
            FakeSite.seen[path] += 1
        cookies = self._cookies()
        issue = []
        if "XSRF-TOKEN" not in cookies:
            issue.append(f"XSRF-TOKEN={self._new_token()}; Path=/")
        if FakeSite.fail_path and path.startswith(FakeSite.fail_path):
            return self._send(500, {"code": "INTERNAL"}, issue)
        if path == "/actuator/health":
            return self._send(200, {"status": "UP"})
        if path == "/api/v1/issues":
            return self._send(200, {"items": [{"id": 12}, {"id": 13}]}, issue)
        if path == "/api/v1/articles":
            return self._send(200, {"items": [{"id": 456}, {"id": 457}]}, issue)
        if path.endswith("/timeline"):
            return self._send(200, {"issueId": 12, "events": [{"id": 91}, {"id": 94}]}, issue)
        if path.startswith("/api/v1/members/me"):
            if cookies.get("SESSION") not in FakeSite.sessions:
                return self._send(401, {"code": "UNAUTHORIZED"}, issue)
            return self._send(200, {"id": 7, "loginId": "loadtest"}, issue)
        return self._send(200, {"ok": True}, issue)

    def do_POST(self):
        with FakeSite.lock:
            FakeSite.posts[self.path] += 1
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        cookies = self._cookies()
        token = cookies.get("XSRF-TOKEN")
        if not token or self.headers.get("X-XSRF-TOKEN") != token:
            return self._send(403, {"code": "FORBIDDEN"})
        if self.path == "/api/v1/auth/login":
            data = json.loads(body)
            if data.get("password") != "right-password":
                return self._send(401, {"code": "LOGIN_FAILED"})
            session = f"s{self._new_token()}"
            with FakeSite.lock:
                FakeSite.sessions.add(session)
            return self._send(200, {"id": 7}, [f"SESSION={session}; Path=/; HttpOnly",
                                               f"XSRF-TOKEN={self._new_token()}; Path=/"])
        if self.path == "/api/v1/auth/logout":
            with FakeSite.lock:
                FakeSite.sessions.discard(cookies.get("SESSION"))
            return self._send(204, None, ["SESSION=; Path=/; Max-Age=0",
                                          f"XSRF-TOKEN={self._new_token()}; Path=/"])
        return self._send(404)


class FakeSiteTest(unittest.TestCase):
    def setUp(self):
        FakeSite.fail_path = None
        FakeSite.sessions = set()
        FakeSite.seen = Counter()
        FakeSite.posts = Counter()
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeSite)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def client(self):
        return load.Client("127.0.0.1", port=self.port, scheme="http")


class PercentileTest(unittest.TestCase):
    def test_same_as_bench(self):
        # bench.py 와 같은 선형 보간 — 1..100 의 p95 는 95.05
        values = list(range(1, 101))
        self.assertAlmostEqual(load.pct(values, 0.95), 95.05)
        self.assertEqual(load.pct([7.0], 0.99), 7.0)


class DeadlineTest(unittest.TestCase):
    def test_until_is_read_as_kst_even_on_utc_server(self):
        # 서버는 UTC — 00:30 UTC = 09:30 KST 는 09:50 전, 00:51 UTC = 09:51 KST 는 지남
        before = datetime(2026, 11, 12, 0, 30, tzinfo=timezone.utc)
        after = datetime(2026, 11, 12, 0, 51, tzinfo=timezone.utc)
        until = load.parse_until("09:50", before)
        self.assertEqual(until.utcoffset().total_seconds(), 9 * 3600)
        self.assertFalse(load.past(until, before))
        self.assertTrue(load.past(until, after))


class MixTest(unittest.TestCase):
    IDS = {"issue": [12, 13], "article": [456], "event": [91]}

    def test_guest_never_gets_member_only(self):
        rng = random.Random(1)
        member_only = {api for api, _, _, only in load.MIX if only}
        self.assertEqual(member_only, {"A17", "A22", "A25"})
        for _ in range(5000):
            api, path = load.pick_request(rng, self.IDS, member=False)
            self.assertNotIn(api, member_only)
            self.assertNotIn("{", path)

    def test_member_share_follows_real_ratio(self):
        # 실제 비율(입구 로그 7일): A2 31.1% · A17 2.0% — 10,000번 뽑으면 그 근처
        rng = random.Random(2)
        counts = Counter(load.pick_request(rng, self.IDS, member=True)[0] for _ in range(10_000))
        share = {api: n / 10_000 for api, n in counts.items()}
        self.assertAlmostEqual(share["A2"], 0.32, delta=0.03)
        self.assertAlmostEqual(share["A17"], 0.02, delta=0.01)
        self.assertNotIn("A19", share)
        self.assertNotIn("A26", share)


class StopTest(unittest.TestCase):
    NOW = datetime(2026, 11, 12, 0, 30, tzinfo=timezone.utc)
    UNTIL = load.parse_until("09:50", NOW)

    def decide(self, samples, health=(30.0, 200), cpu=20.0, now=None):
        return load.stop_reason(samples, health, cpu, now or self.NOW, self.UNTIL)

    def test_calm_window_keeps_going(self):
        self.assertIsNone(self.decide([(40.0, 200)] * 100))

    def test_window_p95_over_500ms_stops(self):
        samples = [(40.0, 200)] * 90 + [(800.0, 200)] * 10
        self.assertIn("p95", self.decide(samples))

    def test_single_5xx_stops(self):
        self.assertIn("5xx", self.decide([(40.0, 200)] * 99 + [(40.0, 503)]))

    def test_error_rate_over_one_percent_stops(self):
        self.assertIn("오류", self.decide([(40.0, 200)] * 98 + [(5000.0, 0)] * 2))

    def test_few_samples_do_not_trip_p95_or_rate(self):
        self.assertIsNone(self.decide([(900.0, 200)] * 5 + [(40.0, 404)]))

    def test_slow_or_bad_health_stops(self):
        self.assertIn("health", self.decide([(40.0, 200)] * 100, health=(620.0, 200)))
        self.assertIn("health", self.decide([(40.0, 200)] * 100, health=(30.0, 503)))

    def test_sender_cpu_over_70_stops(self):
        self.assertIn("CPU", self.decide([(40.0, 200)] * 100, cpu=75.0))

    def test_deadline_stops(self):
        late = datetime(2026, 11, 12, 0, 51, tzinfo=timezone.utc)
        self.assertIn("끝 시각", self.decide([(40.0, 200)] * 100, now=late))


class ClientTest(FakeSiteTest):
    def test_check_follows_rotating_csrf_token(self):
        # 로그인 · 로그아웃 때 번호표가 바뀌어도 머리를 새 값으로 보내야 403 이 안 난다
        result = load.check(self.client(), "loadtest", "right-password")
        self.assertEqual(result, {"login": 200, "me": 200, "logout": 204})
        self.assertEqual(FakeSite.sessions, set())

    def test_wrong_password_stops_at_login(self):
        result = load.check(self.client(), "loadtest", "wrong")
        self.assertEqual(result, {"login": 401})

    def test_collect_ids_from_real_shapes(self):
        ids = load.collect_ids(self.client())
        self.assertEqual(ids, {"issue": [12, 13], "article": [456, 457], "event": [91, 94]})


class RunTest(FakeSiteTest):
    def run_steps(self, steps, out):
        return load.run(
            host="127.0.0.1", port=self.port, scheme="http",
            login_id="loadtest", password="right-password",
            steps=steps, step_seconds=1.0, discard_seconds=0.2,
            until=load.parse_until("23:59", datetime.now(timezone.utc)),
            out=out, cpu_reader=lambda: 10.0, seed=3,
        )

    def test_steps_report_and_log_everyone_out(self):
        lines = []
        reason = self.run_steps([1, 4], lines.append)
        self.assertIsNone(reason)
        self.assertEqual([r["concurrency"] for r in lines], [1, 4])
        last = lines[-1]
        self.assertGreater(last["n"], 0)
        self.assertEqual(set(last["roles"]), {"member", "guest"})
        self.assertEqual(sum(v for k, v in last["codes"].items() if not k.startswith("2")), 0)
        self.assertEqual(FakeSite.sessions, set())  # 회원 워커 셋 모두 로그아웃

    def test_wrong_password_stops_after_one_login(self):
        # 잠김 방지 — 로그인이 200 이 아니면 다시 시도하지 않고 멈춘다
        lines = []
        reason = load.run(
            host="127.0.0.1", port=self.port, scheme="http", login_id="loadtest", password="wrong",
            steps=[4], step_seconds=1.0, discard_seconds=0.2,
            until=load.parse_until("23:59", datetime.now(timezone.utc)),
            out=lines.append, cpu_reader=lambda: 10.0, seed=3,
        )
        self.assertIn("로그인 401", reason)
        self.assertEqual(FakeSite.posts["/api/v1/auth/login"], 1)
        self.assertEqual(lines, [])

    def test_sender_cpu_reading_stops_from_guardian(self):
        # 지킴이 스레드가 CPU 를 읽어 멈춘다(메인 루프가 아니라) — 5초 평균이 70% 를 넘으면
        lines = []
        reason = load.run(
            host="127.0.0.1", port=self.port, scheme="http", login_id="loadtest", password="right-password",
            steps=[1, 2], step_seconds=4.0, discard_seconds=0.2,
            until=load.parse_until("23:59", datetime.now(timezone.utc)),
            out=lines.append, cpu_reader=lambda: 95.0, seed=3,
        )
        self.assertIn("CPU", reason)
        self.assertEqual(FakeSite.sessions, set())

    def test_one_cpu_spike_does_not_stop(self):
        # 09:01 첫 실행처럼 순간값 하나가 튀어도 5초 평균은 70% 아래 — 멈추지 않는다
        readings = iter([95.0] + [20.0] * 1000)
        lines = []
        reason = load.run(
            host="127.0.0.1", port=self.port, scheme="http", login_id="loadtest", password="right-password",
            steps=[1], step_seconds=6.0, discard_seconds=0.2,
            until=load.parse_until("23:59", datetime.now(timezone.utc)),
            out=lines.append, cpu_reader=lambda: next(readings), seed=3,
        )
        self.assertIsNone(reason)
        self.assertLess(lines[-1]["sender_cpu_max"], 70.0)

    def test_5xx_stops_the_run(self):
        FakeSite.fail_path = "/api/v1/search"
        lines = []
        reason = self.run_steps([2, 4, 8], lines.append)
        self.assertIn("5xx", reason)
        self.assertLess(len(lines), 3)
        self.assertEqual(FakeSite.sessions, set())


if __name__ == "__main__":
    unittest.main()
