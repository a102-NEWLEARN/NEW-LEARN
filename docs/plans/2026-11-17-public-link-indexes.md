# 공개 기사 · 사건-기사 짝 인덱스 둘로 이슈 문턱 확인을 인덱스 안에서 끝낸다 (2026-11-17, Jira S15P31A102-228)

> 승인됨(2026-11-17). plan mode 의 `docs/plans/zazzy-questing-zebra.md` 에서 옮겼다.
>
> **기본은 오늘(11-17) 배포까지 한다** — Jira 227 과 같은 까닭(데이터 · 응답을 안 바꾸고, 인덱스를 지우면 완전히 되돌아온다). 발표 뒤로 미루려면 승인할 때 「머지까지만」.
>
> 🔴 **첫 단계(C0)가 관문이다.** JIT 를 끈 상태로 다시 재서 인덱스 효과가 작으면 여기서 멈추고 보고한다(아래 「C0 판단 기준」).

## Context — 왜

사용자 요청(2026-11-17): 느려진 질의 개선안 셋 중 1번(Jira 227, 반영 끝) 다음으로 「3번 먼저 재 보기」 → 결과를 보고 「둘 다 넣기」.

이슈 목록에 낼지 가리는 문턱 조각(`backend/src/main/java/kr/io/newlearn/common/PublicEventSql.java`)은 사건마다 「공개 기사가 M건 있나」를 본다. 지금은 기사 한 건을 볼 때마다 ① `article_event_event_id_idx` 로 연결 행을 찾고 표까지 가서 `article_id` 를 읽고, ② `article_pkey` 로 18만 건 기사 표까지 가서 `released_at` 을 본다. A2 전체 수 한 번에 사건 1,563번 · 기사 3,687번이다(11-17 운영 실행 계획). 기사 표는 실제 179,356행이다 — 통계 추정값(`reltuples` 277,302)은 부풀어 있었다(17:2x 운영 `count(*)`, MR 리뷰에서 바로잡음)

**로컬 시험 DB 첫 측정**(16:4x, 운영 11-17 07:24 덤프, 운영과 같은 설정, VACUUM 뒤): A1 버퍼 23,036 → 15,878(v1) → 13,093(v2), A3 4.10 → 1.86 ms, A4 2.25 → 1.03 ms, 기사 질의 넷 나빠짐 없음, 쓰기 흉내 흔들림 안.

🔴 **리뷰에서 드러난 측정의 함정 — JIT.** 측정 스크립트가 EXPLAIN 마다 새 연결을 열어, 추정 비용이 JIT 문턱(기본 10만)을 넘는 질의(A1 · A2 개수 · A13)는 매번 JIT 컴파일 시간이 섞였다. 리뷰 조수가 같은 로컬 base 에서 잰 값: A1 **33.9 → 11.7 ms**(JIT 끔), A13 이슈 칸 19.9 → 0.83, A13 사건 칸 18.3 → 3.2. 그래서 첫 측정의 ms(특히 A13 사건 칸 15.8 → 2.3, 「A1 25%」)는 인덱스 효과로 읽을 수 없다 — v2 에서 추정 비용이 문턱 아래로 내려가 JIT 가 꺼진 몫일 수 있다. JIT 가 없는 A3 · A4 의 줄어듦과 A1 버퍼 감소는 진짜다. 그리고 「A2 목록」 줄은 측정 SQL 이 실제와 달라(`press_code` 를 안 읽음) 버린다.

## C0 — JIT 를 끄고 다시 재기 (관문)

- 로컬 `perf-pg-1117` 에서 **한 연결 안에서** `set jit = off` 로 base → v1 → v1′(v1 + `include (press_code)`) → v2 를 잰다. 질의는 앱이 보내는 SQL 그대로(A2 는 `LIST_WITH_THRESHOLD` 전체 칸). 버퍼 · Heap Fetches · 시간 · 쓴 인덱스
- 비교를 위해 base 에서만 JIT 켬 값도 같은 연결에서 한 번 더
- **판단 기준** — JIT 끔 기준으로 A1 · A3 · A4 · A13 중 어느 것도 시간이 1할 넘게 줄지 않고 버퍼만 준다면 멈추고 보고한다(JIT 가 더 큰 지렛대라는 결과와 함께). 1할 넘게 주는 질의가 있으면 v1 / v1′ 중 버퍼가 적은 쪽과 v2 로 간다

