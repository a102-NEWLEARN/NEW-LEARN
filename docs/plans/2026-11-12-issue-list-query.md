# A2 이슈 목록 · A1 분야 수 — DB 가 하는 일 줄이기 (2026-11-12, Jira S15P31A102-194)

## 무엇을 / 왜

단계 부하 시험(Jira 193)에서 사이트가 초당 약 90건에 포화했고 먼저 막힌 곳은 DB CPU 였다. 오늘 운영 EXPLAIN ANALYZE(읽기만, `C:/tmp/193-steps/data/explain-a2-a1.out`)로 보니 원인은 「인덱스 하나 없음」보다 넓다.

- A2 이슈 목록 `GET /api/v1/issues` · A1 분야 수 `GET /api/v1/categories` 의 쿼리마다 공개 기사 12,716 × `article_event` 12,717 × 사건 825 를 통째로 해시 조인해 이슈 162개로 집계한 뒤 3 ~ 5개만 자른다. `article_event` 통째 읽기 자체는 쿼리당 1.3 ~ 2ms 다
- A1 기사 수 쿼리는 4,589블록 중 Heap Fetches 3,267(약 7할)로, 공개 기사 인덱스만 읽기가 표를 다시 본 몫이 컸다. VACUUM 이 이 몫을 줄인다
- 분야 없는 A2 한 번 ≈ 개수 23ms + 목록 60ms + 최근 사건 14ms. 목록은 집계 **앞** 11,327행(이슈 제목 · 요약을 단 채)을 정렬하다 work_mem 4MB 를 넘겨 **디스크로 7.4MB** 를 쓴다. 집계 뒤 162행 정렬은 메모리 31kB 로 끝난다
- 최근 사건(이슈 다섯의 사건 17개)도 전체를 엮는다 — `article_event.event_id` · `event.issue_id` 인덱스가 없어서다

두 가지를 고친다. (1) 인덱스 둘(V15)로 사건 · 이슈 몇 개만 보는 쿼리가 전체를 엮지 않게, (2) A2 목록 쿼리를 「issue 칸 없이 `e.issue_id` 로 먼저 집계 → issue 를 붙임 → 정렬 · 자르기는 바깥에서 한 번」 모양으로 바꿔 집계 앞 정렬이 좁아지게. 각각 로컬 · 운영 EXPLAIN 으로 효과가 보일 때만 넣는다. VACUUM 은 효과를 가르려고 개선 전 재기 **앞**에 둔다.

## 작업 순서

- [x] **0. 준비** — Jira 새 티켓(「[BE] A2 이슈 목록 · A1 분야 수 DB 일 줄이기 — 사건 인덱스 V15 · 목록 쿼리」, 스토리 포인트 3), dev 에서 새 worktree `C:/tmp/wt-<번호>`. 이 계획을 그 안 `docs/plans/` 로 옮긴다. 워커 CPU 크레딧(Lightsail 버스트 용량)을 읽는 법을 확인한다 — 못 읽으면 재기마다 사람이 콘솔에서 읽는다
- [x] **1. 후보 견주기 (운영 변경 없음)** — 11-11 로컬 시험 DB `perf-pg`(운영 작은 표 그대로, 같은 메모리 설정)를 다시 띄워 V14 상태를 맞춘 뒤 넷을 견준다: 지금 · 인덱스 둘 · 목록 쿼리만 · 둘 다
  - 쿼리(인덱스를 탈 수 있는 것 전부): A2 개수 · 목록(분야 없음 5 · createdAt 3 · politics 3 · 분야 50) · 최근 사건(`findLastEvents`) · 카테고리(`findCategories`), A1 이슈 수, A3 이슈 머리(`findHeader`), A4 타임라인(`EventRepository` 16행 · `findEventCounts`), A5 사건 패널(`EventRepository` 25 · 33행, `ArticleEventRepository` 14 · 18행), A6 사건 관련 기사(`ArticleRepository` 34행 — V14 때 12.6 → 17.3ms 로 나빠진 선례), A25 관심 이슈(`findCardsByIds`), A13 통합 검색의 사건 · 이슈, 분석 쪽 `CandidateEventFinder` 38 · 58행 · `IssueCandidateFinder` 82 ~ 103행
  - 새 목록 SQL 은 운영에서도 EXPLAIN ANALYZE 하고 옛 SQL 과 결과를 비교한다(읽기만): 정렬 2 × (분야 없음 + 5개 분야) × 크기 3 · 5 · 20 · 50 의 모든 쪽(마지막 반쪽 · 끝 너머 쪽 포함), 행마다 `row_number` 를 붙여 양쪽 `except all` 이 비고, 모든 쪽 행 수 합이 개수 SQL 의 total 과 같아야 한다
  - 넣는 기준: 인덱스는 위 쿼리 중 하나라도 읽은 블록이 줄고 나빠지는 쿼리가 없을 때. 목록 쿼리는 디스크 정렬이 사라지고 운영 비교가 모두 같을 때. 기준을 못 넘은 쪽은 빼고 계획의 「구현하며 바뀐 것」에 적는다
