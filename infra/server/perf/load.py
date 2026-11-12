"""단계 부하 시험 — 운영 사이트가 동시 요청을 몇까지 버티나 (Jira S15P31A102-193).

어디서: 관리 서버(EC2). tmux 안에서 돌린다 — 관리 PC 와이파이가 끊겨도 실행이 이어진다
    scp infra/server/perf/load.py newlearn:load.py
    ssh newlearn            # 그다음 서버에서
    tmux new -s load
    python3 load.py check <시험 계정 아이디>                     # 부하 없이 로그인 · 내 정보 · 로그아웃 한 번
    python3 load.py run <이름표> <시험 계정 아이디> --until 09:50  # 본 실행
- 동시 요청(워커)을 1 · 2 · 4 · … · 128 로 단계마다 60초씩 올린다. 앞 5초는 버리고 잰다. 생각 시간 없이 계속 보낸다
- 요청은 실제 사용자 요청 비율대로 고른다(MIX — 입구 로그 7일, 2026-11-12 08:40 기준 사용자 요청 10,331건)
- 워커 넷 중 셋은 시험 계정으로 로그인한 회원, 하나는 손님. 로그인은 한 명씩 차례로 한다 —
  같은 아이디로 동시에 로그인하면 LoginAttemptGuard 가 6번째부터 1분 잠근다
- 비밀번호는 서버 터미널에서 getpass 로만 받는다. 요청 본문은 어디에도 찍지 않는다
- 요청에 User-Agent newlearn-bench-load/1 을 붙인다 — 대시보드 「조회 성능」이 newlearn-bench.* 를 사용자 요청에서 뺀다
- 멈춤(STOP_RULES): readiness(1초 · 5초마다 · 2번)가 backend 를 빼기 전에 멈추는 것이 목표다
- 결과: 단계마다 한 줄 요약 + JSON 한 줄(~/load-<이름표>.jsonl). load-results.md 에 옮긴다
"""
import argparse
import getpass
import http.client
import json
import os
import random
import sys
import threading
import time
import urllib.parse
from collections import Counter, deque
from datetime import datetime, timedelta, timezone
from http.cookies import CookieError, SimpleCookie

HOST = "newlearn.io.kr"
USER_AGENT = "newlearn-bench-load/1"
KST = timezone(timedelta(hours=9))  # 서버 시계는 UTC — 끝 시각은 늘 한국 시각으로 읽는다
STEPS = [1, 2, 4, 8, 16, 32, 64, 128]
STEP_SECONDS, DISCARD_SECONDS, WINDOW_SECONDS, TIMEOUT = 60.0, 5.0, 5.0, 5.0
GUARD_SECONDS = 0.5  # 멈춤 지킴이가 도는 간격(따로 도는 스레드)
HEALTH_TIMEOUT = 1.0  # backend readiness 의 시간 초과와 같다
MEMBER_EVERY = 4  # 워커 넷 중 넷째가 손님

# 멈춤 조건 — 하나라도 걸리면 바로 멈춘다
P95_STOP_MS = 500.0  # 최근 5초 창 p95
HEALTH_STOP_MS = 500.0  # /actuator/health 한 번(readiness 와 같은 DB 풀을 빌린다)
ERROR_RATE_STOP = 0.01  # 최근 5초 창 오류(2xx 아님 · 시간 초과) 비율
CPU_STOP = 70.0  # 보내는 쪽(EC2) CPU 최근 5초 평균 — 넘으면 보내는 쪽 한계
MIN_SAMPLES = 20  # 창 p95 · 오류율은 요청이 이만큼 있을 때만 본다
STEP_P95_STOP_MS = 1000.0  # 단계 전체 p95 — 넘으면 다음 단계로 안 간다

CATEGORIES = ["politics", "economy", "society", "world", "it_science"]
SEARCH_WORDS = ["반도체", "환율", "선거", "날씨", "부동산"]  # 실제 사용자 검색어는 읽지 않는다