## 바꿀 파일

| 파일 | 무엇을 |
|---|---|
| `backend/src/main/resources/db/migration/V17__public_link_lookup_indexes.sql` (새) | 인덱스 둘 — `article_released_id_idx on article (id)[ include (press_code)] where released_at is not null`, `article_event_event_article_idx on article_event (event_id, article_id)`. V15 와 같은 방식 — `concurrently` 없이 트랜잭션 안, `set local lock_timeout = '5s'`. 머리 주석에 왜 · C0 의 버퍼 감소(JIT 와 무관한 값) · 잠금 · 되돌리기. **ms 는 C0 의 JIT 끔 값만** |
| `backend/src/test/java/kr/io/newlearn/PublicLinkIndexSchemaTest.java` (새) | `EventIssueIndexSchemaTest` 와 같은 모양 — 두 `indexdef` 가 정확히 그 문장인지(`… WHERE (released_at IS NOT NULL)` 꼴은 `ArticlePublicIndexSchemaTest:31-34` 가 이미 맞춘다). 마이그레이션 전에는 빨갛다 |
| `backend/src/test/java/kr/io/newlearn/InterestIssueSchemaTest.java` | 판 목록 `containsExactly` 에 `"17"` — V15 · V16 커밋도 같이 고쳤다 |
| `docs/data-model.md` (256 · 319줄 근처) | V15 때처럼 V17 한 줄씩 |
| `exec/1-build-deploy.md:44 · 267` · `exec/3-db-dump.md:3` | 「Flyway V1 ~ V16」 · 「마지막 마이그레이션(V16)과 같습니다」가 틀리게 된다 → 덤프는 V16 까지이고 backend 가 뜰 때 V17 이 붙는다는 한 줄씩. `exec/files/db/schema.sql` 은 덤프 스냅숏이라 그대로 |
| 배포 뒤 문서 MR: `SSOT.md` 10절 한 줄 · `docs/testing.md` 2절 한 줄 | 운영 전후(같은 연결, JIT 줄 따로 적기) |

새 인덱스 이름이 `article_public_` 로 시작하면 `ArticlePublicIndexSchemaTest`(이름 `like 'article\_public\_%'` 로 정확히 두 줄)가 빨개진다 — 그래서 `article_released_id_idx` 로 짓는다.

## 작업 순서

- [x] **C0** 위 관문 — 통과(2026-11-17 17:00, 한 연결 · JIT 끔, 3회 중앙값): A1 10.3 → 6.8 ms(버퍼 23,033 → 13,090) · A3 3.3 → 1.2 · A4 1.09 → 0.69 · A2 끝 넘은 쪽 11.1 → 5.7, A2 목록 · 기사 질의 넷 그대로. v1 · v1′ 은 시간이 같고 v1′(include) + 짝 쪽이 버퍼 합이 적어(32,705 대 33,240 — A2 목록 586 대 776 · A3 1,758 대 2,129) v1′ 로 간다. 만드는 시간(로컬 17만 행) v1′ 47 ms · 짝 12 ms
- [x] **배포 전 운영 바탕값(읽기만)** — 17:06(CI 잡 0, 활성 연결 1) JIT 켬: A1 40.3 ms(그중 JIT 19.5) · A3 8.1 · A4 3.6 · A13 사건 칸 14.3(JIT 9.9) · A2 목록 64.3, JIT 끔: A1 19.5 · A3 8.0 · A4 4.2. 17:01(15분 수집 직후)에는 A1 83.5 · A2 목록 124.3 으로 부풀었다
- [x] **C1** 스키마 시험(빨강 확인) → V17 · 판 목록 시험 → `backend_LINT` · `backend_TEST`(verifier 조수) → 되돌림 확인(V17 을 빼면 새 스키마 시험이 단언에서 빨개지는지) → 문서(data-model · exec) 같은 MR
- [x] MR → reviewer 조수 → 파이프라인 초록 → 머지(직전 dev SHA · 열린 MR 확인) → 배포 태그 MR(15분 수집 회차 :00 · :15 · :30 · :45 를 피해 머지) → 새 Pod 의 Flyway V17 성공 · 이미지 판 확인 — !1122(리뷰 조수 고쳐야 함 하나 · 운영 기사 표 크기 바로잡음) 파이프라인 첫 실행에서 북마크 동시성 시험이 흔들려 다시 돌려 통과, 17:46 머지(팀원이 걸어 둔 자동 머지) → 배포 태그 !1126 18:01 머지(frontend 태그도 함께 실림) → V17 0.59초 · 18:02 Pod Ready
- [x] 운영 전후 측정 → 문서 MR → Jira 완료 → 분야 브랜치 넷 맞추기 — 잰 값은 `SSOT.md` 10절 2026-11-17, 흔들린 시험은 8절

