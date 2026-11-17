# 이슈 목록의 전체 수를 목록 질의에서 함께 읽는다 (2026-11-17, Jira S15P31A102-227)

> 승인됨(2026-11-17). 이 자리에 오기 전 이름은 plan mode 의 `docs/plans/zazzy-questing-zebra.md` 였다 — 같은 이름을 쓴 앞 계획(메인 흐름 없는 이슈)은 `docs/plans/2026-11-16-main-flow-issues.md` 에 있다.
>
> **기본은 오늘(11-17) 배포까지 한다.** 데이터 · 설정 · 계약을 안 바꿔 태그 하나로 완전히 되돌아오고, 이슈 목록이 느린 것은 발표 날에도 같은 문제라서다. 발표 뒤로 미루려면 승인할 때 「머지까지만」이라고 하면 배포 태그 MR 만 미룬다.

## Context — 왜

사용자 요청(2026-11-17): 「느려진부분들 개선방법 고안해봐」 → 낸 개선안 셋 중 「1번부터」.

A2 이슈 목록(`GET /api/v1/issues`)은 요청 한 번에 질의를 둘 돈다 — 전체 수(`select count(*) from issue i where …`)와 행(`LIST_WITH_THRESHOLD`). 그런데 행 질의는 정렬하려고 어차피 문턱을 넘는 이슈 **전부**를 집계한 뒤 자른다. 그래서 바깥 select 에 `count(*) over ()` 한 칸만 더하면 같은 계산에서 전체 수가 나온다. 창 함수는 `LIMIT` 전에 계산되기 때문이다.

**운영 실측**(2026-11-17 15:03, 읽기만, 같은 질의 3회, 사이트 문턱 기사 3 · 사건 3 · 메인 1, 이슈 336 · 사건 6,957):

| 질의 | 3회 |
|---|---|
| 전체 수 (지금) | 70.6 · 71.1 · 78.6 ms (버퍼 23,548) |
| 행 3개 (지금) | 67.4 · 59.3 · 58.7 ms |
| **행 + `count(*) over ()`** | **58.1 · 57.2 · 60.2 ms** — 전체 수 203, 지금 질의와 같음 |

A2 는 사용자 요청의 약 32%다(입구 로그 7일 비율 — `infra/server/perf/load.py` 의 `MIX` 가중치 3,213 / 9,884, `infra/server/perf/load-results.md`). API 응답은 한 글자도 바뀌지 않는다.

## 무엇을

`IssueQueryRepository.findCards` 를 질의 둘 → 하나로.

- `LIST` · `LIST_WITH_THRESHOLD` **두 모양 모두** 바깥 select 에 `count(*) over () as total_count` 한 칸
- 쪽은 Spring Data 의 `PageableExecutionUtils.getPage(rows, pageable, () -> …)` 로 만든다. 이 도구는 덜 찬 첫 쪽이면 행 수를, 빈 행이고 첫 쪽이 아니면(끝을 넘은 쪽) 공급자를 부른다. 공급자는 행이 있으면 첫 행의 `total_count`, 없으면 **지금 전체 수 질의를 그대로** 부른다 — 창 함수는 행이 없으면 값을 못 주기 때문이다. 손으로 짠 갈래가 없다. 화면이 끝 너머 쪽을 부르는 일은 드물다

## 바꿀 파일

| 파일 | 무엇을 |
|---|---|
| `backend/src/main/java/kr/io/newlearn/issue/IssueQueryRepository.java` | 두 모양에 한 칸. `findCards` 는 한 질의 + `PageableExecutionUtils.getPage`, 끝 넘은 쪽만 지금 수 질의(같은 파일 안 private `countCards` 로 떼어 바인딩 그대로). 행은 기존 `mapCard` 로 읽고 `total_count` 만 따로 읽는다 — `CardRow` 는 A3 · A25 도 쓰므로 안 바꾼다. 주석 「수를 세는 질의와 행을 가져오는 질의가 따로다」를 고친다 |
| `backend/src/test/java/kr/io/newlearn/MinPublicEventsApiIntegrationTest.java` | 사이트 모양(`LIST_WITH_THRESHOLD`)에 끝을 넘은 쪽 단언 — `filtersSortAndPagesFollowTheSameRule` 에 `size=1&page=5` → `items` 0 · `totalElements` 3. 지금은 끝 넘은 쪽을 `LIST` 모양에서만 본다. 옛 구조를 말하는 주석 둘도 고친다 — 117줄 「총수(개수 질의)와 행(목록 질의)」, 22줄이 가리키는 계획 파일 이름(이 파일이라 옮기면 없어진다 → Jira S15P31A102-208) |
| `backend/src/test/java/kr/io/newlearn/CategoryIssueQueryTest.java` | `createdTiesFilterAndEmptyPageKeepTotal` 에 분야를 고른 끝 넘은 쪽 — `findCards("politics", …, PageRequest.of(5, 1))` → 비고 전체 수 2. 갈래의 수 질의가 분야를 넘기는지 지킨다 |
| `MinPublicArticlesApiIntegrationTest.java:89` · `MinMainEventsListShapeTest.java:22,52` | 「총수(개수 질의)와 행(목록 질의)」 주석만 「행과 전체 수(같은 질의, 끝 넘은 쪽만 개수 질의)」로. 단언은 그대로 |
| `InterestIssueApiIntegrationTest.java` (구현 중 추가) | 이슈 목록의 JDBC 질의 수 단언 `times(4)` → `times(3)` 둘(손님 · 회원). 계획 때 놓친 시험이다 — 질의 수를 세고 있어, 줄어든 것을 바로 잡았다. 「질의가 하나로 줄었나」를 이 시험이 지킨다 |

