# A2 이슈 목록 · A1 분야 수 — DB 가 하는 일 줄이기 (2026-11-12, Jira S15P31A102-194)

## 무엇을 / 왜

단계 부하 시험(Jira 193)에서 사이트가 초당 약 90건에 포화했고 먼저 막힌 곳은 DB CPU 였다. 오늘 운영 EXPLAIN ANALYZE(읽기만, `C:/tmp/193-steps/data/explain-a2-a1.out`)로 보니 원인은 「인덱스 하나 없음」보다 넓다.

- A2 이슈 목록 `GET /api/v1/issues` · A1 분야 수 `GET /api/v1/categories` 의 쿼리마다 공개 기사 12,716 × `article_event` 12,717 × 사건 825 를 통째로 해시 조인해 이슈 162개로 집계한 뒤 3 ~ 5개만 자른다. `article_event` 통째 읽기 자체는 쿼리당 1.3 ~ 2ms 다
- 쿼리 블록의 약 9할은 공개 기사 인덱스 읽기다(`Heap Fetches 3,267` · 4,589블록). VACUUM 이 이 몫을 줄인다
- 분야 없는 A2 한 번 ≈ 개수 23ms + 목록 60ms + 최근 사건 14ms. 목록은 집계 **앞** 11,327행(이슈 제목 · 요약을 단 채)을 정렬하다 work_mem 4MB 를 넘겨 **디스크로 7.4MB** 를 쓴다. 집계 뒤 162행 정렬은 메모리 31kB 로 끝난다
- 최근 사건(이슈 다섯의 사건 17개)도 전체를 엮는다 — `article_event.event_id` · `event.issue_id` 인덱스가 없어서다

두 가지를 고친다. (1) 인덱스 둘(V15)로 사건 · 이슈 몇 개만 보는 쿼리가 전체를 엮지 않게, (2) A2 목록 쿼리를 「issue 칸 없이 `e.issue_id` 로 먼저 집계 → issue 를 붙임 → 정렬 · 자르기는 바깥에서 한 번」 모양으로 바꿔 집계 앞 정렬이 좁아지게. 각각 로컬 · 운영 EXPLAIN 으로 효과가 보일 때만 넣는다. VACUUM 은 효과를 가르려고 개선 전 재기 **앞**에 둔다.

## 작업 순서

- [x] **0. 준비** — Jira 새 티켓(「[BE] A2 이슈 목록 · A1 분야 수 DB 일 줄이기 — 사건 인덱스 V15 · 목록 쿼리」, 스토리 포인트 3), dev 에서 새 worktree `C:/tmp/wt-<번호>`. 이 계획을 그 안 `docs/plans/` 로 옮긴다. 워커 CPU 크레딧(Lightsail 버스트 용량)을 읽는 법을 확인한다 — 못 읽으면 재기마다 사람이 콘솔에서 읽는다
- [x] **1. 후보 견주기 (운영 변경 없음)** — 11-11 로컬 시험 DB `perf-pg`(운영 작은 표 그대로, 같은 메모리 설정)를 다시 띄워 V14 상태를 맞춘 뒤 넷을 견준다: 지금 · 인덱스 둘 · 목록 쿼리만 · 둘 다
  - 쿼리(인덱스를 탈 수 있는 것 전부): A2 개수 · 목록(분야 없음 5 · createdAt 3 · politics 3 · 분야 50) · 최근 사건(`findLastEvents`) · 카테고리(`findCategories`), A1 이슈 수, A3 이슈 머리(`findHeader`), A4 타임라인(`EventRepository` 16행 · `findEventCounts`), A5 사건 패널(`EventRepository` 25 · 33행, `ArticleEventRepository` 14 · 18행), A6 사건 관련 기사(`ArticleRepository` 34행 — V14 때 12.6 → 17.3ms 로 나빠진 선례), A25 관심 이슈(`findCardsByIds`), A13 통합 검색의 사건 · 이슈, 분석 쪽 `CandidateEventFinder` 38 · 58행 · `IssueCandidateFinder` 82 ~ 103행
  - 새 목록 SQL 은 운영에서도 EXPLAIN ANALYZE 하고 옛 SQL 과 결과를 비교한다(읽기만): 정렬 2 × (분야 없음 + 5개 분야) × 크기 3 · 5 · 20 · 50 의 모든 쪽(마지막 반쪽 · 끝 너머 쪽 포함), 행마다 `row_number` 를 붙여 양쪽 `except all` 이 비고, 모든 쪽 행 수 합이 개수 SQL 의 total 과 같아야 한다
  - 넣는 기준: 인덱스는 위 쿼리 중 하나라도 읽은 블록이 줄고 나빠지는 쿼리가 없을 때. 목록 쿼리는 디스크 정렬이 사라지고 운영 비교가 모두 같을 때. 기준을 못 넘은 쪽은 빼고 계획의 「구현하며 바뀐 것」에 적는다
