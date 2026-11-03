# S15P31A102-132 Swagger API 연결 — 호출 함수 · 타입 · 가짜 응답

## 무엇을 / 왜

backend 에는 Swagger(`/v3/api-docs`)에 화면용 API 16개가 있다. frontend 에는 그중 7개(A1~A6 · A17)만 연결돼 있다. 나머지 9개는 이렇다.
- 기사: A7 최신 기사 · A8 기사 상세 · A9 마인드맵
- 회원: A14 가입 · A15 로그인 · A16 로그아웃 · A18 관심 분야
- 북마크: A20 · A21 담기 · 빼기, A22 나의 뉴스함

이 9개의 **API 층**(호출 함수 · 타입 · 가짜 응답 · 테스트)을 만든다. 그러면 화면 티켓(-45 · -58 · -66 · -67 · -69)이 화면만 짜면 된다. 오늘 할 -58 기사 마인드맵이 A8 · A9 를 바로 쓴다.

이미 연결한 7개는 Swagger 와 대조했다(2026-10-29). 필드 이름과 모양이 맞아 손대지 않는다.

## 정한 것

| 무엇 | 정한 값 | 근거 |
| --- | --- | --- |
| 티켓 · 브랜치 | 새 Jira 「[FE] Swagger API 연결 — 호출 함수 · 타입 · 가짜 응답」. 상위는 -27 개발 기반·검증, 라벨은 `fe` · `newlearn-mvp`, 담당은 본인. 브랜치 `feat/frontend/S15P31A102-132-swagger-api` 를 origin/frontend 에서 딴다. MR 은 frontend 로 보내고, 본문에 화면 티켓 다섯 개를 적는다 | 사용자 선택 (2026-10-29) |
| 파일 나누기 | 지금 규칙(목록 · 하나 · 하위를 파일로 나눔)을 따른다. `articles.ts`(A7) · `article.ts`(A8) · `mindmap.ts`(A9) · `auth.ts`(A15 · A16) · `members.ts` 에 더함(A14 · A18) · `bookmarks.ts`(A20~A22) | `issues.ts` · `issue.ts` · `timeline.ts` 와 같은 모양 |
| 조회(GET) | `fetchX` 함수 + `xQuery` queryOptions. 키는 `["articles", params]` · `["article", id]` · `["article", id, "mindmap"]` · `["members", "me", "bookmarks"]` | 지금 키 모양(`["issue", id, "timeline"]` 등) |
| 바꾸기(POST · PUT · DELETE) | 함수만 둔다. `useMutation` 과, 성공한 뒤 어떤 캐시를 새로 고칠지(`meQuery` 등)는 화면 티켓이 정한다 | `members.ts` 주석 — 「로그인 · 로그아웃할 때(-66) 이 쿼리를 새로 고친다」 |
| CSRF | 헤더를 붙이는 코드를 쓰지 않는다. axios 기본값(`XSRF-TOKEN` 쿠키 → `X-XSRF-TOKEN` 헤더, 같은 출처만)이 backend 이름과 같다. 이 동작이 깨지지 않게 테스트로 지킨다 | `docs/api.md` 1절 「인증」, backend `SecurityConfig` |
| 빈 값(null) | Swagger 는 모든 칸을 「없어도 됨」으로 낸다(springdoc 기본값). 그래서 null 이 될 수 있는 칸은 `docs/api-screen.md` 를 따른다 | api-screen 이 계약 원본(`docs/api.md` 1절) |
| 가짜 응답 | 상태를 기억하지 않는다. 로그인 · 가입은 늘 성공하고, 담기 · 빼기는 바뀐 뒤 상태만 돌려준다. 없는 id 는 404 를 명세대로 준다. 그 밖의 오류(401 · 409 · 429 등)는 테스트에서 `server.use` 로 바꿔 본다 | `members.test.ts` 와 같은 방식. 핸들러를 테스트끼리 같이 써서, 상태를 두면 테스트 사이에 샌다 |
| 가짜 기사 | A13 검색용 기사 8개(401~408)를 기사 요약 모양으로 채워 A7 목록에 합친다. 사건 기사(`articlesOf`)도 A7 · A8 · A9 가 같이 쓴다. 그래서 사건 패널 · 검색에서 기사를 눌러도 `dev:mock` 에서 열린다 | `handlers.ts` 주석 — 「기사 목록(A7) 가짜가 생기면 그쪽과 합친다」 |

