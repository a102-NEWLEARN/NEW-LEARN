# 조회 성능 — 개선 전을 Grafana 에 남기고, 11/12 적재 전에 기사 표 부분 인덱스를 단다

## 왜

11-11 아침에 운영 사이트에서 실제로 쟀다. 아래는 사용자 요청 7일치(Loki 입구 로그)다. 잰 값의 원본은 `infra/server/perf/results.md` 다.

| API | p50 | p95 |
|---|---|---|
| A7 기사 목록 `GET /api/v1/articles` (모든 쪽) | 237ms | 416ms |
| A1 분야 수 `GET /api/v1/categories` | 175ms | 342ms |
| A13 통합 검색 `GET /api/v1/search` | 293ms | 454ms |
| (비교) A9 기사 마인드맵 `GET /api/v1/articles/{articleId}/mindmap` | 7ms | 13ms |

원인은 하나다. 기사 표(13만 행 · 480MB)에 기본 키와 URL 인덱스만 있다. 그래서 공개 기사(10%)만 보는 쿼리도 매번 표 전체를 읽는다. EXPLAIN 으로 보면 쿼리마다 Seq Scan 으로 약 38,000블록(8KB)을 읽는다. 홈을 한 번 열면 버퍼 기준 약 11만 블록이다(OS 캐시에서 온 것도 포함).

Querydsl 은 쿼리를 짜는 도구다. 들이는 것만으로 빨라지지 않는다. 카카오페이 글의 이득도 인덱스와 페이지 방식에서 나왔다. 이번에는 지금 쓰는 JPA · JdbcClient 그대로 두고 인덱스를 단다. Querydsl 도입은 따로 정한다.

발표에 쓸 수 있게 전 · 후를 같은 방법으로 잰다. 결과물은 셋이다.
- Grafana 대시보드 「조회 성능」 — API 응답 시간(Loki)과 DB 의 표 통째 읽기(exporter)가 바꾼 시점에서 꺾이는 그림
- 전 · 후 표 — 입구 로그 · 측정 스크립트 · EXPLAIN · DB 통계, `infra/server/perf/results.md`
- 발표용 그림 3 ~ 4장 — 글은 적게, 그림 하나에 메시지 하나

## 순서 (사용자 결정: 인덱스는 11/12 적재 전, exporter 도 올림)

15분 수집과 자동 분석은 11/12 적재 · 확인 직후부터 돈다(Jira 156, `origin/infra` 의 7dd02e8). 그 뒤에는 개선 전과 같은 부하로 잴 창이 없다. 그래서 적재 전에 지금 데이터 · 지금 부하로 전 → V14 → 후를 잰다.

| 언제 | 무엇 | 사람 몫 |
|---|---|---|
| 11-11 오늘 | **A** exporter · 대시보드 · 측정 스크립트 MR → 머지 → 서버에 올림. 이때부터 개선 전 DB 지표가 쌓인다 | EC2 명령 둘 |
| 11-11 오늘 | **B0** 개선 전 다시 재기 → V14 내용 확정 | 없음 |
| 11-11 ~ 12 아침 | **B** V14 MR. 적재 SQL 판 검사는 Jira 152 쪽에서 14 를 받게 고침, Jira 156 과 번호 맞춤(B2) | 없음 |
| 11-12 오전, 10:00 수집 · 적재 전 | backend 배포 → V14 적용 → VACUUM → **B3** 개선 후 재기 → 대시보드 캡처 | VACUUM 한 줄 |
| 11-12 ~ 15 | 표 · 그림 · 기록 | 그림을 발표 자료에 넣을지 정하기 |

## A. 개선 전을 Grafana 에 남기기 (오늘)

### A1. postgres_exporter — `infra/k8s/bootstrap/ci-exporter/` 방식 그대로

- 새 폴더 `infra/k8s/bootstrap/pg-exporter/` 를 만든다
  - monitoring 네임스페이스에 둔다. kustomization 으로 사람이 `kubectl apply -k` 한다
  - Deployment · Service · ServiceMonitor 를 둔다. 노드는 컨트롤 플레인에 둔다. 자원은 cpu 10m · 메모리 32Mi 요청, 128Mi 상한이다. nonroot · 읽기 전용 루트 · capabilities 전부 버림 · 토큰 마운트 안 함은 `ci-exporter/exporter.yaml` 과 같다
  - 이미지는 `quay.io/prometheuscommunity/postgres-exporter` 최신 안정판이다. 태그와 digest 를 구현 때 확인해 고정하고 확인 날짜를 주석에 남긴다