시험 메서드는 늘리지 않고 같은 주제의 기존 메서드에 단언을 더한다(`docs/testing.md` 의 backend 시험 수 514 그대로).

## 작업 순서

- [x] **C1** 시험 단언 둘 → 구현 → `backend_LINT` · `backend_TEST`(verifier 조수) → 되돌림 확인(아래 셋 + 구현 중 더한 넷째 「개수 질의를 늘 돌림 → 질의 수 시험이 빨개짐」 — 넷 모두 단언에서 빨개짐, 전체 시험 721 통과). 동작이 안 바뀌는 성능 고침이라 새 단언은 **지금 코드에서도 초록인 성격 시험**이다 — 「빨간 시험 먼저」의 증거는 되돌림 확인이 맡는다
- [x] **운영 전수 비교(머지 전, 읽기만)** — 2026-11-17 15:26 분야 6갈래 모두 같음(203 · 57 · 11 · 46 · 46 · 43, 첫 쪽 · 가운데 쪽). — 한 스냅숏 안에서(`begin transaction isolation level repeatable read, read only` — `infra/server/perf/list-equal.sql` 방식, 15분 수집이 도는 중이라서) 분야 6갈래(전체 + 다섯)마다 지금 전체 수 = 새 질의 `total_count`. 정렬은 전체 수를 안 바꾸므로 한 가지로, 대신 가운데 쪽(`offset` > 0) 하나를 더 봐서 `total_count` 가 쪽에 따라 안 바뀌는지
- [ ] MR → reviewer 조수 → 파이프라인 초록 → 머지(직전 원격 dev SHA · 열린 MR 확인) → 배포 태그 MR(`infra/k8s/services/app/kustomization.yaml` 의 backend 태그) → 사이트에서 이미지 판 확인
- [ ] 사이트 확인 · 전후 측정 → 문서 MR(`SSOT.md` 10절 한 줄 · `docs/testing.md` 2절 한 줄) → Jira 완료 → 분야 브랜치 넷 맞추기. 문서에는 11-15 결론(「세는 모양 `count(*) >= 3` 이 더 느려 `exists` 모양을 둔다」, `SSOT.md` 10절 2026-11-15)과 왜 다른지 한 마디를 붙인다 — 그때는 따로 도는 수 질의였고, 이번엔 행 질의가 이미 하는 집계에 얹힌다

## 안 바꿀 것

- API 응답 모양과 값(전체 수 · 행 · 정렬 · 쪽) — `docs/api.md` 는 그대로
- A1 분야별 개수 · A13 검색 질의 — 이번엔 A2 만. 미리 센 표(개선안 2) · 부분 인덱스(개선안 3)는 따로
- `LIST` 와 `LIST_WITH_THRESHOLD` 를 하나로 합치기 · `skip()` 이름 바꾸기 — Jira 210 그대로 남긴다. 이번엔 두 모양에 같은 한 칸만 더한다
- 문턱 판정 조각(`PublicEventSql`, 주석 「A2 · A1 · A13 이슈 칸」 포함 — A2 의 끝 넘은 쪽은 여전히 그 조각을 쓴다) · 설정값 · 전체 수 질의 자체(끝 넘은 쪽에서 그대로 재사용)
- A3 이슈 머리 · A25 관심 이슈 목록(`AGGREGATE`)

## 리스크