- [ ] **2. 측정 스크립트** — `explain.sql` 에 A2 목록(분야 없음 5) **옛 SQL · 새 SQL 둘 다**(이름표로 구분), 최근 사건, A3 머리를 더한다. 개선 전 · 후에 같은 파일을 돌리고, 배포 뒤에는 `pg_stat_activity` 에서 앱이 실제로 보내는 목록 SQL 이 새 SQL 과 같은지 본다(README 「쿼리 출처」). `bench.py` 에 A3 을, `stats.sql` 에 새 인덱스의 `idx_scan`(`pg_stat_user_indexes`)을 더한다 — bench 앞뒤 차이로 앱(일반 계획 포함)이 인덱스를 실제로 쓰는지 본다
- [ ] **3. backend MR** (backend 브랜치로, **152 최종 적재가 끝나기 전에는 머지하지 않는다** — backend 브랜치는 BE 팀원과 같이 써서 머지되면 누구의 다음 배포에든 V15 가 실린다)
  - 먼저 둘 시험
    - 새 시험: V15 인덱스 둘의 `pg_indexes.indexdef` (V14 의 `ArticlePublicIndexSchemaTest` 방식) — V15 없이 빨강
    - `InterestIssueSchemaTest` 버전 목록에 "15"
    - 새 시험: 이슈 밖(issue_id 가 빈) 공개 사건이 가장 최근일 때 size=1 lastEventAt 첫 카드가 진짜 이슈다. 운영에 이런 사건이 있다(집계 163묶음, 이슈 밖 공개 기사 1,389건). 옛 SQL 에서 초록, 빈 묶음이 칸을 먹는 잘못된 모양(자른 뒤 붙이기)에서 빨강인지 되돌림 확인
  - 목록 쿼리를 지키는 지금 시험: `CategoryIssueQueryTest`(동점 · createdAt · 분야 · 끝 너머 쪽 total), `CategoryIssueApiIntegrationTest`(createdAt size 1), `IssueTimelineQueryTest` 54 ~ 58행(목록 카드 = 머리 카드), `HiddenIssueEventApiIntegrationTest`(숨긴 이슈)
  - `V15__event_issue_indexes.sql`: 머리에 `set local lock_timeout` (적재 · 분석이 표를 잡고 있으면 기다리며 사건 쓰기를 막지 않고 실패 → 새 파드만 못 뜨고 옛 파드가 계속 받음), `create index ... on article_event (event_id)` · `create index ... on event (issue_id)`. concurrently 없이(1만 행대라 순간)
  - `IssueQueryRepository.findCards` 의 목록 SQL 만 바꾼다: issue 칸 없이 `e.issue_id` 로 집계(빈 issue_id 빼기), 그 결과에 issue 를 inner join, 정렬(createdAt 은 issue 칸) · limit · offset 은 바깥에서 한 번. 개수 SQL · `findHeader` · `findCardsByIds` 의 `AGGREGATE` 는 그대로
- [ ] **4. infra MR** (infra 브랜치로, backend MR 머지 **앞**) — `classified-load.sql` 판 검사에 15 를 더하고(인덱스만 더한 판이라 적재 SQL 은 그대로 맞음) `data-load.md` 193행 「판(13 또는 14 …)」도 같이, explain · bench · stats 스크립트. 판 검사는 Jira 152 세션이 쓰는 파일이라 그쪽에 먼저 알리고 152 최종 적재가 끝난 뒤 머지하고, 서버 사본(`~/infra/server/`)까지 바꾼다 — 배포 뒤에 적재를 다시 해야 할 때 막히지 않게
- [ ] **5. VACUUM → 개선 전 재기** — 152 최종 다시 적재 · !818(15분 수집) 전환이 끝난 데이터에서
  - 사람이 `VACUUM (ANALYZE) article, article_event, event;` (오늘 적재로 생긴 Heap Fetches 를 개선 전부터 없애 효과를 가르려고)
  - `stats.sql` → `bench.py before` → `stats.sql` → `explain.sql`, 그리고 `load.py`(사람, 관리 서버 tmux)
  - 재는 조건: 15분 수집은 :00 · :15 · :30 · :45(`news-ingest.yaml` `*/15`) — 그 회차 잡이 끝났고 `analysis_job` QUEUED 가 0 인 것을 보고 시작, 재는 동안 회차가 돌았는지 기록
  - 재기마다 같이 적는다: 공개 기사 · `article_event` · 사건 · 이슈 수, Heap Fetches · `n_dead_tup` · `last_autovacuum`, 워커 CPU 크레딧