- DB 접속은 읽기 전용 역할 `newlearn_monitor`(`pg_monitor`)로 한다. 슈퍼유저 `newlearn` 의 비밀번호를 monitoring 으로 옮기지 않는다. 주소는 `postgres.data.svc:5432`, DB `newlearn`, sslmode=disable 이다(클러스터 안)
- 비밀번호는 `make-secret.sh` 가 만든다. 사람이 EC2 에서 돌린다. 평문이 어떤 로그에도 남지 않게 만든다
  - EC2 에서 무작위 비밀번호를 만들고, 그 자리에서 SCRAM-SHA-256 값(verifier)을 계산한다. DB 에는 이 값만 보낸다
  - psql 세션 첫 줄에서 `log_statement = 'none'` · `log_min_error_statement = panic` 으로 문장 기록을 끈다. 그 세션 안에서만 적용된다. 이유: DB 로그는 Loki 로 가서 14일 남는다(`alloy-values.yaml`)
  - 역할은 `pg_roles` 에 없을 때만 만든다. 그래서 다시 돌려도 「already exists」 오류가 나지 않는다. 비밀번호는 그다음 `ALTER ROLE` 로 정한다
  - Secret `postgres-exporter` 는 `/dev/stdin` 으로 만든다(`infra/server/README.md` 의 기존 방식)
  - Deployment 가 있을 때만 다시 띄운다. 첫 실행 때는 아직 Deployment 가 없다
- 길: `infra/k8s/services/data/netpol.yaml` 의 `postgres-ingress` 에 항목을 하나 더한다
  - 이름표는 `k8s:io.kubernetes.pod.namespace: monitoring` 과 exporter 이름표다. 네임스페이스 이름표가 없으면 data 로 한정된다
  - 기존 줄은 건드리지 않는다. 머리 주석의 「부르는 쪽」 목록에 exporter 를 더한다
  - DB 로 들어오는 길이라 권한 성격이다. MR 에 사람 최종 확인을 적는다
  - monitoring 쪽에는 나가는 길을 막는 정책이 없다(reviewer 확인)
- 쓸 지표: 기사 표(`relname="article"`)의 통째 읽기 횟수 · 인덱스 읽기 횟수 · 통째로 읽은 행 수, 디스크 블록 · 메모리 블록. 정확한 이름과 시계열 수는 띄운 뒤 `/metrics` 를 읽어 확인한다. 쿼리 문장이 지표로 나가지 않는지도 그때 본다

### A2. 대시보드 「조회 성능」

`pg-exporter/query-perf-dashboard.json` 에 둔다. configMapGenerator 로 올린다(이름표 `grafana_dashboard: "1"`, 이름 해시 끔). 「CI 병목」과 같은 방식이다.

| 패널 | 원천 | 무엇이 보이나 |
|---|---|---|
| 읽는 법 | 글 | 무엇을 바꿨나, 어느 선을 보나 |
| API 응답 시간 p50 · p95 | Loki | A7 · A1 · A13 · A2 이슈 목록 `GET /api/v1/issues` · A9. 응답 200 만, 측정 스크립트 요청은 뺀다 |
| API 요청 수 | Loki | 같은 API 의 시간당 요청 수 — 전 · 후 부하가 비슷한지 |
| 기사 표 통째 읽기 vs 인덱스 읽기 (초당) | exporter | 인덱스 뒤 통째 읽기가 0 근처로 떨어진다 |
| 통째로 읽은 행 수 (초당) | exporter | 13만 행씩 읽던 것이 사라진다 |
| 디스크 블록 vs 메모리 블록 | exporter | 디스크 읽기가 준다 |

- Loki 쿼리는 API 마다 하나씩 쓰고 `by ()` 로 묶어 이름을 고정한다. 경로 그대로 묶으면 A13 의 `q=` 검색어가 보는 사람 화면에 드러난다
- 기본 창은 7일 이하로 둔다. 자동 새로 고침은 끈다(Loki 메모리 상한 512Mi)
- 바꾼 시각은 Loki 주석 쿼리로 찍는다. backend 로그의 Flyway 적용 문구(`now at version v14`)를 쓴다. 화면에서 손으로 찍는 주석은 Grafana 가 다시 뜨면 사라진다(디스크 꺼짐). 정확한 문구는 구현 때 로그로 확인한다