## 바꿀 파일

- `frontend/src/api/types.ts` — `IssueRef` 를 더한다 (A8 이 쓴다)
- `frontend/src/api/articles.ts` 🆕 — A7 `fetchArticles({ category, page, size })` · `articlesQuery`
- `frontend/src/api/article.ts` 🆕 — A8 `fetchArticle(id)` · `articleQuery`. 타입은 `ArticleDetail`(기사 요약 + `reporter` · `eventMatchStatus` · `event` · `issue`)과 `EventMatchStatus`
- `frontend/src/api/mindmap.ts` 🆕 — A9 `fetchMindmap(id)` · `mindmapQuery`. 타입은 `Mindmap` · `MindmapBranch` · `BranchType`(`CORE` · `CAUSE` · `REACTION` · `OUTLOOK`)
- `frontend/src/api/auth.ts` 🆕 — A15 `login({ loginId, password })` → `Member`, A16 `logout()`
- `frontend/src/api/members.ts` — A14 `signUp({ loginId, password, name, categoryCodes })` → `Member`, A18 `changeCategories(categoryCodes)` → `Member`
- `frontend/src/api/bookmarks.ts` 🆕 — A20 `addBookmark(id)` · A21 `removeBookmark(id)` → `BookmarkState`, A22 `fetchBookmarks()` · `bookmarksQuery` → `BookmarkItem[]`
- 위 파일마다 `*.test.ts` (새로 만들거나 더함)
- `frontend/src/api/client.test.ts` — POST 에 `X-XSRF-TOKEN` 이 붙는지
- `frontend/src/mocks/handlers.ts` — 새 주소 9개의 가짜 응답과 가짜 기사 합치기
- `frontend/README.md` — 머리 문장 「백엔드 API 가 아직 없어서 `dev:mock` 으로 띄운다」가 낡았다. 진짜 서버로 띄우는 법(`npm run dev`, 배포 서버면 `API_PROXY_TARGET`)을 「가짜 API」 표에 한 줄 더한다
- `docs/plans/2026-10-29-swagger-api.md` — 이 계획 (승인 뒤 지금 파일 이름을 바꾼다)

## 작업 순서

각 줄은 실패하는 테스트를 먼저 쓰고 단언에서 빨간 것을 본 뒤 구현한다.