- [x] **2. 측정 스크립트** — `explain.sql` 에 A2 목록(분야 없음 5) **옛 SQL · 새 SQL 둘 다**(이름표로 구분), 최근 사건, A3 머리를 더한다. 개선 전 · 후에 같은 파일을 돌리고, 배포 뒤에는 `pg_stat_activity` 에서 앱이 실제로 보내는 목록 SQL 이 새 SQL 과 같은지 본다(README 「쿼리 출처」). `bench.py` 에 A3 을, `stats.sql` 에 새 인덱스의 `idx_scan`(`pg_stat_user_indexes`)을 더한다 — bench 앞뒤 차이로 앱(일반 계획 포함)이 인덱스를 실제로 쓰는지 본다
- [x] **3. backend MR** (backend 브랜치로, **152 최종 적재가 끝나기 전에는 머지하지 않는다** — backend 브랜치는 BE 팀원과 같이 써서 머지되면 누구의 다음 배포에든 V15 가 실린다)
  - 먼저 둘 시험
    - 새 시험: V15 인덱스 둘의 `pg_indexes.indexdef` (V14 의 `ArticlePublicIndexSchemaTest` 방식) — V15 없이 빨강
    - `InterestIssueSchemaTest` 버전 목록에 "15"
    - 새 시험: 이슈 밖(issue_id 가 빈) 공개 사건이 가장 최근일 때 size=1 lastEventAt 첫 카드가 진짜 이슈다. 운영에 이런 사건이 있다(집계 163묶음, 이슈 밖 공개 기사 1,389건). 옛 SQL 에서 초록, 빈 묶음이 칸을 먹는 잘못된 모양(자른 뒤 붙이기)에서 빨강인지 되돌림 확인
  - 목록 쿼리를 지키는 지금 시험: `CategoryIssueQueryTest`(동점 · createdAt · 분야 · 끝 너머 쪽 total), `CategoryIssueApiIntegrationTest`(createdAt size 1), `IssueTimelineQueryTest` 54 ~ 58행(목록 카드 = 머리 카드), `HiddenIssueEventApiIntegrationTest`(숨긴 이슈)
  - `V15__event_issue_indexes_article_autovacuum.sql`(처음 이름 `V15__event_issue_indexes.sql`, 기사 표 자동 VACUUM 기준은 아래 「계획에 더한 것」): 머리에 `set local lock_timeout` (적재 · 분석이 표를 잡고 있으면 기다리며 사건 쓰기를 막지 않고 실패 → 새 파드만 못 뜨고 옛 파드가 계속 받음), `create index ... on article_event (event_id)` · `create index ... on event (issue_id)`. concurrently 없이(1만 행대라 순간)
  - `IssueQueryRepository.findCards` 의 목록 SQL 만 바꾼다: issue 칸 없이 `e.issue_id` 로 집계(빈 issue_id 빼기), 그 결과에 issue 를 inner join, 정렬(createdAt 은 issue 칸) · limit · offset 은 바깥에서 한 번. 개수 SQL · `findHeader` · `findCardsByIds` 의 `AGGREGATE` 는 그대로