### A3. 측정 스크립트를 저장소로 — `infra/server/perf/`

- `bench.py` · `explain.sql` 을 옮긴다. 11-11 판에서 다음을 바꾼다
  - bench 요청에 User-Agent `newlearn-bench/1` 을 붙인다. 대시보드가 이 요청을 뺀다
  - explain.sql 을 실제 SQL 로 바꾼다. 로컬 backend 시험에서 Hibernate SQL 로그를 받아 옮긴다
    - 11-11 판은 `select id` 만 골랐다. 실제 A7 은 언론사 · 분야를 조인한다(`ArticleRepository.java` 의 `@EntityGraph`)
    - 그대로 두면 인덱스 뒤 Index Only Scan 으로 나와 실제보다 좋게 보인다
  - explain · bench 에 빠진 쿼리를 더한다
    - A1 의 이슈 수 쿼리(`PublicEventSql` 로 article 조인)
    - A2 이슈 목록
    - A6 사건 관련 기사 `GET /api/v1/events/{eventId}/articles` — 정렬 + LIMIT + exists 모양이라 새 인덱스에서 나빠지기 쉽다
    - 결과가 20건 미만인 검색어
  - 개선 전 · 후에 `pg_stat_user_tables` · `pg_statio_user_tables` 의 article 행을 찍는 SQL 을 더한다
- `README.md` 에는 돌리는 법과 LogQL 원문을 둔다. `results.md` 에는 전 · 후 표를 두고, 11-11 아침 값도 옮긴다
- 11-11 아침 측정(User-Agent 없음)이 Loki 에 어떻게 찍혔는지 확인해 대시보드에서 같이 뺀다

### A 의 사람 몫 (EC2, 파일 카드로 드림)

1. MR 머지 → Argo CD 가 data 정책을 반영했는지는 Claude 가 읽어서 확인한다
2. `bash infra/k8s/bootstrap/pg-exporter/make-secret.sh`
3. `kubectl apply -k infra/k8s/bootstrap/pg-exporter`

## B. 기사 부분 인덱스 (11/12 적재 전)

### B0. 개선 전 다시 재기 (오늘)

A 를 올린 뒤 새 explain.sql · bench · DB 통계를 돌린다. 전 · 후 표는 이 값과 비교한다. 이 결과로 V14 에 A2 쪽 인덱스(`event.issue_id` · `article_event.event_id`)를 더할지 정한다. 더하는 조건은 그 표를 통째로 읽을 때뿐이다.

**결과 (11-11 09:00, 운영 EXPLAIN — `results.md` ③)**: 쿼리 15개 중 13개가 기사 표를 통째로 읽었다. A2 이슈 목록 · A1 의 이슈 수 · 검색의 사건 쿼리도 「공개 기사가 있나」를 보려고 기사 표를 통째로 읽었다. 사건 · 기사-사건 연결 표는 작아서(825 · 12,717행) 통째로 읽어도 수백 블록이다. 그래서 A2 쪽 인덱스는 더하지 않고, 기사 쪽 첫째 인덱스가 그 조인도 맡게 한다. 운영과 크기가 같은 로컬 시험 DB 에서 후보 셋을 견줬고(`results.md` 「인덱스를 고른 근거」), A2 이슈 카드의 언론사 수까지 표 없이 세려고 첫째에 `press_code` 를 담는다.

### B1. Flyway V14 — `V14__article_public_indexes.sql`

```sql
-- 공개 기사만 담는 인덱스 둘. 목록 · 개수 · 분야 탭 · 분야 수 · 검색 · 이슈 카드가 표 전체 대신 이것만 본다
create index article_public_published_idx
    on article (published_at desc, id desc) include (press_code)
    where released_at is not null;
create index article_public_category_published_idx
    on article (category_code, published_at desc, id desc)
    where released_at is not null;
```

| 쿼리 | 쓰는 인덱스 |
|---|---|
| A7 목록 본문 · 개수 | 첫째 |
| A7 분야 탭 본문 · 개수, A1 분야별 기사 수 | 둘째 |
| A13 기사 검색 | 첫째를 최신순으로 훑으며 제목을 거른다 |
| 「공개 기사가 있나」 조인 — A1 의 이슈 수, A2 이슈 목록 개수 · 카드, A13 의 사건 · 이슈 | 첫째(인덱스만 읽는다) |

