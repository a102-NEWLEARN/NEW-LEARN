# F12 회원 · 관심 분야 — 북마크 · 관심 이슈 (A20 ~ A25)

계약 원본은 [API 공통 규칙 · 인증 · 내 상태 칸](../api.md), [A20 ~ A25 · 기사 요약 · A2](../api-screen.md), [bookmark · interest_issue](../data-model.md)다. 명세는 Jira S15P31A102-114 에서 프로토타입 v21 과 대조해 정했고(2026-10-26), 이 문서는 구현 티켓 63(북마크) · 64(관심 이슈)가 시험으로 지킬 기준만 둔다. 북마크 · 관심 이슈는 `docs/mvp-overview.md` 3-1 에 따로 번호가 없어 회원 기능 F12 아래에 둔다(번호는 PM 확인).

## 63 북마크

- AC-1: A20 `PUT /api/v1/members/me/bookmarks/{articleId}` 는 204 다. 같은 기사를 두 번 담아도 204 이고 `bookmark` 에는 한 줄, 담은 시각은 처음 그대로다
- AC-2: A21 `DELETE` 는 204 다. 안 담긴 기사를 빼도 204 다
- AC-3: A22 `GET /api/v1/members/me/bookmarks` 는 담은 기사를 쪽 없이 전부 `items` 로 준다. 담은 시각 최신순, 같으면 기사 `id` 내림차순. 항목은 기사 요약 + `bookmarked: true` + `bookmarkedAt`. 없으면 빈 `items`
- AC-4: 없는 기사 · 투입 전 기사를 A20 으로 담으면 404 `ARTICLE_NOT_FOUND`, 숫자가 아닌 `articleId` 는 400 `VALIDATION_FAILED`
- AC-5: A6 · A7 · A8 의 `bookmarked` 는 로그인한 회원이 담은 기사만 true, 다른 회원 · 손님에게는 false 다. 목록(A6 · A7)은 항목마다 따로 쿼리하지 않는다 — 쪽의 기사 id 를 모아 한 번에 찾는다

## 64 관심 이슈

- AC-6: A23 `PUT /api/v1/members/me/interest-issues/{issueId}` 는 204, 두 번 저장해도 한 줄. A24 `DELETE` 는 204, 저장 안 된 것도 204. 사건이 0개인 이슈도 저장할 수 있다
- AC-7: 없는 이슈를 A23 으로 저장하면 404 `ISSUE_NOT_FOUND`
- AC-8: A25 는 저장한 이슈를 쪽 없이 전부, 저장 시각 최신순(같으면 이슈 `id` 내림차순). 항목은 A2 이슈 카드 + `interested: true` + `interestedAt`
- AC-9: A2 · A3 의 `interested` 는 로그인한 회원이 저장한 이슈만 true, 다른 회원 · 손님에게는 false. A2 는 항목마다 따로 쿼리하지 않는다

## 둘 다

- AC-10: A20 ~ A25 를 세션 없이 부르면 401 `UNAUTHORIZED`, PUT · DELETE 에 CSRF 번호표가 없으면 403 `FORBIDDEN`
- AC-11: 다른 회원이 담은 것은 A22 · A25 와 `bookmarked` · `interested` 어디에도 보이지 않는다
- AC-12: 표는 새 마이그레이션으로 만든다(기본 키 · `on delete cascade` 는 `data-model.md`). 빈 DB 에 V1 부터 차례로 돌고 `ddl-auto: validate` 로 앱이 뜬다
- AC-13: Swagger 에 「회원」 태그와 `[확정] A20 ~ A25`, PUT · DELETE 는 응답 코드(204 · 401 · 403 · 404)까지 보인다(`docs/backend-convention.md` 8절)