- [x] **4. infra MR** (infra 브랜치로, backend MR 머지 **앞**) — `classified-load.sql` 판 검사에 15 를 더하고(인덱스만 더한 판이라 적재 SQL 은 그대로 맞음) `data-load.md` 193행 「판(13 또는 14 …)」도 같이, explain · bench · stats 스크립트. 판 검사는 Jira 152 세션이 쓰는 파일이라 그쪽에 먼저 알리고 152 최종 적재가 끝난 뒤 머지하고, 서버 사본(`~/infra/server/`)까지 바꾼다 — 배포 뒤에 적재를 다시 해야 할 때 막히지 않게
- [x] **5. VACUUM → 개선 전 재기** — 152 최종 다시 적재 · !818(15분 수집) 전환이 끝난 데이터에서
  - 사람이 `VACUUM (ANALYZE) article, article_event, event;` (오늘 적재로 생긴 Heap Fetches 를 개선 전부터 없애 효과를 가르려고)
  - `stats.sql` → `bench.py before` → `stats.sql` → `explain.sql`, 그리고 `load.py`(사람, 관리 서버 tmux)
  - 재는 조건: 15분 수집은 :00 · :15 · :30 · :45(`news-ingest.yaml` `*/15`) — 그 회차 잡이 끝났고 `analysis_job` QUEUED 가 0 인 것을 보고 시작, 재는 동안 회차가 돌았는지 기록
  - 재기마다 같이 적는다: 공개 기사 · `article_event` · 사건 · 이슈 수, Heap Fetches · `n_dead_tup` · `last_autovacuum`, 워커 CPU 크레딧
- [x] **6. 배포** — backend MR 머지 → backend → dev → 이미지 → 배포 태그 MR, 늘 하던 길. 수집 회차 사이(위 조건)에. backend 가 뜰 때 Flyway 가 V15 를 적용한다
- [x] **7. 개선 후 재기 · 기록** — 5와 같은 순서 · 같은 조건 기록(VACUUM 은 V15 뒤 `ANALYZE article_event, event;` 만). `load-results.md` · `results.md` 에 전 · 후 표와 「남는 것」(A2 개수 SQL 23ms 는 그대로 남는 큰 몫), SSOT 10절 한 줄, `docs/data-model.md` 인덱스 줄, Jira 댓글 · 완료, 분야 브랜치 맞추기. 대시보드 「조회 성능」 캡처

## 바꿀 파일

- `backend/src/main/resources/db/migration/V15__event_issue_indexes_article_autovacuum.sql` — 새 인덱스 둘 · 기사 표 자동 VACUUM 기준
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
- postgres 전체 설정(work_mem 4MB 그대로), 캐시 도입, 이슈 수를 미리 세어 두는 표. 기사 표 하나의 자동 VACUUM 기준만 아래 「계획에 더한 것」으로 바꾼다
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
- VACUUM 을 개선 전 재기 앞으로 옮김 — 블록의 7할 넘게(A1 기사 수 4,589 중 3,267)가 Heap Fetches 라 그대로 두면 A1 · A2 개수 · A13 까지 빨라져 효과를 못 가른다
- 1단계 비교 쿼리에 A4 · A5 · A6 · A25 · 분석 쪽 쿼리를 더함(V14 의 A6 선례)
- backend MR 머지를 152 적재 뒤로 못 박고, 판 검사 15 허용(서버 사본 포함)을 그 앞에 둠
- explain.sql 에 옛 · 새 목록 SQL 을 둘 다, bench.py 에 A3, stats.sql 에 `idx_scan`
- V15 와 수동 DROP 에 `lock_timeout`, 바꿀 파일에 `docs/data-model.md` · `data-load.md`, 되돌리는 V16 의 판 검사 · 시험, 재기마다 데이터 수 · 크레딧, 결과의 「남는 것」(A2 개수 23ms)