## 안 바꿀 것

- 질의 · 응답 · 설정 — 코드는 마이그레이션 · 시험 · 문서뿐. `PublicEventSql` 등 SQL 은 한 글자도 안 바꾼다
- **JIT 설정**(`jit` · `jit_above_cost`) — 리뷰에서 인덱스보다 큰 지렛대로 보였지만 DB 설정 변경이라 이 계획 밖이다. C0 결과와 함께 따로 보고하고 사용자가 정한다
- V15 의 `article_event_event_id_idx (event_id)` — 짝 인덱스가 앞 칸으로 대신할 수 있지만 지우지 않는다(측정이 둘 다 있는 상태, 지우면 `EventIssueIndexSchemaTest` · V15 설명이 바뀐다)
- 개선안 2(미리 센 표) · Jira 210(목록 모양 합치기)
- `exec/files/db/schema.sql` · 이미 적용된 V1 ~ V16

## 리스크

- **만드는 동안 기사 · 연결 쓰기가 기다린다.** 트랜잭션 안 `create index` 는 표에 SHARE 잠금 — 읽기는 되고 쓰기(15분 수집의 기사 넣기 · 공개 처리, 분석의 사건 연결)만 막힌다. 운영에서 V14 는 약 5만 1천 페이지 기사 표에 인덱스 둘을 **0.49초**에 만들었다(`SSOT.md` 10절, `infra/server/perf/results.md`). 지금 표는 56,661페이지라 비슷할 것. `lock_timeout` 은 잠금을 기다리는 시간만 묶고, startupProbe 180초(`infra/k8s/services/app/backend.yaml`)가 넉넉하다. 수집 회차를 피해 배포한다
- **잠금을 5초 안에 못 잡으면** 이 판이 통째로 되돌아가 새 backend 만 못 뜨고 옛 것이 계속 받는다(maxUnavailable 0). 같은 Pod 안 컨테이너가 다시 시작하며 다시 시도한다 — 간격이 10초에서 5분까지 늘고(CrashLoopBackOff), Argo CD 는 Deployment 기본 진행 기한(600초) 동안 Progressing 이다가 그 뒤 Degraded 로 보인다
- **운영 효과가 로컬보다 작을 수 있다.** 운영 기사 표는 98.7% 가 「모두 보임」이지만 공개 기사 인덱스만 읽기에서 30,783행 중 2,451번(8%)이 표까지 다녀간다(11-17 16:44) — 막 공개된 기사가 표시 안 된 페이지에 몰려 있고 사건에 붙는 기사도 대개 최근 기사다. 연결 표는 87.2%. 운영 전후에 Heap Fetches 를 적는다
- **A1 은 크게 줄지 않는다** — 이슈를 하나씩 도는 구조는 그대로다. 몇 ms 로 줄이려면 개선안 2

## 어떻게 검증하나

