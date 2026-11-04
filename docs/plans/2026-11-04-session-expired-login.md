# S15P31A102-165 세션이 끝난 401 을 어느 요청에서 받든 로그인 화면으로

S15P31A102-165. 2026-11-04 사용자가 승인했다. -163 과 따로 `origin/frontend` 에서 땄다.

## 무엇을 / 왜

EXPERIENCE 이동 규칙에는 「세션이 끝나 401 `UNAUTHORIZED` 를 받으면 `/login?next=<지금 주소>` 로 보낸다」고 적혀 있다. 그런데 지금은 북마크 · 관심 이슈 별 · 관심 분야 저장 버튼 세 개만 각자 그렇게 한다.
**목록을 읽는 요청(A22 나의 뉴스함, A25 관심 이슈 — 마이페이지 · 나의 뉴스함)은 401 을 받으면 「불러오지 못했어요」와 *다시 시도* 를 띄운다.** 다시 눌러도 계속 401 이다.
이 처리를 QueryClient 한 곳으로 옮겨, 어느 조회 · 저장이 401 을 받든 「내 정보」를 손님(null)으로 바꾼다. 그러면 있던 가드 `RequireMember` 가 로그인 화면으로 보내고, 로그인하면 보던 주소로 돌아온다.

## 바꿀 파일

- `frontend/src/api/error.ts` — `isSessionExpired(error)`: `status === 401` 이고 `code !== "LOGIN_FAILED"`. 로그인 실패(A15)만 뺀다. A16 로그아웃 · A17 내 정보의 401 은 `logout()` · `fetchMe()` 가 이미 삼켜서 여기 오지 않는다
- `frontend/src/api/query-client.ts` — `createQueryClient` 에 `QueryCache` · `MutationCache` 의 `onError` 를 단다. `isSessionExpired` 이면 `setQueryData(meQuery.queryKey, null)`
- `frontend/src/test/render.tsx` — 시험용 QueryClient 를 `createQueryClient()` 로 만들고 `retry: false` 만 덮는다. 시험도 앱과 같은 전역 처리를 거치게
- `frontend/src/components/BookmarkButton.tsx` · `issue/InterestButton.tsx` · `mypage/InterestSettings.tsx` — 각자 하던 `setQueryData(me, null)` 을 지운다. 401 이면 스낵바 · 오류 문장을 띄우지 않는 것만 남긴다(`isSessionExpired`)
- 시험: `api/query-client.test.ts`(조회 401 → 손님, 저장 401 → 손님, `LOGIN_FAILED` 는 그대로), `pages/BookmarksPage.test.tsx` · `pages/MyPage.test.tsx`(A22 · A25 가 401 이면 `/login?next=…` 로 간다)
- EXPERIENCE.md 이동 규칙 72행 — 「어느 요청이든 화면 전체에서 한다」와 날짜 · 티켓만 덧붙인다

## 작업 순서

- [x] 실패하는 시험 먼저 — query-client · 나의 뉴스함 · 마이페이지 401 (단언에서 빨간지 본다)
- [x] `isSessionExpired` · 전역 `onError` · 시험 도우미 — 위 시험 초록
- [x] 버튼 세 개의 중복 처리 정리 — 기존 401 시험(`BookmarkButton` · `InterestButton` · `InterestSettings`) 그대로 초록
- [x] EXPERIENCE 한 줄

## 안 바꿀 것

- 로그인 · 가입 · 로그아웃 화면과 `RequireMember` 가드 — 가드가 보내는 방식(`me` 가 null 이면 `/login?next=`)을 그대로 쓴다
- 받아 둔 응답 버리기 — 로그아웃은 `removeQueries()` 로 다 버리지만, 세션 만료는 지금 버튼들처럼 「내 정보」만 손님으로 바꾼다. 화면이 다시 열리면 어차피 새로 부른다
- 손님 둘러보기 규칙(팀 확인 남음), 401 문구, 백엔드

## 리스크

- 시험 도우미가 바뀌어 모든 화면 시험이 전역 `onError` 를 거친다. 401 을 일부러 주는 시험만 영향이 있다 — A17 401(손님)은 `fetchMe` 가 삼키니 그대로다. 전체 시험으로 확인한다
- 백엔드가 401 에 `LOGIN_FAILED` 말고 다른 코드를 새로 쓰면(예: 내부 API 출입증) 그것도 로그아웃으로 본다. 화면은 내부 API 를 부르지 않는다
- 인증 흐름이라 AGENTS.md 「인증 · 권한 코드 — 사람이 최종 확인」 대상이다. 머지 전 화면에서 직접 확인을 부탁한다

## 어떻게 검증하나

- 새 시험: 조회(A22)가 401 이면 `me` 가 null 이 되고 `/login?next=/bookmarks` 로 간다 · 마이페이지(A25)도 같다 · 저장(A20) 401 도 같다 · A15 `LOGIN_FAILED` 401 은 `me` 를 건드리지 않는다
- 기존 시험: 버튼 세 개의 「세션이 끝났으면(401) 로그인 화면으로 보낸다」, 로그인 실패 문구, 로그아웃 401 — 그대로 초록
- `/verify` — 포맷 · 린트 · 테스트(Node 24 · 26) · 빌드, 되돌림 확인
- 화면: `dev:mock` 에서 로그인 → 나의 뉴스함을 연 채 가짜 세션을 끊는다(msw 를 브라우저 콘솔에서 바꾸기 어려우면 시험으로 대신하고 그렇다고 적는다)

## 되돌리는 법

MR 을 revert 한다. 버튼 세 개는 원래 각자 처리하던 코드로 돌아가고, 목록 401 은 다시 「불러오지 못했어요」가 뜬다. 데이터 · 배포와 상관없다.

## 한 뒤에 (2026-11-04)

- 계획대로 했다. 시험 630개(Node 24 · 26), 새 시험 7개 — 전역 처리만 되돌리면 새 시험 4개와 버튼 세 개의 기존 401 시험 3개가 단언에서 빨개진다. `LOGIN_FAILED` · 403 · 500 을 그대로 두는 3개는 지킴 시험이다
- 화면에서는 401 을 못 만들었다 — 가짜 API(`mocks/session.ts`)는 A17 · A16 만 로그인 상태를 보고, A22 · A25 는 늘 회원 응답이다. 로그인 · 나의 뉴스함 · 마이페이지가 전처럼 뜨고 콘솔 오류가 없는 것만 봤다