## 구현하며 바뀐 것 (11-12)

- **1단계 결과 — 둘 다 넣는다.** 원자료 `C:/tmp/194-steps/`(`compare-table.md` · `local-*.txt` · `prod-*.txt`), 같은 파일을 저장소 `infra/server/perf/explain-events.sql` · `list-equal.sql` 로 옮김
  - 목록 쿼리: 운영(읽기만)에서 디스크 정렬이 사라지고 분야 없음 5장 54.2 → 27.0ms, createdAt 3장 47.4 → 24.0ms, politics 3장 22.5 → 14.5ms, 분야 50장 20.5 → 10.8ms. 운영 · 로컬 모두 472쪽 다른 쪽 0 · total 이 안 맞는 조합 0(2,592행). 로컬 시험 DB 에서 일부러 틀린 SQL(이슈 밖 묶음을 남김)은 「다름」 110줄(다른 쪽과 total 이 안 맞는 조합을 합친 수)로 잡혀 비교가 틀린 것을 잡는 것도 확인
  - 인덱스(로컬, 운영과 같은 V14 상태 · 같은 메모리 설정): A5 앞 사건 256 → 33블록 · 4.08 → 0.07ms, A3 머리 191 → 163블록, A4 타임라인 188 → 160블록, 최근 사건 188 → 165블록, A5 공개 기사 수 · A6 개수 151 → 94블록, 분석 사건별 첫 기사 81 → 68블록. A25 관심 이슈(192 → 249블록) · A4 사건별 수(218 → 244블록)는 같은 인덱스 페이지를 되풀이해 읽어 블록은 늘었지만 시간은 1.83 → 1.23ms · 1.97 → 1.10ms 로 줄었다 — 「나빠짐」으로 보지 않는다. 다른 쿼리는 계획 모양이 같다. 다만 새 목록 SQL 의 politics 3장 · 분야 50장은 인덱스 뒤 `event_issue_id_idx` 비트맵(`issue_id is not null`, 825 중 746행)으로 바뀌어 203 → 206블록이 됐다(시간은 비슷)
  - **남는 것**: A2 개수 · A1 이슈 수 · A13 사건 · 이슈는 인덱스가 있어도 계획이 그대로다(EXISTS 가 이슈마다 멈추는 반복으로 바뀌지 않음) — 공개 기사 · 연결 · 사건을 통째로 엮는다
  - 임베딩 표가 로컬에 없어 분석의 거리 쿼리(`CandidateEventFinder.nearest` · `IssueCandidateFinder.find`)는 견주지 못했다. 둘 다 모든 사건의 임베딩을 훑는 모양이라 event_id 로 몇 개만 찾는 쿼리가 아니다
- **운영 블록 수의 큰 몫은 VACUUM 뒤 새로 들어온 기사 때문이다(새로 안 것).** 운영 쿼리마다 4,600 ~ 9,200블록, 같은 계획의 로컬은 150 ~ 250블록이다. A1 기사 수는 4,589블록 중 공개 기사 인덱스만 읽기의 Heap Fetches 가 3,267(약 7할)이다. 나머지 차이의 까닭은 확인하지 못했다 — 11-13 Heap Fetches 0 에서도 같은 쿼리가 2,909블록을 읽었다
  - 원인: 11-11 10:48 VACUUM 뒤 들어온 12,422건(오늘 10:00 수집)이 빈자리를 따라 5,719페이지(5 ~ 20,999번)에 흩어졌고, 그 페이지에 있던 공개 기사가 3,262건이다 — Heap Fetches 와 거의 같다(운영 읽기 쿼리로 확인)
  - 자동 VACUUM 은 넣은 행이 PG18 기본값으로 1,000 + 0.2 × 행 수 × 얼지 않은 페이지 비율 ≈ 1만 5천 6백 건이 돼야 돈다(처음엔 3만 2천으로 잘못 셈 — 얼린 페이지 몫을 빠뜨림). 15분 수집으로 바꾸면 그때까지 이 몫이 쌓인다
  - 처음 계획의 범위 밖이라 따로 승인받아 「계획에 더한 것」으로 넣었다(기사 표만 1,000건마다)