- 정의가 실제 쿼리와 맞는 것은 reviewer 가 확인했다. A7 은 `ArticleService.java` 의 정렬, A1 은 `CategoryQueryRepository.java`, A13 은 `SearchQueryRepository.java` 다
- A13 은 결과가 20건이 안 되면 공개 행 12,716개의 힙을 끝까지 읽는다. 그래도 지금(13만 행 전부)보다 적다. 인덱스 뒤에도 A13 이 다른 API 보다 눈에 띄게 느리면 trigram 은 따로 계획한다
- `CONCURRENTLY` 는 쓰지 않는다. 13만 행이라 몇 초면 끝나고, 그동안 읽기는 그대로 되고 기사 쓰기만 기다린다. V1 ~ V13 과 같은 트랜잭션 방식이다
- 적용 뒤 사람이 `VACUUM (ANALYZE) article` 을 한 번 돌린다. 개수 쿼리가 표를 열지 않고 인덱스만 읽으려면(index-only scan) 필요하다
- 먼저 실패하는 시험
  - `InterestIssueSchemaTest.java` 의 버전 목록에 "14"를 더한다
  - 새 시험 하나: `pg_indexes.indexdef` 로 두 인덱스의 칸 순서와 `WHERE (released_at IS NOT NULL)` 을 확인한다
