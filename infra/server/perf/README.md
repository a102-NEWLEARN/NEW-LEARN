# 조회 성능 측정

기사 표 부분 인덱스(Flyway V14) 전 · 후를 같은 방법으로 잰다 (Jira S15P31A102-189 · 190). 계획은 `docs/plans/2026-11-11-query-performance.md`, 잰 값은 `results.md`, 실시간 그림은 Grafana 대시보드 「조회 성능」(`infra/k8s/bootstrap/pg-exporter/`).

| 파일 | 무엇을 | 돌리는 법 (이 PC, 저장소 루트) |
|---|---|---|
| `bench.py` | API 마다 100번 요청해 p50 · p95 · 평균 | `ssh newlearn 'python3 - <이름표> <사건 id>' < infra/server/perf/bench.py` |
| `explain.sql` | 기사 표 행 수, 운영에서 실제로 나가는 쿼리 15개의 실행 계획 · 읽은 블록 | `ssh newlearn 'kubectl -n data exec -i postgres-0 -- psql -X -U newlearn -d newlearn' < infra/server/perf/explain.sql` |
| `stats.sql` | 기사 표 통째 읽기 · 인덱스 읽기 · 블록 누적값, 표 · 인덱스 크기 | 위와 같고 파일만 `stats.sql` |

## 한 번 잴 때 순서

1. `stats.sql` → `bench.py` → `stats.sql` — 두 번 찍은 통계의 차이가 bench 동안 일어난 일이다
2. `explain.sql` — 첫 줄의 `A6 사건 =` 값을 다음 bench 의 사건 id 로 쓴다
3. 결과를 `results.md` 에 옮긴다. 시각과 그때 부하(수집이 돌았나)를 같이 적는다

피할 때: 매일 10:00 수집, 04:00 DB 덤프, 15분 수집이 켜진 뒤의 회차(:00 · :15 · :30 · :45).

## 쿼리 출처

- `explain.sql` 의 SQL 은 운영에서 실제로 나간 문장을 `pg_stat_activity` 에서 받아 매개변수만 값으로 바꾼 것이다(2026-11-11). backend 코드가 바뀌면 다시 받는다 — 사이트에 요청을 보내는 동안 `pg_stat_activity` 의 `query` 를 짧은 간격으로 모은다
- A7 기사 목록 `GET /api/v1/articles` · A6 사건 관련 기사 `GET /api/v1/events/{eventId}/articles` 는 Spring Data JPA 가 만든 문장이다. 본문(body)까지 읽고 언론사 · 분야를 조인한다. `select id` 로 줄여 재면 인덱스 뒤 표를 안 읽는 계획이 나와 실제보다 좋게 보인다

## 입구 로그 쿼리 (LogQL)

원본은 대시보드 JSON(`query-perf-dashboard.json`)이다. 패널은 1시간 창이고, `results.md` ① 은 같은 쿼리의 `[1h]` 를 `[7d]` 로 바꿔 한 시점에서 잰다. A7 p95 는 이렇다.

```logql
quantile_over_time(0.95, {namespace="envoy-gateway-system", container="envoy"} |= "/api/v1/articles"
  | json | x_envoy_origin_path=~`/api/v1/articles(\?.*)?`
  | response_code="200" | user_agent!="" | user_agent!~`newlearn-bench.*`
  | unwrap duration | __error__="" [7d]) by ()
```

- `duration` 은 Envoy 가 요청을 받아 응답을 다 보낼 때까지(ms)다
- 측정 스크립트 요청은 뺀다. 지금 판은 User-Agent `newlearn-bench/1` 을 보내고, 11-11 아침 첫 판은 User-Agent 가 없었다. 브라우저는 늘 보낸다
- 경로로 묶지 않고 `by ()` 로 하나로 모은다. A13 통합 검색 `GET /api/v1/search` 의 경로에는 검색어(`q=`)가 들어 있다
- 서버에서 직접 물을 때: `kubectl get --raw "/api/v1/namespaces/monitoring/services/loki:3100/proxy/loki/api/v1/query?query=<URL 인코딩한 쿼리>&time=<RFC3339>"`