- [ ] **6. 배포** — backend MR 머지 → backend → dev → 이미지 → 배포 태그 MR, 늘 하던 길. 수집 회차 사이(위 조건)에. backend 가 뜰 때 Flyway 가 V15 를 적용한다
- [ ] **7. 개선 후 재기 · 기록** — 5와 같은 순서 · 같은 조건 기록(VACUUM 은 V15 뒤 `ANALYZE article_event, event;` 만). `load-results.md` · `results.md` 에 전 · 후 표와 「남는 것」(A2 개수 SQL 23ms 는 그대로 남는 큰 몫), SSOT 10절 한 줄, `docs/data-model.md` 인덱스 줄, Jira 댓글 · 완료, 분야 브랜치 맞추기. 대시보드 「조회 성능」 캡처

## 바꿀 파일

- `backend/src/main/resources/db/migration/V15__event_issue_indexes.sql` — 새 인덱스 둘
- `backend/src/test/java/kr/io/newlearn/EventIssueIndexSchemaTest.java` — 새 시험
- `backend/src/test/java/kr/io/newlearn/InterestIssueSchemaTest.java` — 버전 목록 +15
- `backend/src/main/java/kr/io/newlearn/issue/IssueQueryRepository.java` — `findCards` 목록 SQL
- `backend/src/test/java/kr/io/newlearn/CategoryIssueQueryTest.java`(또는 픽스처) — 이슈 밖 공개 사건 시험
- `infra/server/perf/explain.sql` · `bench.py` · `stats.sql` · `README.md` — 측정 항목 더함
- `infra/server/classified-load.sql` · `infra/server/data-load.md` — 판 13 · 14 · 15 (152 적재 뒤)
- `infra/server/perf/load-results.md` · `results.md` · `SSOT.md` 10절 · `docs/data-model.md` 인덱스 줄 — 전 · 후 값과 사실
- `docs/plans/2026-11-12-issue-list-query.md` — 이 계획

## 안 바꿀 것

- API 응답 · 정렬 규칙 · 「공개 기사가 있는 것만」 규칙(`PublicEventSql`). 숫자 하나도 달라지지 않아야 한다
- A2 개수 SQL · A3 `findHeader` · 관심 이슈 `findCardsByIds` 의 SQL(인덱스 효과만 받는다)
- postgres 설정(work_mem 4MB 그대로), 캐시 도입, 이슈 수를 미리 세어 두는 표
- 이미 적용된 V1 ~ V14, AI 워커 · 수집 배치 코드
- 152 최종 적재 · !818 머지 순서 — 이 일은 그 뒤에 머지 · 배포한다

## 리스크

| 리스크 | 대응 |
|---|---|
| V15 가 152 최종 적재보다 먼저 운영에 실린다(남의 배포에 실리는 길 포함) | backend MR 을 적재가 끝난 뒤에 머지하고, 그 앞에 판 검사 15 허용을 서버 사본까지 넣는다. 그래도 걸리면 첫 단계 예외로 트랜잭션이 통째로 되돌아가 데이터는 그대로다 |
| 목록 쿼리를 바꾸다 결과(이슈 밖 사건 묶음 · 동점 · createdAt · total)가 달라진다 | 이슈 밖 사건 시험을 먼저 두고, 지금 시험 넷, 운영 옛 · 새 SQL 전체 쪽 비교를 모두 통과할 때만 넣는다 |
| 인덱스가 다른 쿼리를 느리게 한다(V14 의 A6 선례) | 1단계에서 인덱스를 탈 수 있는 화면 · 분석 쿼리를 전부 견주고, 나빠지면 빼거나 기록한다 |
| 플래너가 인덱스를 안 고른다(작은 표) | 그러면 인덱스는 빼고 기록한다. 앱의 일반 계획은 `idx_scan` · bench · load 로 본다 |
| V15 가 표 잠금을 기다리며 사건 쓰기를 막는다 | `lock_timeout` 으로 기다리지 않고 실패 → 옛 파드가 계속 받고, 회차 사이에 다시 배포한다 |
| VACUUM · 데이터 변화 · CPU 크레딧이 개선 효과처럼 보인다 | VACUUM 은 개선 전 앞에, 재기마다 데이터 수 · Heap Fetches · 크레딧을 같이 적는다 |
| load.py 가 운영을 몇 분 포화시킨다 | 지킴이 멈춤 규칙 그대로(p95 · 5xx · health · CPU), 회차 잡 · 분석이 끝난 뒤에 |

