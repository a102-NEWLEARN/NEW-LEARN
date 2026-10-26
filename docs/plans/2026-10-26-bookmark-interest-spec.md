# Jira 114 — 북마크 · 관심 이슈 명세 (프로토타입 v21 대조)

## 무엇을 / 왜

북마크 · 관심 이슈를 MVP 에 넣기로 했는데(2026-10-26, `SSOT.md` 9절) 명세에 엔드포인트가 없어 구현 티켓 63 · 64(BE 팀원)가 시작하지 못한다. 프로토타입 v21 과 `origin/frontend` 를 대조해 엔드포인트 · 응답 · 표를 정하고, 문서만 고쳐 dev 로 바로 MR 한다(114 완료 기준). 코드는 안 바꾼다.

## 대조 결과 (조사 조수, 프로토타입 v21 · frontend)

- 북마크 버튼: 홈 최신 기사 · 기사 미리보기 · 마인드맵 머리 · 사건 패널 기사 줄 · 나의 뉴스함. 채워진 아이콘으로 상태 표시, 스낵바 「나의 뉴스함에 담았어요 / 뺐어요」
- 나의 뉴스함: 최근 담은 순, 분야 탭에 개수, 쪽 나누기 없음. 항목은 제목 · 언론사 · 발행 시각 · 해제 · 원문 보기
- 별표(관심 이슈): 사이드바 이슈 줄 · 이슈 머리. 목록은 마이페이지에만(이름 · 분야 · 사건 수 · 「새 사건 N」 — 새 사건은 보류). 홈 추천 카드는 별표한 이슈 먼저
- 손님이 누르면 로그인 창 → 로그인 뒤 이어서 담김(화면 몫). frontend 코드에는 아직 아무것도 없다(「곧 제공」 안내만)

## 정한 것 (2026-10-26 사용자 선택)

| 항목 | 정한 것 |
|---|---|
| 이름 | 「북마크」로 통일(UX 문서 `EXPERIENCE.md` 규칙). API · 표 `bookmark`, 문서 · 화면 「북마크」 · 「나의 뉴스함」. 관심 이슈는 「관심 이슈(별표)」 |
| 담기 · 빼기 | `PUT` · `DELETE` 로 겹쳐도 그대로(멱등). 이미 담은 것을 또 담아도, 안 담긴 것을 빼도 204 |
| 내 상태 표시 | 기존 응답에 칸을 더한다 — 기사 요약 공통 조각(A6 · A7 · A8 · A22)에 `bookmarked`, 이슈 카드(A2 · A25) · 헤더(A3)에 `interested`. 로그인한 회원 기준, 손님이면 `false` |
| 목록 | 나의 뉴스함 · 관심 이슈 목록 모두 쪽 나누기 없이 `items` 만, 최근 담은(저장한) 순. 분야 탭 · 개수는 화면이 센다. 많아지면 나중에 `page` 를 더해도 인자 없는 호출은 그대로 |
| 관심 이슈 항목 | A2 이슈 카드와 같은 모양 + `interestedAt` |

## 엔드포인트 (번호는 A19 다음)

| # | 엔드포인트 | 응답 · 오류 |
|---|---|---|
| A20 | `PUT /api/v1/members/me/bookmarks/{articleId}` 북마크 담기 | 204. 없는 · 투입 전 기사 404 `ARTICLE_NOT_FOUND`, 숫자 아닌 id 400 |
| A21 | `DELETE /api/v1/members/me/bookmarks/{articleId}` 빼기 | 204(안 담겨 있어도) |
| A22 | `GET /api/v1/members/me/bookmarks` 나의 뉴스함 | `{ items: [기사 요약 + bookmarkedAt] }`, 담은 시각 내림차순 · 같으면 기사 id 내림차순 |
| A23 | `PUT /api/v1/members/me/interest-issues/{issueId}` 관심 이슈 저장 | 204. 없는 이슈 404 `ISSUE_NOT_FOUND` |
| A24 | `DELETE /api/v1/members/me/interest-issues/{issueId}` 해제 | 204(저장 안 돼 있어도) |
| A25 | `GET /api/v1/members/me/interest-issues` 관심 이슈 목록 | `{ items: [A2 이슈 카드 + interestedAt] }`, 저장 시각 내림차순 · 같으면 이슈 id 내림차순 |