- 같이 고칠 문서 · 주석: `docs/specs/F02-search-api.md` 73행 「인덱스 없는 부분 일치 SQL」, `SearchQueryRepository.java` 11행 「인덱스 없이 표를 훑는다」. 검색 SQL 과 `%` `_` `\` 를 글자로 보는 약속은 그대로다

### B2. 다른 작업과 맞출 것

- **Jira 152 AI 결과 적재**: `infra/server/classified-load.sql` 의 판 검사가 `<> 13` 이었다. 인덱스만 더한 판이라 적재 SQL 은 그대로 맞으므로 「13 또는 14」로 고쳤다(!826, 11-11)
  - 고치기 전에 V14 가 먼저 들어갔더라도 데이터는 상하지 않는다. 검사가 첫 단계에서 예외를 내고 트랜잭션이 통째로 되돌아간다
- **Jira 156 15분 수집 · 자동 분석**: 공개 전 기사 후보 쿼리(`released_at is null`)라 V14 와 겹치지 않는다. 156 쪽에 새 마이그레이션이 필요하면 V15 부터 쓴다(11-11 확인). 11/12 10:00 ~ 10:15(마지막 매일 수집)는 피한다

### B3. 배포와 개선 후 재기

- backend MR → backend → dev → 이미지 → 배포 태그 MR, 늘 하던 길이다. backend 가 뜰 때 Flyway 가 V14 를 적용한다
- 시각은 11-12 오전, 10:00 수집과 적재를 피한다
- 적용 → VACUUM → `bench.py after` · explain.sql · DB 통계를 돌리고, 곧바로 대시보드를 캡처한다. Prometheus 는 7일만 보관한다(8GB 에 먼저 닿으면 더 일찍 지운다). 그래서 개선 전 DB 지표는 발표 날 즈음 사라진다. Loki 는 14일이다
- 인덱스 크기(`pg_relation_size`)와 DB 디스크 여유를 잰다

## 발표 자료

예시 PDF 처럼 장마다 그림 하나, 글은 한 줄이다. PNG 로 만들고, 팀 발표 자료에 넣을지는 사용자가 정한다.

1. 「홈 한 번에 11만 블록」 — 표 전체를 읽던 그림과 공개 10% 만 읽는 그림
2. Grafana — API p95 와 DB 표 통째 읽기가 같은 시점에 꺾이는 화면
3. API 별 p50 전 · 후 막대
4. 쿼리마다 읽은 블록 38,000 → N (실제 SQL 기준)

## 바꿀 파일

| MR | 파일 |
|---|---|
| A (infra) | 새 `infra/k8s/bootstrap/pg-exporter/` — `kustomization.yaml` · `exporter.yaml` · `make-secret.sh` · `query-perf-dashboard.json` |
| | 새 `infra/server/perf/` — `README.md` · `bench.py` · `explain.sql` · `stats.sql` · `results.md` |
| | 고침 `infra/k8s/services/data/netpol.yaml` · `infra/server/README.md` 「모니터링」 머리 문단 한 구절 · `SSOT.md` 6절 「모니터링」 · 이 계획 파일 |
| B (backend) | 새 `backend/src/main/resources/db/migration/V14__article_public_indexes.sql` · 인덱스 정의 시험 |
| | 고침 `InterestIssueSchemaTest.java` · `SearchQueryRepository.java` 주석 · `docs/specs/F02-search-api.md` · `docs/data-model.md`(article 인덱스) |
| 기록 | `infra/server/perf/results.md` 개선 후 값, `SSOT.md` 10절에 한 줄과 그 파일 가리키기 |

Jira 는 두 장이다. A 인프라 측정은 S15P31A102-189, B 기사 부분 인덱스는 S15P31A102-190 이다.

## 안 바꿀 것

- 검색 SQL 과 그 약속, API 응답 모양, 목록의 쪽 번호 방식
- 「더 보기」에서 같은 기사가 두 번 보이는 문제(frontend) — 성능이 아니라 정확성 문제라 Jira · 계획을 따로 둔다. 15분 수집이 시작되는 11/12 저녁 전에 한다
- Querydsl 도입 — 따로 정한다. Spring Boot 4.1 · Hibernate 7 에 맞는 판부터 확인한다
- `shared_buffers`(128MB) · postgres 메모리 · `pg_stat_statements` — 모두 DB 를 다시 띄워야 한다
- backend Micrometer 지표
- 이미 적용된 V1 ~ V13
- 경보 규칙 — exporter 가 꺼지면 경보는 없고 대시보드에 「데이터 없음」이 뜬다. 측정 도구라서다

## 리스크

| 무엇이 | 어떻게 막나 |
|---|---|
| 적재가 V14 보다 먼저 시작된다 | 판 검사가 「13 또는 14」면 어느 순서든 된다. 측정 조건만 달라지므로 그 사실을 표에 적는다 |
| 판 검사를 고치기 전에 V14 가 들어간다 | 적재가 첫 단계에서 멈추고 통째로 되돌아간다. 데이터는 그대로다. 검사를 고치고 다시 돌린다 |
| 인덱스를 만드는 몇 초 동안 기사 쓰기가 기다린다 | 10:00 수집과 적재를 피한다. 읽기는 영향 없다 |
| 새 인덱스 때문에 A6 · 드문 검색어에서 더 나쁜 계획을 고른다 | explain 에 둘 다 넣어 전 · 후를 본다. 나빠지면 그 쿼리를 따로 고친다. 첫째 인덱스는 A7 도 쓰므로 지우지 않는다 |
| 개선 전 DB 지표 창이 짧다 (11-11 오후 ~ 11-12 오전, 04:00 덤프 포함) | B0 · B3 의 DB 통계 표가 같은 근거를 따로 남긴다 |
| 비밀번호가 로그 · 화면으로 샌다 | SCRAM 값만 보내고 세션 문장 기록을 끈다. Secret 은 `/dev/stdin` 으로 만든다 |
| data 정책을 잘못 고쳐 backend → DB 길이 막힌다 | 기존 줄은 그대로 두고 항목만 더한다. 머지 뒤 사이트 A7 200 을 바로 본다. 사람이 최종 확인한다 |
| `pg_monitor` 는 다른 세션의 쿼리 문장을 볼 수 있다 | 문장이 지표로 나가지 않는지 `/metrics` 로 확인한다. 역할에 쓰기 권한은 없다 |
| 관리 서버 자원 | 10m · 32Mi 요청. 적용 뒤 노드 예약을 본다 |

## 검증 방법

- **A**
  - exporter Pod Ready, Prometheus 수집 대상 `up`
  - 기사 표 통째 읽기 지표가 bench 요청에 따라 는다
  - 대시보드 패널 여섯에 모두 데이터가 있다
  - Loki 패널 값이 `results.md` 의 11-11 값과 같은 LogQL · 같은 창에서 맞는다
  - 사이트 A7 · A1 · A13 · A2 가 200
  - DB 로그 · Loki 에서 make-secret 시각 앞뒤로 `PASSWORD` 문장이 없다
- **B**
  - 로컬 backend 린트 · 시험(`.claude/stack.md` §3). 새 시험은 V14 없이 빨간불, V14 를 넣으면 초록불
  - 운영 EXPLAIN 이 A7 · A1 · A13 에서 Index Scan · Index Only Scan 으로 바뀌고 읽은 블록이 준다. A2 · A6 은 나빠지지 않는다
  - bench p50 · p95 가 A7 · A1 · A13 에서 내려간다
  - DB 통계: article 의 통째 읽기가 늘지 않는다
- MR 마다 reviewer 조수, 끝나면 `/verify` · `/feature-done`

## 되돌리는 법

- **A** — `kubectl delete -k infra/k8s/bootstrap/pg-exporter` → Secret `postgres-exporter` 삭제 → `DROP ROLE newlearn_monitor` → netpol 항목을 빼는 MR. 서비스에는 영향이 없다
- **B** — 인덱스만 지우면 원래대로다
  - 사람이 EC2 에서 `DROP INDEX article_public_published_idx, article_public_category_published_idx;` 를 친다
  - V15 로 `drop index if exists` 를 넣어 기록을 맞춘다. `if exists` 가 없으면 이미 지운 뒤라 V15 가 실패해 그 뒤 배포가 막힌다
  - 옛 backend 이미지로 되돌려도 뜬다. Spring Boot 4.1.1 의 Flyway 기본값이 적용됐지만 코드에 없는 앞 판을 무시하기 때문이다(`ignore-migration-patterns` = `*:future`, reviewer 확인). 우리 설정에는 flyway 항목이 없다

## 계획에서 바뀐 것 (reviewer 검토 반영)

- 인덱스를 적재 뒤가 아니라 **적재 전**에 넣는다. 15분 수집이 적재 직후부터 돌아서다. 사용자 결정
- exporter 비밀번호를 평문 대신 SCRAM 값으로 보내고 세션 문장 기록을 끈다. 오류가 나면 문장이 DB 로그 → Loki 로 남기 때문이다
- 되돌리는 V15 를 `drop index if exists` 로 쓴다
- explain.sql 을 실제 SQL 로 바꾼다. A1 이슈 수 · A2 · A6 · 드문 검색어 · DB 통계를 더한다
- A13 대응을 「인덱스를 지운다」에서 「trigram 따로」로 바꿨다. 첫째 인덱스는 A7 도 쓴다
- 검색 스펙 · 주석을 바꿀 파일에 더했다. 인덱스 정의 시험을 더했다
- Grafana 주석을 Loki 쿼리로 바꿨다. 손으로 찍은 주석은 Grafana 가 다시 뜨면 사라진다
- 「더 보기」 중복 제거는 따로 뺐다(한 번에 작업 하나)
- 팀 문서에서 이 PC 경로와 앱 안 링크를 뺐다. 결과는 `infra/server/perf/results.md` 에 둔다

## 구현하며 바뀐 것 (11-11)

- V14 첫째 인덱스에 `include (press_code)` 를 더했다. A2 이슈 카드의 언론사 수까지 표 없이 센다(B0 결과, 로컬 후보 비교)
- A2 쪽 인덱스(`event.issue_id` · `article_event.event_id`)는 더하지 않는다. 그 표들은 작고, 느린 까닭은 기사 표 통째 읽기였다(B0)
- explain.sql 의 SQL 을 운영 `pg_stat_activity` 에서 받은 실제 문장으로 바꿨다. A7 · A6 은 본문까지 읽는 Hibernate 문장이다
- 운영 DB 설정은 `shared_buffers` 128MB · `effective_cache_size` 4GB 다(`SHOW`). 한때 160MB 로 잘못 읽었다(`pg_settings` 의 숫자와 단위 8kB 를 이어 읽음)
- exporter 는 다시 띄울 때 옛 Pod 를 먼저 내린다(`Recreate`) — Pod 하나가 DB 연결을 2개 쓰고 역할 상한이 3이다
- `stats.sql` 은 표를 읽는 쿼리를 두지 않는다. 행 수는 explain.sql 첫머리로 옮겼다 — 두 번 찍은 차이에 자기 몫이 섞이지 않게
- V14 를 11-12 오전이 아니라 11-11 10:47 에 넣었다. 그날 매일 수집(10:11)과 AI 결과 다시 적재(10:16, 최종 적재와 다른 마인드맵 채움 판)가 끝났고, 15분 수집 전환은 11/12 최종 적재 뒤라서다(사용자). 직전 측정은 다시 적재와 겹친 10:14 판을 버리고 10:23 에 다시 쟀다