## 어떻게 검증하나

- 로컬 backend 린트 · 시험(`.claude/stack.md` §3). 새 인덱스 시험은 V15 없이 빨강 · 넣으면 초록. 이슈 밖 사건 시험은 잘못된 모양(자른 뒤 붙이기)에서 빨강 · 새 SQL 에서 초록(되돌림 확인)
- 1단계 로컬 비교표(후보 넷 × 쿼리, 읽은 블록 · 시간 · 계획 모양)와 운영 옛 · 새 목록 SQL 전체 쪽 비교(`except all` 빔 · 쪽 합 = total)
- 운영 개선 후 explain.sql: 새 목록 SQL 에 `external merge` 가 없다, 최근 사건 · A3 · A4 · A5 가 인덱스로 사건 몇 개만 읽는다, A6 를 포함한 다른 쿼리가 나빠지지 않는다. `pg_stat_activity` 의 앱 SQL 이 새 SQL 이다
- `stats.sql`: bench 동안 새 인덱스 `idx_scan` 이 늘고 `article_event` · `event` 통째 읽기가 준다
- bench.py: A2 · A3 p50 · p95 가 내려가고 나머지는 그대로(A1 은 VACUUM 을 앞에 둬서 이번 변경 몫만 보인다)
- load.py 같은 단계: 포화 처리량 · 그때 postgres CPU · `article_event` 통째 읽기를 개선 전과 같은 표로, 조건(데이터 수 · 크레딧 · 회차) 같이
- 사이트에서 A2 · A1 · A3 · A4 · A13 이 200 이고 숫자가 배포 전과 같다
- MR 마다 reviewer 조수, 끝나면 `/verify` · `/feature-done`

## 되돌리는 법

- 목록 쿼리 — backend MR 되돌리기, 또는 옛 이미지로 배포 태그를 되돌린다. V15 가 남아도 옛 코드는 그대로 돈다
- 인덱스 — 사람이 EC2 에서 `SET lock_timeout = '5s'; DROP INDEX <둘>;` → 기록을 맞추는 V16 을 `drop index if exists` 로 넣는다(11-11 계획과 같은 방식). 이때 판 검사에 16 을 더하고 `EventIssueIndexSchemaTest` 를 「V16 뒤 없음」으로 고친다. 옛 이미지는 앞선 판을 무시하고 뜬다(Spring Boot 4.1.1 Flyway 기본값, 11-11 reviewer 확인)
- 판 검사 — 받는 판을 더하기만 하므로 되돌리지 않아도 된다(되돌리면 V15 뒤 적재가 막힌다)
- 데이터를 고치는 단계가 없다. 모두 되돌릴 수 있다

## 계획에서 바뀐 것 (reviewer 검토 반영)

- 목록 쿼리 모양: 「이슈별로 세고 **자른 뒤** 붙이기」 → 「`e.issue_id` 로 집계하고 issue 를 붙인 **뒤** 정렬 · 자르기」. 앞 모양은 이슈 밖 사건이 한 칸을 먹고(운영 163묶음), createdAt 은 issue 칸이라 미리 못 자른다. 디스크로 넘친 것은 집계 앞 정렬뿐이라 뒤 모양으로 충분하다. 이를 잡는 시험이 없어 먼저 더한다
- 수집 회차 시각: :12 · :27 · :42 · :57(머지 시각) → 실제 회차 :00 · :15 · :30 · :45, 「피한다」 대신 잡 끝 · QUEUED 0 확인과 기록
- VACUUM 을 개선 전 재기 앞으로 옮김 — 블록 9할이 Heap Fetches 라 그대로 두면 A1 · A2 개수 · A13 까지 빨라져 효과를 못 가른다
- 1단계 비교 쿼리에 A4 · A5 · A6 · A25 · 분석 쪽 쿼리를 더함(V14 의 A6 선례)
- backend MR 머지를 152 적재 뒤로 못 박고, 판 검사 15 허용(서버 사본 포함)을 그 앞에 둠
- explain.sql 에 옛 · 새 목록 SQL 을 둘 다, bench.py 에 A3, stats.sql 에 `idx_scan`
- V15 와 수동 DROP 에 `lock_timeout`, 바꿀 파일에 `docs/data-model.md` · `data-load.md`, 되돌리는 V16 의 판 검사 · 시험, 재기마다 데이터 수 · 크레딧, 결과의 「남는 것」(A2 개수 23ms)