- 측정 스크립트: explain.sql 에 더하는 대신 `explain-events.sql`(26개) · `list-equal.sql` 을 따로 둔다 — 11-11 의 15개 표와 견줄 수 있게. bench.py 는 A3 에 더해 A4 · A5 도(이슈 id 를 셋째 인자로)
- `docs/data-model.md` 는 article_event 절에 인덱스 줄을 넣는다(V14 때와 같은 자리 방식)
- MR reviewer 반영: 분야를 고른 목록의 카드 내용을 지키는 시험을 더함(옛 시험은 total 만 봄), 인덱스 효과 문장을 「통째 읽기가 없어진 쿼리 / 한 표만 덜 읽는 쿼리」로 나눠 바로잡음, list-equal.sql 을 한 스냅숏(repeatable read, read only)으로, explain-events.sql 의 A6 를 앱 문장(explain.sql)으로, bench 인자 순서를 첫 줄에 적음
- `docs/data-model.md` 가 501줄이 되어 커밋 훅이 500줄 경고(막지는 않음)를 냈다 — ER 그림이 2절 표를 되풀이하는 몫을 덜어 내는 문서 MR 로 따로 한다

## 계획에 더한 것 — 기사 표 자동 VACUUM 기준 (11-12, 사용자 「응, 계획에 더해」 → 승인)


### 무엇을 / 왜

운영 쿼리가 읽는 블록의 큰 몫(A1 기사 수 4,589블록 중 3,267, 약 7할)은 공개 기사 인덱스만 읽기의 Heap Fetches 다. 11-11 10:48 VACUUM 뒤 들어온 12,422건(오늘 10:00 수집)이 빈자리를 따라 5,719페이지에 흩어졌고, 그 페이지의 공개 기사 3,262건을 읽을 때마다 표를 다시 본다(Heap Fetches 3,267). 같은 계획이 로컬(VACUUM 된 상태)에서는 150 ~ 250블록, 운영에서는 4,600 ~ 9,200블록을 읽는다.

자동 VACUUM 기준(운영 11-12, 읽기만):
- 넣은 행: PG18 은 `1,000 + 0.2 × reltuples × 얼지 않은 페이지 비율` = 1,000 + 0.2 × 142,286 × (1 − 24,977 / 51,430) ≈ **1만 5천 6백**. 오늘 12,422건은 아직 못 미친다
- 죽은 행: 50 + 0.2 × 142,286 ≈ **2만 8천 5백**
- 15분 수집(회차마다 약 130건, 하루 약 1만 2천 건)과 자동 투입의 공개 표시 고치기(하루 최대 5,000건)로는 하루 넘게 한 번이고, 그사이 이 몫이 쌓인다

**기사 표만** 넣은 행 · 죽은 행 1,000건마다 자동 VACUUM 이 돌게 하고, 회차마다 로그를 남긴다.

그 밖의 운영 설정: `autovacuum = on`, naptime 60s, cost delay 2ms · cost limit 200, deadlock_timeout 1s, `log_autovacuum_min_duration` 10분, 기사 표 `reloptions` 없음 · 592MB · 51,430페이지, 지금 오래 열린 트랜잭션 없음.

### 작업 순서