# (API, 가중치, 주소, 회원 전용) — 가중치는 입구 로그 7일의 사용자 요청 수(측정 스크립트 · 빈 User-Agent 뺌)
# A26 문맥 뜻 · A19 용어사전은 뺀다(바깥 호출 · 입구 상한 대상). 로그인 · 로그아웃은 워커가 따로 한다
MIX = [
    ("A2", 1072, "/api/v1/issues?sort=createdAt&size=3", False),
    ("A2", 978, "/api/v1/issues?category=politics&size=3", False),
    ("A2", 839, "/api/v1/issues?size=5", False),
    ("A2", 177, "/api/v1/issues?category={cat}&size=3", False),
    ("A2", 147, "/api/v1/issues?category={cat}&size=50", False),
    ("A7", 983, "/api/v1/articles?page=0&size=8", False),
    ("A7", 120, "/api/v1/articles?category={cat}&page=0&size=8", False),
    ("A7", 140, "/api/v1/articles?page={page}&size=8", False),
    ("A7", 26, "/api/v1/articles?page={deep}&size=8", False),
    ("A1", 1263, "/api/v1/categories", False),
    ("A13", 891, "/api/v1/search?q={q}", False),
    ("A8", 734, "/api/v1/articles/{article}", False),
    ("A9", 691, "/api/v1/articles/{article}/mindmap", False),
    ("A4", 456, "/api/v1/issues/{issue}/timeline", False),
    ("A3", 426, "/api/v1/issues/{issue}", False),
    ("A25", 251, "/api/v1/members/me/interest-issues", True),
    ("A6", 235, "/api/v1/events/{event}/articles?page=0&size=5", False),
    ("A5", 214, "/api/v1/events/{event}", False),
    ("A17", 205, "/api/v1/members/me", True),
    ("A22", 36, "/api/v1/members/me/bookmarks", True),
]
_WEIGHTS = [w for _, w, _, _ in MIX]
_NEEDS = {"{issue}": "issue", "{article}": "article", "{event}": "event"}