1. **C0** — 위 판단 기준대로. 결과 원자료는 스크래치패드에 남긴다
2. **시험** — `PublicLinkIndexSchemaTest` 가 V17 전에는 빨갛고 뒤에는 초록, `InterestIssueSchemaTest` 초록, `backend_TEST` 전체 초록(Testcontainers 가 V1 ~ V17 을 처음부터 돈다). 되돌림: V17 을 임시로 빼면 새 스키마 시험이 단언(빈 목록 ≠ 두 문장)에서 빨개진다
3. **배포 확인** — 새 Pod 로그의 Flyway 「Successfully applied 1 migration … v17」, 운영 `flyway_schema_history` 에 17 이 `success`, `pg_indexes` 에 두 인덱스, `pg_index.indisvalid` 참
4. **운영 전후** — 같은 질의 · 사이트 문턱 · 한 연결로 실행 계획 3회, JIT 몫은 따로. 새 인덱스를 실제로 타는지, Heap Fetches, 버퍼, 시간. 한 시간쯤 뒤 `pg_stat_user_indexes.idx_scan` 이 두 인덱스에서 늘었는지(`infra/server/perf/stats.sql` 은 표 이름으로 모아 저절로 나온다)
5. **나빠짐 없음** — A7 기사 목록 · 개수, A1 분야별 기사 수가 배포 전과 같은 인덱스 · 비슷한 시간인지
6. `SSOT.md` 10절에 전후 숫자와 「말하지 못하는 것」(부하 시험 안 함 · 로컬과 운영 차이 · JIT 몫)

## 되돌리는 법

| 무엇 | 어떻게 |
|---|---|
| 인덱스 | 사람이 EC2 에서 하나씩 `drop index concurrently if exists article_released_id_idx;` · `drop index concurrently if exists article_event_event_article_idx;` — 그냥 `drop index` 는 ACCESS EXCLUSIVE 잠금이라 열린 수집 · 분석 트랜잭션 뒤에서 기다리는 동안 화면 조회까지 줄을 선다. 질의는 바로 옛 계획으로 돌아간다. `flyway_schema_history` 의 17 은 남아 V17 이 다시 돌지 않는다 |
| 배포 | 배포 태그를 배포 직전 backend 판으로 되돌려도 인덱스는 남는다. 옛 이미지는 기록에 V17 이 있어도 뜬다(Flyway 기본값이 미래 판을 무시) |
| 코드 | 이미 적용된 V17 파일은 지우지 않는다. 지우려면 V18 로 `drop index if exists …` |

데이터를 안 바꾸므로 인덱스를 지우면 완전히 되돌아온다.

## 리뷰에서 바뀐 것 (reviewer 조수, 2026-11-17)

| 처음 계획 | 바꾼 것 |
|---|---|
| 바꿀 파일은 새 시험 · V17 뿐 | `InterestIssueSchemaTest` 판 목록 `"17"` — 안 고치면 `backend_TEST` 가 빨개진다 |
| 이름 `article_public_id_idx` | `article_released_id_idx` — `ArticlePublicIndexSchemaTest` 의 `like 'article\_public\_%'` 에 걸리지 않게 |
| 첫 측정의 ms 를 효과로 적음 | 새 연결마다 JIT 컴파일이 섞였다 → C0 관문(한 연결 · JIT 끔)으로 다시 재고, 그 전에는 ms 를 주석에 안 넣는다. A2 목록 줄은 SQL 이 실제와 달라 버림 |
| 만드는 시간을 로컬 비율로 어림 | 운영에서 잰 V14 값(인덱스 둘 0.49초)을 근거로 |
| 되돌리기 `drop index a, b` | `drop index concurrently if exists` 하나씩, V18 은 `if exists` |
| exec/ 는 안 바꿈 | `schema.sql` 은 그대로, 「V1 ~ V16」 · 「마지막 마이그레이션(V16)」 세 문장만 고침 |
| — | `docs/data-model.md` 에 V17 한 줄(V15 때와 같이), v1 에 `include (press_code)` 를 C0 에서 견줌 |
| 「kubelet 이 새 Pod 를」 | 같은 Pod 안 컨테이너 재시작 · CrashLoopBackOff · Argo CD 는 600초 Progressing 뒤 Degraded |
| (MR 리뷰) 「운영 27만 행」 · 「A1 한 번에 1,563 · 3,687」 | 실제 179,356행(추정값이 부풂) · 그 숫자는 A2 전체 수 질의의 실행 계획 — V17 주석 · 이 계획에서 바로잡음, A13 은 버퍼만 준다는 구절 추가 |