- [x] **1. 실패하는 시험 먼저** — `ArticleAutovacuumSettingTest`: `'article'::regclass` 의 `reloptions` 에 다섯 값(아래)이 있다(순서 상관없이). 다른 시험이 임시 스키마에 article 을 만들어도 현재 스키마 표만 본다. 설정 전에는 빈 값이라 빨강
- [x] **2. V15 에 넣기** — 아직 어디에도 적용되지 않은 V15 에 한 문장을 더하고 파일 이름을 `V15__event_issue_indexes_article_autovacuum.sql` 로 바꾼다(판 번호는 그대로라 판 검사 · 시험 목록은 안 바뀜)
  ```sql
  alter table article set (autovacuum_vacuum_insert_threshold = 1000, autovacuum_vacuum_insert_scale_factor = 0,
                           autovacuum_vacuum_threshold = 1000, autovacuum_vacuum_scale_factor = 0,
                           log_autovacuum_min_duration = 0);
  ```
  머리 주석: 왜(Heap Fetches 근거) · 값의 뜻(15분 수집 약 8회차마다, 회차마다 로그) · 싼 이유(표가 작다 — 592MB, 바뀐 페이지만 고르는 것은 32페이지 넘게 이어진 구간만 건너뛰므로 흩어지면 사이 페이지도 읽는다) · 되돌리기. 잠금은 SHARE UPDATE EXCLUSIVE 라 읽기 · 쓰기를 막지 않고, 같은 판의 `lock_timeout 5s` 안에 든다(자동 VACUUM 과 겹치면 1초 뒤 자동 VACUUM 쪽이 취소)
- [x] **3. 문서 · 스크립트 · 판 검사 문구** (infra MR)
  - `stats.sql` VACUUM 절에 `n_ins_since_vacuum` · `autovacuum_count` · `total_autovacuum_time`(PG18) 을 더하고, 오래 열린 트랜잭션(`pg_stat_activity.backend_xmin`) 한 줄
  - `classified-load.sql` · `data-load.md` 「V15 는 인덱스만」 → 「V15 는 인덱스 · 기사 표 자동 VACUUM 기준만(표 · 칸 같음)」
  - `docs/data-model.md` article 인덱스 줄에 한 마디(줄 수는 안 늘림), 두 MR 본문
  - 156 세션에 V15 를 이 일이 쓴다고 알린다(15분 수집 쪽이 새 마이그레이션을 쓰면 V16 부터)
- [ ] **4. 확인 — 배포 다음 날** (배포 당일 값은 5단계 손 VACUUM 직후라 설정이 없어도 낮아 효과를 못 가른다)
  - 배포 뒤 다음 날 확인 전까지 기사 표에 **손 VACUUM 을 하지 않는다**
  - 다음 날 같은 시각에 `explain-events.sql` · `stats.sql` 을 돌리고, Heap Fetches 와 함께 `n_ins_since_vacuum` · `n_dead_tup` · `autovacuum_count` · `last_autovacuum` 을 적는다(Heap Fetches 는 VACUUM 직후 낮고 다음 VACUUM 직전에 가장 높다)
  - 성공 기준: 하루 사이 자동 VACUUM 이 여러 번 돌았고(`autovacuum_count` 증가, DB 로그에 회차마다 `automatic vacuum of table "newlearn.public.article"`), A1 기사 수의 Heap Fetches 가 **수백 안쪽**이다. 넣은 행 몫의 상한은 1,000 / 12,422 × 3,262 ≈ 260 이고, 공개 표시 UPDATE 몫(아래 리스크)이 더해진다. 설정이 안 먹었다면 오늘처럼 3천대가 나온다
  - 자동 VACUUM 이 돌았는데 Heap Fetches 가 크면 그때 오래 열린 트랜잭션이 있었는지(`backend_xmin`) · 로그의 인덱스 정리 건너뜀을 본다

### 바꿀 파일

- `backend/src/main/resources/db/migration/V15__event_issue_indexes.sql` → `V15__event_issue_indexes_article_autovacuum.sql` — 이름 바꾸고 한 문장 더함
- `backend/src/test/java/kr/io/newlearn/ArticleAutovacuumSettingTest.java` — 새 시험
- `docs/data-model.md` — article 인덱스 줄에 한 마디
- `infra/server/perf/stats.sql` · `infra/server/classified-load.sql` · `infra/server/data-load.md` — VACUUM 칸 · V15 설명 문구
- `docs/plans/2026-11-12-issue-list-query.md` — 이 절을 옮기고 맞지 않게 된 줄 고침
- MR !885 · !886 본문