공통: 모두 로그인 필요(손님 401 — `SecurityConfig` 는 이미 `/members/me/**` 를 막는다), PUT · DELETE 는 CSRF 번호표(없으면 403). 새 오류 코드는 없다. 남의 것은 보이지 않는다(세션의 회원 기준).

## 표 (`docs/data-model.md`)

- `bookmark(member_id → member, article_id → article, created_at timestamptz not null)`, 기본 키 `(member_id, article_id)` — 같은 기사 두 번 담기 막음. 외래 키는 `on delete cascade`(기사 · 회원이 지워지면 같이)
- `interest_issue(member_id → member, issue_id → issue, created_at)`, 기본 키 `(member_id, issue_id)`, `on delete cascade` — 이슈가 지워지거나 합쳐져 사라지면 별표도 사라진다(한계로 적음)
- `last_visited_at` 은 만들지 않는다(「지난 방문 이후 새 사건」 보류). 목록 정렬용 인덱스는 두지 않는다(회원별 몇십 줄, 기본 키로 회원을 찾는다)
- 마이그레이션은 63 · 64 가 새 파일로 만든다. 번호는 만들 때 dev 의 가장 큰 번호 다음(113 이 V3 를 쓰면 V4)

## 바꿀 파일 (문서만)

- `docs/api-screen.md` — 1절 기사 요약에 `bookmarked`, A2 · A3 에 `interested`(JSON 예시도), 새 절 A20 · A21(담기 · 빼기 한 절) · A22 · A23 · A24(한 절) · A25. 500줄 안에 맞춘다
- `docs/api.md` — 1절 「인증」 로그인 필요 범위(A16 ~ A18 → + A20 ~ A25)와 「내 상태 칸」 한 줄, 2절 오류 흐름 그림 · 표의 범위, 3절 주소 지도 · 표에 A20 ~ A25, 4절 FE 질문 8번(이 모양 그대로 써도 되나), 5절 Jira 표 63 · 64 줄
- `docs/data-model.md` — ER 그림 점선 → 실선 · 칸(`last_visited_at` 뺌), 2절 「bookmark · interest_issue」 표 확정, 필요하면 6절 대조표
- `SSOT.md` 9절 — 결정 한 줄(이름 · 멱등 · 칸 추가 · 쪽 없음)
- 새 `docs/specs/F12-bookmark-interest-api.md` — 63 · 64 가 검증할 AC(아래 「어떻게 검증하나」의 기준), 기능 번호는 F12(회원이 저장한 것). mvp-overview 3-1 에 따로 번호가 없어 PM 확인 질문으로 남긴다
- 승인한 계획 사본 `docs/plans/2026-10-26-bookmark-interest-spec.md`
- Jira(문서 MR 과 별개): 63 · 64 제목 · 설명의 엔드포인트 · 할 일을 확정값으로(티켓 114 할 일 5번), 「기존 응답에 칸 추가」 일이 늘어 스토리 포인트 2 → 3. 114 에 MR 링크 댓글

## 안 바꿀 것

- 코드 · 마이그레이션(63 · 64 몫), 이미 만든 조회 API(A2 · A3 · A6 · A7 · A8)의 코드
- 「지난 방문 이후 새 사건」, 관심 이슈 알림, 북마크 개수 제한
- `docs/mvp-overview.md` · PRD(PM 확인 필요 팀 문서), UX 문서 `EXPERIENCE.md`(「나의 뉴스함 범위 미정 · 곧 제공」 줄은 FE · UX 몫 — 알리기만)
- 63 · 64 의 담당자 · 다른 칸

## 리스크

