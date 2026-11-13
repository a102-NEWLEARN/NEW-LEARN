# 사건 패널 관련 기사 정렬 — 오래된 순 · 최신 순 고르기 (Jira S15P31A102-201)

## 무엇을 / 왜

2026-11-12 사용자 QA 5번. F08 사건별 관련 기사 조회 패널의 「발행 순」 고정 글자를 *오래된 순 · 최신 순* 고르기로 바꾼다(사용자 답: 정렬만 바꾸기, 2026-11-13 계획 승인).
패널은 5건씩 쪽을 넘기므로 받은 쪽만 뒤집으면 순서가 어긋난다. 그래서 서버(A6)가 정렬한다.

| 무엇 | 정한 것 | 근거 |
| --- | --- | --- |
| A6 인자 | `sort` — `oldest`(기본, 지금과 같음: 발행 시각 · id 오름차순) · `latest`(발행 시각 · id 내림차순). 그 밖의 값은 400 `VALIDATION_FAILED` | A2 `sort` 와 같은 방식(`IssueController` 의 `@Pattern`) |
| 화면 | 「관련 기사」 머리 줄 오른쪽 「발행 순」 글자를 *오래된 순 · 최신 순* 두 칸 고르기로. 기본은 오래된 순 | 사건이 어떻게 시작됐는지 먼저 보는 지금 흐름을 기본으로 둔다 |
| 첫 기사 날짜 | 패널 위 「첫 기사」 날짜는 최신 순에서도 가장 오래된 기사로 둔다 | 지금은 A6 첫 쪽 맨 앞을 쓴다 — 최신 순이면 틀린다. 오래된 순 쿼리를 늘 두고 거기서 읽는다(같은 키라 오래된 순일 때는 한 번만 부른다) |
| 사건을 바꾸면 | 고른 정렬은 패널을 닫을 때까지 유지 | 이전 · 다음 사건을 넘겨 보며 같은 기준으로 비교한다 |

## 바꿀 파일

- backend `event/EventController.java` · `event/EventService.java` — `sort` 인자, 정렬 방향
- backend 시험 `event/EventControllerTest.java` · `event/EventServiceTest.java` — 실패하는 시험 먼저
- frontend `api/eventArticles.ts` — `sort` 를 인자 · queryKey 에
- frontend `components/issue/EventPanel.tsx` — 고르기, 첫 기사 날짜
- frontend `mocks/handlers.ts` — A6 mock 이 `sort` 를 따른다
- frontend 시험 `EventPanel.test.tsx`
- 문서: `docs/api-screen.md` A6, `docs/api.md` 1절(「바꾸는 인자는 A2 `sort` 하나다」), EXPERIENCE 사건 패널 「관련 기사」 행

## 작업 순서 — 한 줄이 커밋 하나

- [x] 0 Jira S15P31A102-201, 브랜치 `feat/common/S15P31A102-201-event-articles-sort`(origin/dev). 이 계획 커밋
- [ ] 1 backend A6 `sort` — 시험: 기본은 오름차순, `latest` 는 내림차순, 같은 시각은 id 순, 이상한 값은 400
- [ ] 2 frontend 쿼리 · mock · 패널 고르기 · 첫 기사 날짜 — 시험: 최신 순을 누르면 순서가 뒤집히고 A6 에 `sort=latest` 가 간다, 첫 기사 날짜는 그대로
- [ ] 3 문서(api-screen A6 · api.md 1절 · EXPERIENCE)
- [ ] 4 reviewer 조수 · `/verify`(backend · frontend) · 스크린숏(393 · 1440) · MR 본문

## 안 바꿀 것

- DB · 다른 API · 응답 모양
- 언론사 필터 — 이번에는 정렬만
- 좁은 화면 사건 시트의 다른 부분

## 리스크

- 사용자가 backend 를 처음 건드린다 → MR 에 backend 담당 리뷰를 받는다
- 배포 순서: backend 보다 frontend 가 먼저 나가도 서버가 모르는 인자를 무시해 오래된 순으로 온다(고르기만 안 먹는다). 같은 MR 이라 보통은 함께 나간다
- 최신 순에서 쪽을 넘기는 중 새 기사가 붙으면 한 건이 겹칠 수 있다 — 오래된 순도 같은 성질이라 따로 막지 않는다

## 어떻게 검증하나

- 시험: backend `EventControllerTest` · `EventServiceTest`, frontend `EventPanel.test.tsx`
- 게이트: `/verify` — `.claude/stack.md` §3 의 backend · frontend 명령. frontend 시험은 Node 26(`npx node@26`)으로도
- 화면(`dev:mock`, 393 · 1440): 사건 패널에서 최신 순 → 목록이 뒤집힌다, *더 보기* 뒤에도 순서가 이어진다, 첫 기사 날짜 그대로

## 되돌리는 법

MR 을 Revert 한다. 데이터 변경이 없고, 인자를 안 보내면 지금과 같은 오래된 순이다.