### 안 바꿀 것

- 다른 표(article_event · event · 회원 표)의 자동 VACUUM 기준, DB 전체 설정(postgresql.conf · StatefulSet), 자동 ANALYZE 기준, `vacuum_index_cleanup`
- 손 VACUUM 순서(계획 5단계의 개선 전 VACUUM 은 그대로)
- 원래 계획의 나머지(인덱스 둘 · 목록 쿼리 · 머지 순서)

### 리스크

| 리스크 | 대응 |
|---|---|
| 자동 VACUUM 이 잦아져 DB CPU · 디스크를 쓴다 | 하루 열몇 번, 한 번에 바뀐 페이지 근처만 읽는다(흩어지면 사이 페이지도). cost delay 는 이 크기에선 거의 묶지 않는다 — 싼 까닭은 표가 작아서(592MB)다. `total_autovacuum_time` · 로그의 걸린 시간으로 실제 쓴 시간을 본다 |
| 공개 표시 UPDATE(released_at 이 V14 부분 인덱스 조건이라 HOT 이 안 됨)가 남긴 죽은 행은 1,000건 기준이어도 바로 안 치워진다 | 죽은 행이 있는 페이지가 전체의 2%(약 1,000페이지) 아래면 PG14 이후 기본값이 인덱스 정리를 건너뛰고 그 페이지는 all-visible 이 되지 않는다. 대략 2,000건마다 정리된다고 본다. 확인 때 이 몫이 크면 `vacuum_index_cleanup = on` 을 V16 후보로 |
| 오래 열린 트랜잭션이 있으면 VACUUM 이 돌아도 페이지를 다 보임으로 못 바꾼다 | 확인 때 `backend_xmin` 을 같이 본다. 152 적재 같은 큰 트랜잭션은 배포 앞이라 겹치지 않는다 |
| 1,000 이 너무 잦거나 드물다 | 근거는 오늘 값(12,422건 → 공개 3,262건 다시 읽음)뿐이라 추정이다. 확인(4단계)의 값 · 간격을 보고 V16 으로 고친다 |
| 이름을 바꾼 V15 가 어딘가에 이미 적용됐다 | 원격 어느 브랜치 · 운영에도 V15 가 없다(reviewer 15:06 확인, 운영 판 14). Testcontainers · CI 는 매번 새 DB. 이 PC 의 꺼진 개발 DB(`newlearn-db-1`)에 이 브랜치로 V15 가 기록됐다면 그 볼륨만 지우면 된다 |
| 5단계 손 VACUUM 과 배포가 겹친다 | 겹치면 ALTER 가 5초 뒤 V15 째 되돌아가고 새 파드가 다시 시도한다. 손 VACUUM 이 끝난 것을 보고 배포한다 |

### 어떻게 검증하나

- 새 시험이 설정 전 빨강 · 설정 뒤 초록, 나머지 backend 시험 통과(`.claude/stack.md` §3)
- 배포 뒤 `select reloptions from pg_class where oid = 'article'::regclass` 에 다섯
- 4단계의 다음 날 확인: `autovacuum_count` 증가 · 로그 회차, A1 기사 수 Heap Fetches 수백 안쪽(오늘 3,267), 함께 적은 넣은 행 · 죽은 행 카운터
- MR reviewer 조수

### 되돌리는 법

- 사람이 `set lock_timeout = '5s'; alter table article reset (autovacuum_vacuum_insert_threshold, autovacuum_vacuum_insert_scale_factor, autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor, log_autovacuum_min_duration);` 를 치고, 기록을 맞추는 V16 을 같은 `reset` 으로 넣는다(판 검사에 16, 시험을 「설정 없음」으로). reset 은 설정이 없어도 오류가 나지 않는다. 데이터는 바뀌지 않는다