- **이미 만든 조회 API 다섯 개에 칸이 생긴다** → 63 · 64 구현이 A2 · A3 · A6 · A7 · A8 쿼리를 건드린다. 목록마다 한 번에 묶어 읽게(항목마다 쿼리 금지) AC 에 적고, SP 를 3 으로 올린다
- **로그인 여부로 응답이 달라진다** → 손님은 `false`. 지금 응답 캐시가 없어 문제는 없다. 캐시를 둘 때 쿠키별로 나눠야 한다고 1절에 적는다
- **목록에 쪽이 없다** → 한 사람 북마크가 수백 개를 넘으면 느려질 수 있다. 그때 `page` 를 더한다(호환)
- **FE 확인 전 머지** → 완료 기준이 「FE 담당 확인」이다. 문서는 머지하고 114 는 FE 답을 받은 뒤 완료로 옮긴다
- **이슈가 합쳐지면 별표가 사라짐**(cascade) → 한계로 데이터 모델에 적는다

## 어떻게 검증하나

- 문서 사이 대조: 새 번호 A20 ~ A25 가 api.md 3절 · api-screen · 스펙 · Jira 63 · 64 에서 같은지, `bookmarked` · `interested` 가 나오는 응답 목록이 같은지(grep)
- 바꾼 Mermaid 그림(ER · api.md 주소 지도 · 오류 흐름)을 렌더링해 오류 없는지(브라우저 창에서 mermaid.parse · render)
- 커밋 게이트(시크릿 · 문서 크기 — api-screen 500줄 안) 통과
- reviewer 조수: 프로토타입 대조와 문서끼리 어긋남, 63 · 64 가 이 문서만 보고 시작할 수 있나
- 스펙 AC(63 · 64 가 시험으로 지킬 것): ① A20 204 · 두 번 담아도 한 줄 · 담은 시각 유지 ② A21 204 · 안 담긴 것도 204 ③ A22 최근 담은 순 전부 · 항목 모양 ④ 없는 · 투입 전 기사 404 ⑤ A23 ~ A25 같은 규칙 · 없는 이슈 404 ⑥ 손님 401 · 번호표 없는 PUT · DELETE 403 ⑦ A6 · A7 · A8 `bookmarked`, A2 · A3 `interested` — 담은 회원만 true, 손님 false, 목록에서 항목마다 쿼리하지 않음 ⑧ 남의 것은 안 보임

## 되돌리는 법

- 문서 MR 을 Revert(dev). 코드 · 표 변경이 없어 사이트 영향 없음
- Jira 63 · 64 는 바꾸기 전 제목 · 설명 · SP 를 댓글에 남겨 두고 되돌릴 수 있게 한다
- 🔴 되돌릴 수 없는 것: 없음

## 흐름

브랜치 `docs/backend/S15P31A102-114-bookmark-interest-spec` ← `origin/dev` → 커밋 → reviewer → MR(→ dev, 문서만) → 머지 직전 원격 dev · 열린 MR 확인 → 머지 → 분야 브랜치 맞추기 → Jira 63 · 64 고치기 · 114 댓글 → 하린님 · FE 에 보낼 메시지 초안

## 하면서 달라진 것 (2026-10-26)

- 리뷰(reviewer 조수)로 더한 것: 동시에 두 번 담을 때를 위해 `insert … on conflict do nothing` 을 명세 · 데이터 모델에 적고 AC-1 · 6 에 동시 요청 기준, AC-13 의 응답 코드를 PUT · DELETE · GET 으로 나눔, api.md 머리의 범위(A25) · 기능 이름(F12 회원 · 관심 분야), 사건 0개 이슈 카드 · 캐시 문구 · 관계 다중성 · cascade 까닭
- 계획의 「바꿀 파일」에 없던 `docs/glossary.md` 에 북마크 · 나의 뉴스함 · 관심 이슈(별표) 줄을 더함 — 관심 분야와 헷갈리기 쉬워서
- api.md · data-model.md 머리에 v1.2(Jira 114) 줄