- **전체 수를 세는 모양이 바뀐다.** 지금은 이슈 표에서 `exists` 로, 새로는 사건을 묶어 `having` 으로 센다. 두 모양이 다른 답을 내는 경우가 있으면 화면의 전체 수가 바뀐다. 오늘 운영(분야 없음)은 203 = 203 이었고, 머지 전 전수 비교로 분야 다섯 · 정렬 둘을 본다. 대신 행과 전체 수가 같은 계산에서 나와 「총수와 쪽이 어긋남」은 구조적으로 줄어든다. A1(여전히 `exists` 모양) 합 = A2 전체 수는 시험 `categoryCountsLeaveOutTheSameIssuesAsTheList` 가 지킨다
- **끝 넘은 쪽은 지금처럼 질의 둘**이다(행 0 + 수). 느려지지 않지만 빨라지지도 않는다
- **끔 경로(`LIST`, 문턱 1)는 운영이 안 쓴다** — 시험(`CategoryIssueQueryTest` · `MinMainEventsListShapeTest`)으로만 본다
- **발표 전날(11-17) backend 를 새로 띄운다.** Argo CD 교체 1 ~ 2분, 데이터 · 설정은 안 바뀐다. 기본은 오늘 배포(맨 위), 「머지까지만」이면 배포 태그 MR 을 미룬다
- ~~질의가 둘에서 하나로 줄었는지는 시험이 지키지 않는다~~ — 구현 중에 `InterestIssueApiIntegrationTest` 가 이슈 목록의 JDBC 질의 수를 센다는 것을 알았다(첫 시험 실행에서 4 기대 · 3 실제로 빨개짐). 기대값을 3 으로 고쳤고, 개수 질의를 늘 돌게 되돌리면 이 시험이 빨개지는지 되돌림 확인 넷째로 본다

## 어떻게 검증하나

1. **시험** — `backend_TEST` 전체 초록. 되돌림 확인 셋:
   - 끝 넘은 쪽 갈래를 지우고 0 을 돌려주면 → 새 단언 둘이 빨개진다
   - 갈래의 수 질의에 분야를 안 넘기면 → `CategoryIssueQueryTest` 의 분야 단언이 빨개진다
   - `total_count` 대신 `rows.size()` 를 쓰면 → 기존 단언(`aggregateCountsAndBulkReferences` 의 쪽 크기 2 · 전체 3, `filtersSortAndPagesFollowTheSameRule` 의 `size=1&page=1` · 전체 3)이 빨개진다
2. **운영 전수 비교(머지 전)** — 위 12갈래가 모두 같다
3. **사이트(배포 뒤)** — 배포된 backend 이미지 판부터 확인(11-15 교훈). A2 `totalElements` 가 배포 직전 값과 같고, A1 분야별 이슈 수 합 = A2 전체 수, 끝 넘은 쪽(`page=999`)도 같은 전체 수
4. **속도** — 운영 실행 계획 3회: 전(전체 수 + 행) → 후(합친 질의). 밖에서 잰 A2 응답 시간(관리자 PC, 15번 중앙값, 앞 2회 버림 — 208 때 `timeapi.py` 방식) 전후. 흔들림이 차이보다 크면 그대로 적는다
5. `SSOT.md` 10절에 전후 숫자와 「말하지 못하는 것」 한 줄

## 되돌리는 법

| 무엇 | 어떻게 |
|---|---|
| 배포 | `kustomization.yaml` 의 backend 태그를 **배포 직전 판**(오늘 dev 기준 `2d2198f9` — 배포 태그 MR 직전에 다시 읽는다. 그사이 다른 backend 배포가 들어가면 남의 변경까지 되돌리지 않게)으로 되돌리는 배포 태그 MR → Argo CD 가 1 ~ 2분 안에 교체 |
| 코드 | MR 되돌리기 |

데이터 · 설정 · 계약을 안 바꾸므로 완전히 되돌아온다.

## 리뷰에서 바뀐 것 (reviewer 조수, 2026-11-17)

| 처음 계획 | 바꾼 것 |
|---|---|
| 32.5% 의 출처로 개인 기록을 가리킴 | 팀 저장소 `infra/server/perf/load.py` · `load-results.md` |
| 전수 비교 12갈래(분야 × 정렬), 문장마다 따로 | 한 스냅숏(repeatable read) 안에서 분야 6갈래 + 가운데 쪽 하나 |
| 빈 행 갈래를 손으로 짬 | `PageableExecutionUtils.getPage` — 규칙이 같고 갈래가 줄어든다(spring-data-commons 4.1.1) |
| 고칠 주석은 저장소 하나 | 시험 주석 넷(옛 구조 · 없어질 계획 파일 이름)도. `PublicEventSql` 주석은 여전히 맞아 둔다 |
| 「시험 먼저」 | 새 단언은 성격 시험, 증거는 되돌림 확인 |
| 문서 한 줄 | 11-15 「세는 모양이 더 느리다」와 왜 다른지 한 마디 |
| 되돌릴 태그 `2d2198f9` 고정 | 배포 태그 MR 직전에 다시 읽는다 |
| 배포 시점 두 길 열어 둠 | 기본은 오늘 배포, 「머지까지만」이면 미룸 |