### 계획에서 바뀐 것 (reviewer 검토 반영)

- 검증을 「배포 다음 날」 하나로 — 당일은 손 VACUUM 직후라 못 가름. 그때까지 손 VACUUM 금지, 카운터를 같이 적기, 성공 기준 숫자(넣은 행 몫 ≈ 260 + UPDATE 몫)
- 비용 근거를 바로잡음(32페이지 건너뛰기 기준, cost delay 는 거의 안 묶음, 싼 까닭은 표 크기)
- 공개 표시 UPDATE 의 인덱스 정리 건너뜀(2%) 기대치, 오래 열린 트랜잭션 확인
- 기본값 근거를 PG18 공식(얼지 않은 페이지 비율)과 운영 relallfrozen 으로 다시 계산 — 3만 2천 → 1만 5천 6백
- 시험은 `'article'::regclass` 로 · 순서 상관없이, `log_autovacuum_min_duration = 0` 더함, 손 reset 에 `lock_timeout`, 156 세션에 V15 알림

## 운영 반영에서 바뀐 것 (11-13)

- **순서** — 최종 AI 파일이 11/13 로 밀려(사용자) 적재 전에 넣는 안을 냈다가, 사용자 결정 「적재 먼저」로 처음 계획 순서(152 다시 적재 → infra MR → 재기 → 배포) 그대로 했다. infra MR(!886 → !894)과 서버 사본은 적재 전에 넣었다 — 판 검사가 받는 판을 더하기만 해서 V14 에서도 그대로 돈다. backend MR 은 적재가 끝난 뒤 dev 로(!895)
- **5단계 손 VACUUM 은 07:27 에 했지만(사용자) 07:48 다시 적재가 행을 다시 고쳐 효과가 없었고, 적재 뒤 다시 하지는 않았다** — 다시 적재(07:48:35 commit)가 고친 행이 많아 기본 기준으로도 07:49 ~ 07:50 기사 · 기사-사건 · 사건 · 이슈 표에 자동 VACUUM · ANALYZE 가 돌았고, 기사 표가 이미 모두 「전부 보임」이었다(`stats.sql`). 7단계의 `ANALYZE article_event, event` 도 하지 않았다 — 인덱스를 더해도 표 통계는 그대로고, 적재 직후 자동 ANALYZE 가 돌았다
- **15분 수집 전환(!818)은 재기 뒤로** — 「재기는 15분 회차 사이」 조건을 쓰지 않고, 전환 전 데이터에서 쟀다. 그날 10:00 수집은 사용자 결정으로 건너뛰었다(!896 → !897 `suspend: true`)
- **frontend 가 같이 배포됐다** — 배포 MR 이 앞서 기다리던 frontend 태그(Jira 195 · 32)를 이어받아, 사용자 결정 「같이 내보내」로 함께 나갔다(08:22:42)
- **기록 자리** — `load-results.md` · `results.md`(각각 11-12 · 11-11 측정 전용) 대신 `infra/server/perf/results-194.md` 한 곳에 전 · 후를 모았다
- **재는 곳과 CI 러너가 같은 서버** — 부하 시험이 GitLab CI 잡 때문에 두 번(07:57 · 08:36) 「보내는 쪽 CPU」로 멈췄고, 개선 후 bench 도 두 번 CI 파이프라인과 겹쳤다. 돌던 파이프라인이 끝난 뒤 다시 쟀고, README 「피할 때」에 한 줄 더했다
- **결과** — `results-194.md` 요약: 포화 초당 93 → 123건, 막힌 곳은 그대로 DB CPU, 사건 · 이슈 하나만 보는 쿼리는 표 통째 읽기가 없어짐, A2 개수 · A1 이슈 수는 그대로. 자동 VACUUM 기준 「4. 확인 — 배포 다음 날」은 15분 수집이 켜진 뒤에 한다