- [x] `feat(frontend)`: A7 최신 기사를 부르는 함수와 가짜 응답 — `cbe007a` — 최신순 · 분야 거르기 · 없는 분야 404 `CATEGORY_NOT_FOUND` · 쪽 나누기. 검색 테스트가 그대로 통과하는지
- [x] `feat(frontend)`: A8 기사 상세 · A9 마인드맵을 부르는 함수와 가짜 응답 — `877e8ba` — 이슈가 있는 기사 · 이슈로 아직 안 묶인 기사(`issue` null) · 분석 중(`QUEUED`) 기사의 A9 404 `MINDMAP_NOT_FOUND` · 없는 기사 404 `ARTICLE_NOT_FOUND` · 내용 있는 가지만 오는지
- [x] `feat(frontend)`: A14 가입 · A15 로그인 · A16 로그아웃 · A18 관심 분야 — `19c7dbc` — 보내는 본문이 명세 모양인지, 가짜 응답, `server.use` 로 400 `VALIDATION_FAILED`(`errors`) · 401 `LOGIN_FAILED` · 409 `LOGIN_ID_TAKEN` · 429 `TOO_MANY_REQUESTS` 가 `ApiError` 의 status · code 로 오는지. CSRF 헤더 테스트도 이 커밋에
- [x] `feat(frontend)`: A20 · A21 북마크 담기 · 빼기, A22 나의 뉴스함 — `30d3ae9` — 담기 · 빼기 응답, 401, A20 404, 뉴스함 항목에 `bookmarkedAt`
- [x] `docs(frontend)`: README 에 진짜 서버로 띄우는 법 — `ce79016`
- [x] 진짜 서버 확인 (아래 「진짜 서버 확인 결과」) — 2026-10-29 표의 기대와 모두 같았다
- [x] `reviewer` 조수 리뷰 — 꼭 고칠 것 0건, 선택 9건 · 확인 필요 2건. 리뷰어가 backend Controller · DTO 와 9개의 주소 · 메서드 · 본문 칸 · null 여부를 대조했고 모두 맞았다. 고친 것은 `8bf323b`
  - (선택 1) 가짜 회원의 뉴스함(A22)에 든 기사가 A6 · A7 · A8 에서 `bookmarked: false` 였다 → 기사 응답이 뉴스함 표를 따른다. 사건 패널 테스트가 11901 을 담기지 않은 기사로 봐서 뉴스함은 11902 로 바꿈
  - (선택 3) 빈 분야 코드 404 테스트, (선택 9) 번호표가 바뀐 뒤 새 값을 싣는 테스트, 뉴스함 기사가 상세에서도 담긴 것으로 오는 테스트 — 셋 다 고친 코드를 되돌리면 단언에서 실패
  - (선택 4 · 6 · 8) 마인드맵 CORE 첫 잎 주석, 가짜 API 머리 주석, api-screen 규칙을 옮겨 적은 주석
  - (확인 필요) 진짜 서버 확인 — 리뷰를 맡긴 뒤에 결과를 이 파일에 적어서 리뷰어가 못 봤다. 아래 「진짜 서버 확인 결과」
- [x] `docs(plan)`: 이 계획을 남김

## 안 바꿀 것

- 화면 — 기사 마인드맵(-58) · 최신 기사(-45) · 로그인 · 가입(-66) · 북마크(-67) · 관심 분야(-69). 라우트도 그대로
- `useMutation` 훅, 캐시 새로 고침, 401 이면 로그인 창을 여는 흐름 — 화면 티켓 몫
- 이미 연결한 A1~A6 · A17 · A13 의 코드 (가짜 A13 의 기사 데이터를 A7 과 합치는 것만)
- Swagger 에 없는 API — A13 통합 검색, A19 용어사전, A23~A25 관심 이슈
- backend · `docs/api*.md` · EXPERIENCE.md · DESIGN.md
- 배포 서버에 데이터를 만드는 요청 (가입 성공 · 로그인 성공 · 북마크 담기 성공)

## 리스크