## 구현하며 바뀐 것 (11-12)

- **1단계 결과 — 둘 다 넣는다.** 원자료 `C:/tmp/194-steps/`(`compare-table.md` · `local-*.txt` · `prod-*.txt`), 같은 파일을 저장소 `infra/server/perf/explain-events.sql` · `list-equal.sql` 로 옮김
  - 목록 쿼리: 운영(읽기만)에서 디스크 정렬이 사라지고 분야 없음 5장 54.2 → 27.0ms, createdAt 3장 47.4 → 24.0ms, politics 3장 22.5 → 14.5ms, 분야 50장 20.5 → 10.8ms. 운영 · 로컬 모두 472쪽 다른 쪽 0 · total 이 안 맞는 조합 0(2,592행). 일부러 틀린 SQL(이슈 밖 묶음을 남김)은 110쪽에서 「다름」으로 잡혀 비교가 틀린 것을 잡는 것도 확인
  - 인덱스(로컬, 운영과 같은 V14 상태 · 같은 메모리 설정): A5 앞 사건 256 → 33블록 · 4.08 → 0.07ms, A3 머리 191 → 163블록, A4 타임라인 188 → 160블록, 최근 사건 188 → 165블록, A5 공개 기사 수 · A6 개수 151 → 94블록, 분석 사건별 첫 기사 81 → 68블록. A25 관심 이슈(192 → 249블록) · A4 사건별 수(218 → 244블록)는 같은 인덱스 페이지를 되풀이해 읽어 블록은 늘었지만 시간은 1.83 → 1.23ms · 1.97 → 1.10ms 로 줄었다 — 「나빠짐」으로 보지 않는다. 다른 쿼리는 계획 모양이 같다
  - **남는 것**: A2 개수 · A1 이슈 수 · A13 사건 · 이슈는 인덱스가 있어도 계획이 그대로다(EXISTS 가 이슈마다 멈추는 반복으로 바뀌지 않음) — 공개 기사 · 연결 · 사건을 통째로 엮는다
  - 임베딩 표가 로컬에 없어 분석의 거리 쿼리(`CandidateEventFinder.nearest` · `IssueCandidateFinder.find`)는 견주지 못했다. 둘 다 모든 사건의 임베딩을 훑는 모양이라 event_id 로 몇 개만 찾는 쿼리가 아니다
- **운영 블록 수의 9할은 VACUUM 뒤 새로 들어온 기사 때문이다(새로 안 것).** 운영 쿼리마다 4,600 ~ 9,200블록, 같은 계획의 로컬은 150 ~ 250블록이다. 차이는 공개 기사 인덱스만 읽기의 Heap Fetches(3,267)다
  - 원인: 11-11 10:48 VACUUM 뒤 들어온 12,422건(오늘 10:00 수집)이 빈자리를 따라 5,719페이지(5 ~ 20,999번)에 흩어졌고, 그 페이지에 있던 공개 기사가 3,262건이다 — Heap Fetches 와 거의 같다(운영 읽기 쿼리로 확인)
  - 자동 VACUUM 은 넣은 행이 1,000 + 0.2 × 15만 ≈ 3만 2천 건이 돼야 돈다(`autovacuum_vacuum_insert_*` 기본값). 15분 수집으로 바꾸면 그때까지 이 몫이 쌓인다
  - 이 계획의 범위 밖이다(안 바꿀 것: postgres 설정). 기사 표만 자동 VACUUM 기준을 낮추는 안은 따로 승인받는다
- 측정 스크립트: explain.sql 에 더하는 대신 `explain-events.sql`(26개) · `list-equal.sql` 을 따로 둔다 — 11-11 의 15개 표와 견줄 수 있게. bench.py 는 A3 에 더해 A4 · A5 도(이슈 id 를 셋째 인자로)
- `docs/data-model.md` 는 article_event 절에 인덱스 줄을 넣는다(V14 때와 같은 자리 방식)
