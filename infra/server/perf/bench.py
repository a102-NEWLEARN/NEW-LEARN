"""조회 API 실측 — 개선 전 · 후에 같은 방법으로 돌린다 (Jira S15P31A102-189 · 190).

어디서: 관리 서버(EC2). 이 PC 에서 보내 서버에서 돈다
    ssh newlearn 'python3 - <이름표> [사건 id]' < infra/server/perf/bench.py
- 사이트 주소(https://newlearn.io.kr)로 입구(Envoy)부터 backend · DB 까지 한 번에 잰다.
  연결 하나를 계속 써서 TLS 연결 비용은 뺀다
- API 마다 몸풀기 20번은 버리고 4회 × 25번 = 100번을 잰다
- 요청에 User-Agent newlearn-bench/1 을 붙인다 — 대시보드 「조회 성능」이 이 요청을 사용자 요청에서 뺀다
- 사건 id 를 주면 A6 사건 관련 기사도 잰다. explain.sql 첫 줄이 고르는 사건(공개 기사가 가장 많은 사건)을 준다
- 결과: API 마다 p50 · p95 · 평균(ms), 끝에 JSON 한 줄. results.md 에 옮긴다
"""
import http.client
import json
import statistics
import sys
import time

HOST = "newlearn.io.kr"
USER_AGENT = "newlearn-bench/1"
LABEL = sys.argv[1] if len(sys.argv) > 1 else "run"
EVENT_ID = sys.argv[2] if len(sys.argv) > 2 else None
APIS = [
    # 11-11 아침 첫 측정과 같은 여섯 — 순서 · 주소를 바꾸지 않는다
    ("A7 기사 목록 첫 쪽", "/api/v1/articles?page=0&size=8"),
    ("A7 기사 목록 1000쪽", "/api/v1/articles?page=1000&size=8"),
    ("A7 분야 탭(정치) 첫 쪽", "/api/v1/articles?category=politics&page=0&size=8"),
    ("A1 분야 수", "/api/v1/categories"),
    ("A13 검색(반도체)", "/api/v1/search?q=%EB%B0%98%EB%8F%84%EC%B2%B4"),
    ("A2 이슈 목록", "/api/v1/issues?size=3"),
    # 11-11 오후에 더함 — 결과가 없는 검색어(가장 나쁜 경우)
    ("A13 검색(결과 없는 말)", "/api/v1/search?q=%EB%89%B4%EB%9F%B0%EC%B8%A1%EC%A0%95%EC%97%86%EB%8A%94%EB%A7%90"),
]
if EVENT_ID:
    APIS.append(("A6 사건 관련 기사", f"/api/v1/events/{int(EVENT_ID)}/articles?page=0&size=5"))
WARMUP, ROUNDS, PER_ROUND = 20, 4, 25


def timed_get(conn, path):
    start = time.perf_counter()
    conn.request("GET", path, headers={"Accept": "application/json", "Connection": "keep-alive",
                                       "User-Agent": USER_AGENT})
    resp = conn.getresponse()
    resp.read()
    elapsed = (time.perf_counter() - start) * 1000
    if resp.status != 200:
        raise RuntimeError(f"{path} → {resp.status}")
    return elapsed


def pct(values, p):
    ordered = sorted(values)
    k = (len(ordered) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


results = []
conn = http.client.HTTPSConnection(HOST, timeout=30)
for name, path in APIS:
    for _ in range(WARMUP):
        timed_get(conn, path)
    samples = [timed_get(conn, path) for _ in range(ROUNDS * PER_ROUND)]
    row = {
        "api": name,
        "path": path,
        "n": len(samples),
        "p50": round(pct(samples, 0.5), 1),
        "p95": round(pct(samples, 0.95), 1),
        "avg": round(statistics.mean(samples), 1),
    }
    results.append(row)
    print(f"{name:<22} n={row['n']} p50={row['p50']}ms p95={row['p95']}ms avg={row['avg']}ms", flush=True)
conn.close()
print(json.dumps({"label": LABEL, "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "results": results}, ensure_ascii=False))