- **배포 서버의 쿠키가 `Secure` 다.** 개발 서버(http://localhost:5173)가 프록시로 받으면 Chrome 이 받아 주는지 확인해야 한다. Chrome 은 localhost 를 안전한 출처로 보지만, 번호표 쿠키가 안 남으면 POST 가 403 이 된다 → 그러면 멈추고 보고한다
- **틀린 로그인을 보내면 그 아이디의 실패 횟수가 하나 는다.** 없는 아이디를 아무렇게나 지어 한두 번만 보낸다. 10분 뒤 지워진다
- **`handlers.ts` 가 640줄에서 더 커진다.** 한 파일 규칙을 그대로 두고, 기사 가짜 데이터는 한 덩어리로 모은다
- **가짜 기사를 합치면 검색 테스트가 깨질 수 있다.** 401~408 의 id · 제목 · 요약은 그대로 두고, 기존 테스트가 통과하는지로 확인한다
- **Node 26 이 이 컴퓨터에 없다**(22.15 뿐). 로컬은 22.15 로 `npm ci` 하고 돌린다. CI 가 26 으로 다시 돈다

## 어떻게 검증하나

- `frontend/` 에서 포맷 검사 · 린트 · 테스트 · 빌드 (`.claude/stack.md` §3)
- 새 테스트 — 위 작업 순서의 줄마다. 가짜 응답이 `docs/api-screen.md` 의 모양 · 정렬 · 오류 코드대로인지 본다
- 되돌림 확인 — 둘을 깨서 해당 테스트가 실패하는지 본다
  - client 에 `withXSRFToken: false` 를 넣으면 CSRF 테스트가 실패한다
  - 가짜 A7 의 최신순 정렬을 빼면 A7 테스트가 실패한다
- **진짜 서버 확인 (배포 서버, 읽기만)**
  - 준비: `API_PROXY_TARGET=https://newlearn.io.kr npm run dev` 로 띄우고, Chrome 으로 http://localhost:5173 을 연다
  - 부르는 법: 콘솔에서 `await import("/src/api/…")` 로 이번에 만든 함수를 그대로 부른다
  - 순서: A1 을 먼저 불러 번호표 쿠키를 받는다. 배포 서버는 지금 데이터가 0건이라 아래 결과를 기대한다

| 부르는 것 | 기대 | 확인하는 것 |
| --- | --- | --- |
| A1 `fetchCategories()` | 다섯 분야 · `XSRF-TOKEN` 쿠키 생김 | 번호표 받기 |
| A7 `fetchArticles()` | 빈 목록 `totalElements: 0` | 쪽 모양 |
| A8 · A9 `fetchArticle(1)` · `fetchMindmap(1)` | `ApiError` 404 `ARTICLE_NOT_FOUND` | 오류 변환 |
| A17 `fetchMe()` | `null` | 손님 |
| A22 `fetchBookmarks()` | 401 `UNAUTHORIZED` | 로그인 필요 |
| A14 `signUp({ loginId: "A", … })` | 400 `VALIDATION_FAILED` + `errors` (회원이 안 생긴다) | 번호표 통과 → 값 검사 |
| A15 `login({ 없는 아이디 })` | 401 `LOGIN_FAILED` | 번호표 통과 |
| A16 `logout()` · A18 `changeCategories(["economy"])` · A20 `addBookmark(1)` | 401 `UNAUTHORIZED` | 번호표 통과 → 로그인 검사 |
| 쿠키를 지우고 A16 | 403 `FORBIDDEN` | 번호표가 실제로 검사된다 |

  - 요청 머리에 `X-XSRF-TOKEN` 이 붙었는지는 Network 탭에서 본다
  - 결과 출력은 MR 본문에 붙인다
- 리뷰: `reviewer` 조수

## 되돌리는 법

MR 을 revert 한다. 새 함수는 아직 아무 화면도 쓰지 않아서 화면 동작이 바뀌지 않는다. 가짜 A13 기사 데이터만 옛 모양으로 돌아간다. 데이터 · 배포 · 인증 설정과는 상관없다. Jira 티켓은 「하지 않음」으로 닫는다.

## 진짜 서버 확인 결과 (2026-10-29)

`API_PROXY_TARGET=https://newlearn.io.kr npx vite --port 5174` 로 띄웠다. 5173 은 이미 다른 개발 서버가 쓰고 있어 건드리지 않았다.
헤드리스 Chrome(별도 프로필)으로 `/home` 을 연 뒤, 페이지 안에서 `await import("/src/api/…")` 로 함수를 그대로 불렀다.
요청 머리는 DevTools 프로토콜 `Network.requestWillBeSent` 로 봤다.

```
A1 fetchCategories()               → "politics,economy,society,world,it_science"
XSRF-TOKEN 쿠키                      → "있음"   (Secure · SameSite=Lax 인데 localhost 에서 받아 줌)
A7 fetchArticles()                 → {"page":0,"size":20,"totalElements":0,"items":0}
A8 fetchArticle(1)                 ✕ {"status":404,"code":"ARTICLE_NOT_FOUND"}
A9 fetchMindmap(1)                 ✕ {"status":404,"code":"ARTICLE_NOT_FOUND"}
A17 fetchMe()                      → null
A22 fetchBookmarks()               ✕ {"status":401,"code":"UNAUTHORIZED"}
A14 signUp(규칙에 안 맞는 값)        ✕ {"status":400,"code":"VALIDATION_FAILED","errors":[name · password · categoryCodes · loginId 4칸]}
A15 login(없는 아이디)              ✕ {"status":401,"code":"LOGIN_FAILED"}
A16 logout()                       ✕ {"status":401,"code":"UNAUTHORIZED"}
A18 changeCategories([economy])    ✕ {"status":401,"code":"UNAUTHORIZED"}
A20 addBookmark(1)                 ✕ {"status":401,"code":"UNAUTHORIZED"}
A21 removeBookmark(1)              ✕ {"status":401,"code":"UNAUTHORIZED"}
쿠키를 지우고 A16 logout()          ✕ {"status":403,"code":"FORBIDDEN"}

요청 머리: POST · PUT · DELETE 6건 모두 X-XSRF-TOKEN 있음, 쿠키를 지운 마지막 POST 만 없음
```

번호표가 붙은 요청은 CSRF 검사를 지나 값 검사(400) · 로그인 검사(401)까지 갔고, 번호표가 없는 요청만 403 이었다. 회원 · 북마크는 만들지 않았다.

## 하지 않은 것 · 남은 것

- **가짜 A1 분야 순서가 진짜와 다르다.** 진짜는 정치 · 경제 · 사회 · 국제 · IT·과학(`sort_order`), 가짜는 정치 · 사회 · 경제 · … (`docs/mvp-overview.md` 2-1 을 따랐다는 주석). A1 은 이번 범위 밖이라 그대로 두었다. 가짜 A14 · A18 의 관심 분야 순서도 가짜 A1 순서를 따른다 — 홈 탭 테스트가 이 순서에 기대는지 보고 고칠지 정한다
- **부하가 높으면 테스트가 흔들린다.** load average 15 ~ 24 일 때 전체 테스트에서 화면 테스트 9개(이번에 손대지 않은 것)가 기본 제한 시간 5초를 넘겨 실패했고, API 테스트도 5번 중 1번 8개가 실패했다. 부하가 8 아래로 내려간 뒤에는 337개가 두 번 연속 통과했다. 이 사실을 `SSOT.md` 8절(못 정한 것)에 올릴지 사용자에게 묻는다
- 로컬은 Node 22.15 로 돌렸다(26 이 없다). `npm ci` 가 jsdom 등에 EBADENGINE 경고를 낸다. CI 는 26 이다
- 화면 · `useMutation` · 캐시 새로 고침 · 401 이면 로그인 창 — 화면 티켓(-45 · -58 · -66 · -67 · -69)
- **사람이 최종 확인할 것** — AGENTS.md 「인증 · 권한 코드」. `frontend/src/api/auth.ts`(A15 · A16)와, CSRF 를 axios 기본값에 맡기고 테스트로만 지키는 결정
- 리뷰에서 남긴 것
  - (선택 2) `articlesQuery` 는 보통 쿼리다. 홈 최신 기사는 *더 보기* 로 쪽을 붙여서(EXPERIENCE) -45 는 infinite 쿼리가 필요할 수 있다. 같은 키 `["articles", …]` 로 모양이 다른 쿼리를 두 개 두면 캐시가 부딪치니, -45 에서 이 쿼리를 바꾸거나 키를 나눈다
  - (선택 5) 402 의 사건 902 는 A5 가짜에 없다 — -58 이 사건 링크를 그릴 때 더한다
  - (선택 7) `event.ts` 의 이슈 참조를 새 `IssueRef` 로 — 이번엔 A5 코드를 안 바꾸기로 해서 다음에

