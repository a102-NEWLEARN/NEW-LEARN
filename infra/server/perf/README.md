# 조회 성능 측정

기사 표 부분 인덱스(Flyway V14) 전 · 후를 같은 방법으로 잰다 (Jira S15P31A102-189 · 190). 계획은 `docs/plans/2026-11-11-query-performance.md`, 잰 값은 `results.md`, 실시간 그림은 Grafana 대시보드 「조회 성능」(`infra/k8s/bootstrap/pg-exporter/`).

| 파일 | 무엇을 | 돌리는 법 (이 PC, 저장소 루트) |
|---|---|---|
| `bench.py` | API 마다 100번 요청해 p50 · p95 · 평균 | `ssh newlearn 'python3 - <이름표> <사건 id>' < infra/server/perf/bench.py` |
| `explain.sql` | 기사 표 행 수, 운영에서 실제로 나가는 쿼리 15개의 실행 계획 · 읽은 블록 | `ssh newlearn 'kubectl -n data exec -i postgres-0 -- psql -X -U newlearn -d newlearn' < infra/server/perf/explain.sql` |
| `stats.sql` | 기사 표 통째 읽기 · 인덱스 읽기 · 블록 누적값, 표 · 인덱스 크기 | 위와 같고 파일만 `stats.sql` |
| `load.py` | 단계 부하 시험 — 동시 요청을 1 → 128 로 1분씩 올려 포화 지점 · 먼저 막히는 층을 잰다 (Jira S15P31A102-193). 결과 `load-results.md` | 아래 「부하 시험」 |

## 부하 시험 (load.py)

관리 서버에서 tmux 안에 돌린다(관리 PC 와이파이가 끊겨도 실행이 이어진다). 비밀번호는 서버 터미널에서만 묻는다.

```bash
scp infra/server/perf/load.py newlearn:load.py
```

```bash
ssh newlearn
```

서버에서 `tmux new -s load` 뒤:

```bash
python3 load.py check <시험 계정 아이디>
```

```bash
python3 load.py run <이름표> <시험 계정 아이디> --until <HH:MM>
```

- `check` 는 부하 없이 로그인 · 내 정보 · 로그아웃 한 번 — `{"login": 200, "me": 200, "logout": 204}` 면 된다. 같은 아이디로 5번 틀리면 1분 잠긴다
- 요청은 실제 사용자 요청 비율(`MIX`, 입구 로그 7일)대로 고른다. 워커 넷 중 셋은 회원 — 로그인은 한 명씩 차례로(같은 아이디 동시 로그인은 잠긴다), 끝나면 로그아웃
- 스스로 멈추는 때(0.5초마다 따로 도는 지킴이): 최근 5초 p95 500ms · 5xx 1건 · 오류 1% · health(1초 시간 초과) 500ms 나 200 아님 · 보내는 쪽 CPU 5초 평균 70% · `--until`(한국 시각, 서버는 UTC) · Ctrl-C. backend readiness(1초 · 5초마다 · 2번)가 빠지기 전에 멈추려는 값이다. 그 밖에 회원 로그인이 200 이 아니면 다시 시도하지 않고 멈추고, 단계 전체 p95 가 1초를 넘으면 다음 단계로 가지 않는다
- 결과는 단계마다 한 줄과 `~/load-<이름표>.jsonl`. 가져온 뒤 서버의 `load.py` · 결과 파일을 지운다
- 수집 회차(10:00 · 15분마다)와 DB 덤프(04:00)를 피한다. User-Agent `newlearn-bench-load/1` 이라 대시보드 「조회 성능」 사용자 요청에서 빠진다

## exporter 올리기

postgres_exporter 가 PostgreSQL 통계 표(기사 표 통째 읽기 · 인덱스 읽기 · 블록)를 지표로 바꾸고, 대시보드 「조회 성능」이 이 지표와 입구 로그의 API 응답 시간을 같이 그린다. 값은 `infra/k8s/bootstrap/pg-exporter/`, 왜 두었나는 `SSOT.md` 6절 「모니터링」. 저장소를 서버에 클론하지 않으므로 그 폴더를 먼저 서버로 보낸다(`infra/server/README.md` 「서버로 보내기」).

1. **길 정책** — data 네임스페이스 `postgres-ingress` 에 exporter 항목이 있어야 5432 에 닿는다(`infra/k8s/services/data/netpol.yaml`). Argo CD 의 data 앱이 dev 를 따라 반영한다
2. **DB 역할 · 비밀번호 Secret** (EC2, 사람이 친다) — 읽기 전용 역할 `newlearn_monitor`(`pg_monitor`)를 만들고 무작위 비밀번호를 정해 monitoring 의 Secret `postgres-exporter` 에 넣는다. 평문은 화면 · 명령 줄 · DB 로그에 남지 않는다(스크립트 머리 주석). 다시 돌리면 비밀번호를 바꾸고 exporter 를 다시 띄운다

   ```bash
   bash infra/k8s/bootstrap/pg-exporter/make-secret.sh
   ```

3. **설치** (EC2) — 대시보드(`query-perf-dashboard.json`)를 바꾼 뒤에도 같은 한 줄

   ```bash
   kubectl apply -k infra/k8s/bootstrap/pg-exporter
   ```

4. **확인**

   | 무엇을 | 어떻게 (어디서) | 기대 |
   |---|---|---|
   | exporter | `kubectl -n monitoring logs deploy/postgres-exporter` (EC2) | 오류 줄 없음 |
   | 수집 | `infra/server/README.md` 「모니터링」 5번의 수집 대상 명령 (EC2) | `postgres-exporter` 까지 모두 up |
   | DB 연결 | Grafana Explore 에서 `pg_up` | 1 |
   | 값 | 대시보드 「조회 성능」 | 패널 여섯에 모두 선이 있다. 아래 세 칸은 설치한 뒤부터 쌓인다 |

내리기: `kubectl delete -k infra/k8s/bootstrap/pg-exporter` → `kubectl -n monitoring delete secret postgres-exporter` → DB 에서 `drop role newlearn_monitor` → 길 정책 항목을 빼는 MR.

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