def pct(values, p):
    """bench.py 와 같은 선형 보간 분위수."""
    if not values:
        return 0.0
    ordered = sorted(values)
    k = (len(ordered) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


def parse_until(hhmm, now):
    """「HH:MM」을 now 가 속한 한국 날짜의 그 시각(+09:00)으로."""
    hour, minute = (int(x) for x in hhmm.split(":"))
    today = now.astimezone(KST)
    return today.replace(hour=hour, minute=minute, second=0, microsecond=0)


def past(until, now):
    return now >= until


def pick_request(rng, ids, member):
    """실제 비율대로 요청 하나를 고른다. 손님은 회원 전용을, id 가 없으면 그 주소를 다시 고른다."""
    while True:
        api, _, template, member_only = rng.choices(MIX, weights=_WEIGHTS)[0]
        if member_only and not member:
            continue
        if any(mark in template and not ids.get(kind) for mark, kind in _NEEDS.items()):
            continue
        path = (template
                .replace("{issue}", str(rng.choice(ids["issue"])) if "{issue}" in template else "")
                .replace("{article}", str(rng.choice(ids["article"])) if "{article}" in template else "")
                .replace("{event}", str(rng.choice(ids["event"])) if "{event}" in template else "")
                .replace("{cat}", rng.choice(CATEGORIES))
                .replace("{q}", urllib.parse.quote(rng.choice(SEARCH_WORDS)))
                .replace("{page}", str(rng.randint(1, 3)))
                .replace("{deep}", str(rng.randint(100, 1500))))
        return api, path


def stop_reason(window, health, cpu, now, until):
    """멈춰야 하면 까닭(문자열), 아니면 None. window 는 최근 5초의 (ms, 상태) 목록."""
    if past(until, now):
        return f"끝 시각 {until.strftime('%H:%M')} 지남"
    server_errors = sum(1 for _, status in window if 500 <= status < 600)
    if server_errors:
        return f"5xx {server_errors}건"
    health_ms, health_status = health
    if health_status != 200 or health_ms > HEALTH_STOP_MS:
        return f"health {health_status} · {health_ms:.0f}ms"
    if cpu is not None and cpu > CPU_STOP:
        return f"보내는 쪽 CPU {cpu:.0f}% — 보내는 쪽 한계"
    if len(window) >= MIN_SAMPLES:
        errors = sum(1 for _, status in window if not 200 <= status < 300)
        if errors / len(window) > ERROR_RATE_STOP:
            return f"오류 {errors}/{len(window)}"
        p95 = pct([ms for ms, _ in window], 0.95)
        if p95 > P95_STOP_MS:
            return f"창 p95 {p95:.0f}ms"
    return None


class Client:
    """연결 하나(keep-alive)와 쿠키 · CSRF 번호표를 들고 다니는 워커 한 명."""

    def __init__(self, host=HOST, port=None, scheme="https", timeout=TIMEOUT):
        self.host, self.port, self.scheme, self.timeout = host, port, scheme, timeout
        self.cookies = {}
        self.conn = None

    def close(self):
        if self.conn is not None:
            try:
                self.conn.close()
            except OSError:
                pass
            self.conn = None

    def _store(self, raw):
        jar = SimpleCookie()
        try:
            jar.load(raw)
        except CookieError:
            return
        for name, morsel in jar.items():
            if morsel.value == "" or morsel["max-age"] == "0":
                self.cookies.pop(name, None)
            else:
                self.cookies[name] = morsel.value

    def request(self, method, path, body=None):
        """(상태, ms, 본문). 연결이 끊기거나 시간 초과면 상태 0."""
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json", "Connection": "keep-alive"}
        if self.cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if method != "GET" and "XSRF-TOKEN" in self.cookies:
            headers["X-XSRF-TOKEN"] = self.cookies["XSRF-TOKEN"]
        start = time.perf_counter()
        try:
            if self.conn is None:
                cls = http.client.HTTPSConnection if self.scheme == "https" else http.client.HTTPConnection
                self.conn = cls(self.host, self.port, timeout=self.timeout)
            self.conn.request(method, path, body=data, headers=headers)
            resp = self.conn.getresponse()
            payload = resp.read()
        except (OSError, http.client.HTTPException):
            self.close()
            return 0, (time.perf_counter() - start) * 1000, b""
        elapsed = (time.perf_counter() - start) * 1000
        for raw in resp.headers.get_all("Set-Cookie") or []:
            self._store(raw)
        if (resp.getheader("Connection") or "").lower() == "close":
            self.close()
        return resp.status, elapsed, payload

    def login(self, login_id, password):
        """번호표를 받고 로그인한다. 상태 코드(번호표를 못 받으면 -1)."""
        if "XSRF-TOKEN" not in self.cookies:
            self.request("GET", "/api/v1/categories")
        if "XSRF-TOKEN" not in self.cookies:
            return -1
        status, _, _ = self.request("POST", "/api/v1/auth/login", {"loginId": login_id, "password": password})
        return status

    def logout(self):
        status, _, _ = self.request("POST", "/api/v1/auth/logout")
        return status


def check(client, login_id, password):
    """부하 없이 로그인 → 내 정보 → 로그아웃 한 번. 로그인이 200 이 아니면 거기서 끝(잠김 방지)."""
    result = {"login": client.login(login_id, password)}
    if result["login"] != 200:
        return result
    result["me"] = client.request("GET", "/api/v1/members/me")[0]
    result["logout"] = client.logout()
    client.close()
    return result


def _ids(client, path, key):
    status, _, payload = client.request("GET", path)
    if status != 200:
        raise SystemExit(f"id 를 모으지 못함: {path} → {status}")
    return [row["id"] for row in json.loads(payload).get(key, [])]


def collect_ids(client):
    """실제 이슈 · 기사 · 사건 id 를 모은다(번호를 박지 않는다)."""
    issues = list(dict.fromkeys(_ids(client, "/api/v1/issues?size=50", "items")))
    articles = list(dict.fromkeys(_ids(client, "/api/v1/articles?page=0&size=50", "items")))
    events = []
    for issue in issues[:5]:
        events.extend(_ids(client, f"/api/v1/issues/{issue}/timeline", "events"))
    return {"issue": issues, "article": articles, "event": list(dict.fromkeys(events))}


def proc_cpu_reader():
    """EC2 의 /proc/stat 으로 CPU 사용률(%)을 읽는 함수. 읽을 수 없으면 None 을 돌려준다."""
    prev = [None]

    def read():
        try:
            with open("/proc/stat") as f:
                values = [int(x) for x in f.readline().split()[1:9]]
        except (OSError, ValueError):
            return None
        idle, total = values[3] + values[4], sum(values)
        if prev[0] is None:
            prev[0] = (idle, total)
            return 0.0
        d_idle, d_total = idle - prev[0][0], total - prev[0][1]
        prev[0] = (idle, total)
        return 100.0 * (1 - d_idle / d_total) if d_total > 0 else 0.0

    return read


def summarize(step, concurrency, rows, seconds, health_max, cpu_max, reason):
    """한 단계 요약. rows 는 (시각, ms, 상태, API, 역할)."""
    lat = [r[1] for r in rows]

    def stats(values):
        return {"n": len(values), "p50": round(pct(values, 0.5), 1), "p95": round(pct(values, 0.95), 1)}

    roles = {role: stats([r[1] for r in rows if r[4] == role]) for role in ("member", "guest")
             if any(r[4] == role for r in rows)}
    apis = {api: stats([r[1] for r in rows if r[3] == api]) for api in sorted({r[3] for r in rows})}
    return {
        "step": step, "concurrency": concurrency, "seconds": round(seconds, 1), "n": len(rows),
        "rps": round(len(rows) / seconds, 1) if seconds > 0 else 0.0,
        "p50": round(pct(lat, 0.5), 1), "p95": round(pct(lat, 0.95), 1), "p99": round(pct(lat, 0.99), 1),
        "codes": dict(Counter(str(r[2]) for r in rows)), "roles": roles, "apis": apis,
        "health_max_ms": round(health_max, 1), "sender_cpu_max": round(cpu_max, 1), "stop": reason,
        "at": datetime.now(KST).isoformat(timespec="seconds"),
    }


def run(host, login_id, password, until, out, port=None, scheme="https", steps=STEPS,
        step_seconds=STEP_SECONDS, discard_seconds=DISCARD_SECONDS, cpu_reader=None, seed=None):
    """단계를 차례로 돌리고 멈춘 까닭을 돌려준다(끝까지 갔으면 None). 단계 요약은 out(dict) 로."""
    cpu_reader = cpu_reader or proc_cpu_reader()
    stop = threading.Event()  # 켜지면 워커 · health · 지킴이가 모두 멈춘다
    lock = threading.Lock()
    samples = []  # (monotonic 시각, ms, 상태, API, 역할) — 잠금 안에서 시각을 찍어 쌓으므로 시각 순이다
    state = {"health": (0.0, 200), "health_max": 0.0, "cpu_max": 0.0, "reason": None}
    master = random.Random(seed)
    ids = collect_ids(Client(host, port, scheme))
    workers = []  # (스레드, 클라이언트, 역할)

    def halt(reason):
        with lock:
            if state["reason"] is None:
                state["reason"] = reason
        stop.set()

    def worker(client, role, rng):
        member = role == "member"
        while not stop.is_set():
            api, path = pick_request(rng, ids, member)
            status, ms, _ = client.request("GET", path)
            with lock:
                samples.append((time.monotonic(), ms, status, api, role))

    def health():
        # readiness 와 같은 1초 시간 초과 — 넘으면 상태 0 으로 남아 지킴이가 멈춘다
        client = Client(host, port, scheme, timeout=HEALTH_TIMEOUT)
        while not stop.is_set():
            status, ms, _ = client.request("GET", "/actuator/health")
            with lock:
                state["health"] = (ms, status)
                state["health_max"] = max(state["health_max"], ms)
            stop.wait(1.0)
        client.close()

    def guardian():
        """0.5초마다 최근 5초 창으로 멈춤 조건을 본다 — 단계 중에도, 로그인하는 동안에도 돈다."""
        # CPU 도 최근 5초 평균으로 본다 — 0.5초 순간값은 같은 서버의 Prometheus · Loki 가 잠깐 튀는 것까지 잡는다
        # (2026-11-12 09:01 첫 실행이 동시 1 에서 순간값 74% 로 멈췄다. 같은 때 1분 평균은 26%)
        cpu_recent = deque(maxlen=int(WINDOW_SECONDS / GUARD_SECONDS))
        while not stop.is_set():
            cutoff = time.monotonic() - WINDOW_SECONDS
            reading = cpu_reader()  # 늘 같은 간격으로 읽어야 값이 튀지 않는다
            if reading is not None:
                cpu_recent.append(reading)
            cpu = sum(cpu_recent) / len(cpu_recent) if len(cpu_recent) == cpu_recent.maxlen else None
            with lock:
                window = []
                for t, ms, status, _, _ in reversed(samples):
                    if t < cutoff:
                        break
                    window.append((ms, status))
                if cpu is not None:
                    state["cpu_max"] = max(state["cpu_max"], cpu)
                current_health = state["health"]
            reason = stop_reason(window, current_health, cpu, datetime.now(timezone.utc), until)
            if reason is not None:
                halt(reason)
                return
            stop.wait(GUARD_SECONDS)

    threads = [threading.Thread(target=health, daemon=True), threading.Thread(target=guardian, daemon=True)]
    for thread in threads:
        thread.start()
    try:
        for index, concurrency in enumerate(steps, start=1):
            # 새 워커를 붙인다 — 회원은 한 명씩 차례로 로그인(측정 밖), 실패하면 다시 시도하지 않는다
            while not stop.is_set() and len(workers) < concurrency:
                role = "guest" if len(workers) % MEMBER_EVERY == MEMBER_EVERY - 1 else "member"
                client = Client(host, port, scheme)
                if role == "member":
                    status = client.login(login_id, password)
                    if status != 200:
                        halt(f"로그인 {status} — 계정 잠김을 막으려고 멈춤")
                        break
                thread = threading.Thread(target=worker, args=(client, role, random.Random(master.random())),
                                          daemon=True)
                workers.append((thread, client, role))
                thread.start()
            if stop.is_set():
                break
            with lock:
                state["health_max"], state["cpu_max"] = 0.0, 0.0
            start, cpu_start = time.monotonic(), os.times()
            while not stop.is_set() and time.monotonic() - start < step_seconds:
                time.sleep(0.2)
            end, cpu_end = time.monotonic(), os.times()
            with lock:
                rows = [s for s in samples if start + discard_seconds <= s[0] <= end]
                health_max, cpu_max, reason = state["health_max"], state["cpu_max"], state["reason"]
            summary = summarize(index, concurrency, rows, max(end - start - discard_seconds, 0.001),
                                health_max, cpu_max, reason)
            # 이 프로세스가 쓴 코어 수 — 스레드는 GIL 로 한 코어에 묶이므로 1.0 근처면 보내는 쪽이 한계
            summary["sender_proc_cores"] = round(
                ((cpu_end.user - cpu_start.user) + (cpu_end.system - cpu_start.system)) / max(end - start, 0.001), 2)
            out(summary)
            if stop.is_set():
                break
            if summary["p95"] > STEP_P95_STOP_MS:
                halt(f"단계 p95 {summary['p95']:.0f}ms")
                break
    except KeyboardInterrupt:
        halt("Ctrl-C")
    finally:
        stop.set()
        for thread, _, _ in workers:
            thread.join(timeout=TIMEOUT + 1)
        logouts = Counter()
        for _, client, role in workers:
            if role == "member":
                logouts[str(client.logout())] += 1
            client.close()
        for thread in threads:
            thread.join(timeout=TIMEOUT + 1)
        print(f"로그아웃 {dict(logouts)}", file=sys.stderr, flush=True)
    return state["reason"]


def _printer(path):
    def out(summary):
        roles = " · ".join(f"{k} p95 {v['p95']}" for k, v in summary["roles"].items())
        bad = sum(v for k, v in summary["codes"].items() if not k.startswith("2"))
        print(f"단계 {summary['step']} 동시 {summary['concurrency']:>3}: {summary['rps']:>7}/s "
              f"p50 {summary['p50']} p95 {summary['p95']} p99 {summary['p99']}ms 오류 {bad} | {roles} | "
              f"health 최대 {summary['health_max_ms']}ms · 보내는 쪽 CPU {summary['sender_cpu_max']}%"
              + (f" | 멈춤: {summary['stop']}" if summary["stop"] else ""), flush=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(summary, ensure_ascii=False) + "\n")
    return out


def main():
    parser = argparse.ArgumentParser(description="단계 부하 시험 (Jira S15P31A102-193)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_check = sub.add_parser("check", help="부하 없이 로그인 · 내 정보 · 로그아웃 한 번")
    p_check.add_argument("login_id")
    p_run = sub.add_parser("run", help="단계 부하 시험")
    p_run.add_argument("label")
    p_run.add_argument("login_id")
    p_run.add_argument("--until", required=True, help="이 한국 시각(HH:MM)이 지나면 멈춘다")
    p_run.add_argument("--steps", default=",".join(map(str, STEPS)))
    args = parser.parse_args()

    password = getpass.getpass("시험 계정 비밀번호: ")
    if args.cmd == "check":
        print(json.dumps(check(Client(), args.login_id, password)), flush=True)
        return

    until = parse_until(args.until, datetime.now(timezone.utc))
    if past(until, datetime.now(timezone.utc)):
        raise SystemExit(f"끝 시각 {args.until} 이 이미 지났다")
    steps = [int(x) for x in args.steps.split(",")]
    path = os.path.expanduser(f"~/load-{args.label}.jsonl")
    print(f"시작 {datetime.now(KST):%H:%M:%S} · 단계 {steps} · {STEP_SECONDS:.0f}초씩 · 끝 시각 {args.until} · "
          f"결과 {path}", flush=True)
    reason = run(HOST, args.login_id, password, until, _printer(path), steps=steps)
    print(f"끝 {datetime.now(KST):%H:%M:%S} · 멈춘 까닭: {reason or '모든 단계를 마침'}", flush=True)


if __name__ == "__main__":
    main()
