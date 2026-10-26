# S15P31A102-103 프론트 사전 설정

## 무엇을 / 왜

화면 개발 전에 한 번만 해 두면 되는 설정을 묶어 끝낸다. 백엔드 API 코드가 아직 없어서(컨트롤러 0개) 가짜 API(MSW)로 화면을 만들고, 오류 · 목록 응답을 `docs/api.md` v1 모양대로 받는 클라이언트를 둔다.
EXPERIENCE.md 는 10-20 · 10-21 팀 회의와 프로토타입 v19 에 맞춘다. 지금 문서대로 셸을 만들면 헤더 · 주소가 틀린다(카테고리 7개, URL 분석, 로그인 없음).

## MR 두 개

문서와 코드는 들어가는 브랜치가 달라서 나눈다. 티켓은 하나다.

| MR | 브랜치 (`git nb`) | 대상 | 담는 것 |
| --- | --- | --- | --- |
| 1 | `docs/common/S15P31A102-103-experience-v19` | `dev` | 프로토타입 v19, EXPERIENCE.md 갱신, `.memlog.md` |
| 2 | `chore/frontend/S15P31A102-103-frontend-setup` | `frontend` | 코드 설정 다섯 가지, 이 계획 파일 |

## 바꿀 파일

**MR 1 — 문서**
- `docs/prototype/NEW-LEARN 프로토타입 v19.html` — 사용자가 넣은 파일을 그대로 커밋한다
- `_bmad-output/planning-artifacts/ux-designs/ux-S15P31A102-2026-10-15/EXPERIENCE.md` — 아래 「EXPERIENCE.md 에서 바꿀 것」
- 같은 폴더 `.memlog.md` — 결정과 까닭

**MR 2 — 코드** (`frontend/` 아래)
- `tsconfig.app.json` — 별칭 `@/*` → `./src/*`, `types` 에 `msw/vite/client`. Vite 는 `resolve.tsconfigPaths: true` 라 따로 설정하지 않는다
- `README.md` (새) — 폴더 규칙, 가짜 API 켜는 법
- `vite.config.ts` — `msw()` 플러그인(`msw/vite`). 개발 서버에서만 워커를 내주고 빌드 결과에는 안 들어간다
- `package.json` · `package-lock.json` — `msw` 3.0.3(dev), `@karrotmarket/react-monochrome-icon` 1.30.0, 스크립트 `"dev:mock": "vite --mode mock"`
- `src/main.tsx` — `import.meta.env.MODE === "mock"` 이면 `virtual:msw` 로 가짜 API 를 켠 뒤 그린다. QueryClient 는 `createQueryClient()`
- `src/api/client.ts` — 기본 주소 `/api/v1`, 응답 오류를 `ApiError` 로 바꾸는 interceptor
- `src/api/error.ts` (새) — `ProblemDetail` 타입(api.md 2절: type · title · status · detail · instance · code · errors[field, reason]), `ApiError`(status · code · errors, 서버에 닿지 못하면 status null), `toApiError()`
- `src/api/types.ts` (새) — `Page<T>`(items · page · size · totalElements · totalPages), `ItemList<T>`(items 만)
- `src/api/query-client.ts` (새) — `createQueryClient()`. 4xx 는 다시 부르지 않고, 5xx · 연결 실패는 한 번만 다시 부른다
- `src/api/categories.ts` (새) — A1 `GET /categories` 호출 함수 · `Category` 타입 · query key
- `src/mocks/handlers.ts` (새) — A1 핸들러. 코드 · 이름은 `data-model.md` 의 다섯 개(제안), 순서는 mvp-overview 2-1, 개수는 가짜 값이라고 주석에 적는다
- `src/mocks/node.ts` (새) — 테스트용 `setupServer`
- `src/test/setup.ts` — 테스트마다 `cleanup`, MSW 서버 `listen({ onUnhandledFrame: "error" })` · `resetHandlers` · `close`
- `src/test/render.tsx` (새) — `renderWithProviders(ui, { route })`: 재시도 없는 QueryClient + `MemoryRouter`
- `src/App.tsx` — 개발 확인 화면에 A1 카테고리 이름을 보여 준다(완료 기준 2). 헬스 확인은 `baseURL: "/"` 로 덮어 `/actuator/health` 를 그대로 부른다. *다시 확인* 버튼에 아이콘(`IconArrowClockwiseCircularLine`, SEED `PrefixIcon`)
- import 를 `@/` 로: `main.tsx` · `App.tsx` · `App.test.tsx` · `components/Logo.tsx`
- 테스트 (새): `src/api/error.test.ts`, `src/api/query-client.test.ts`, `src/api/categories.test.ts`. `src/App.test.tsx` 는 `vi.mock` 대신 MSW 핸들러와 `renderWithProviders` 로
- `docs/plans/2026-10-22-frontend-setup.md` — 이 계획 파일을 이름만 바꿔 커밋한다

**폴더 규칙 (README 에 적을 것)**

| 폴더 | 무엇 |
| --- | --- |
| `src/pages/` | 주소 하나에 화면 하나 (`HomePage.tsx`) |
| `src/components/` | 여러 화면이 같이 쓰는 컴포넌트 (셸 · 상태 · `Logo`) |
| `src/api/` | 클라이언트 · 오류 · 목록 타입, 엔드포인트마다 파일 하나(호출 함수 · 타입 · query key) |
| `src/mocks/` | MSW 핸들러 · 가짜 데이터 |
| `src/stores/` | Zustand. 서버 데이터는 넣지 않는다(TanStack Query 몫) |
| `src/test/` | 테스트 설정 · 도우미 |
| `seed-design/ui/` | SEED CLI 가 내려받는 컴포넌트. 손대지 않는다 |

테스트는 대상 파일 옆에 `*.test.ts(x)` 로 둔다(지금 `App.test.tsx` 와 같다).

## EXPERIENCE.md 에서 바꿀 것

기준은 mvp-overview · api.md v1(10-21) · 프로토타입 v19 다. 기능 범위는 mvp-overview 가 이긴다(stack.md §7). 그래서 v19 에 있어도 MVP 가 「추후」 · P2 로 둔 것은 「추후」로 적는다: 노드 상세 카드와 원문 근거, 논점 · 관점, 지난 방문 이후 새 사건, 변화 목록.

**사용자가 정한 것 (2026-10-22)**
- 손님은 둘러보기 전에 로그인한다 (v19). 팀 문서(mvp-overview F12 · api.md 1절 「둘러보기는 로그인 없이」)와 달라서 미정 표에 「팀 · PM 확인」으로 올린다. API 는 그대로 로그인 없이 열려 있고 화면만 막는다
- 분야 탭은 7개, 스포츠 · 문화/연예는 「준비 중」으로 잠근다 (v19). A1 은 다섯 개만 주므로 화면이 두 개를 덧붙인다. 이것도 팀 확인으로 올린다
- 회원 화면은 주소를 준다: `/login?next=<보던 주소>` · `/signup?next=` · `/me`. 생김새는 v19 전체 화면

| 절 | 바꿀 것 |
| --- | --- |
| 머리 · Foundation | 범위를 F01~F04 · F06~F08 · F11 + 제안 F12 회원 · 관심 분야 · F13 용어사전으로. F05 노드 상세 및 근거 확인은 추후. 기준 프로토타입 v19. 「로그인이 없다」 → 회원이 있다(제안) |
| IA 주소 표 | 지움: URL 입력 모달 · `/analyze/:jobId` · 노드 패널 `?node=`. 더함: 로그인 · 가입 · 마이페이지(관심 분야 바꾸기 · 로그아웃) · 용어사전 창(주소 없음). 홈은 분야 탭 7개(2개 잠금), 「새로운 이슈」 3개(A2 `sort=createdAt`), 추천 이슈(관심 분야 탭을 앞에, 별표, 탭마다 이슈 3개, *관심사 편집* → `/me`), 최신 기사(전체 + 분야 탭, 8개 + *더 보기*). 기사 마인드맵은 흐름지도(기본) · 마인드맵 탭, 고른 보기를 `?view=map` 으로 남긴다 `[가정]`. 나의 뉴스함은 범위 미정이라 「곧 제공」 그대로 |
| 이동 규칙 | 손님이 앱 화면을 열면 `/login?next=` 로. 앱이 뜰 때 A17 이 401 이면 손님. 그 밖의 401 도 `/login?next=` 로, 로그인 · 가입을 마치면 `next` 로 돌아간다. 이미 로그인했는데 `/login` · `/signup` 을 열면 `/home` `[가정]` |
| 앱 셸 | 헤더 오른쪽은 나의 뉴스함 · 마이페이지 (v19, *마인드맵 만들기* 지움). 용어사전은 오른쪽 아래 떠 있는 버튼과 창. 랜딩 · 로그인 · 가입에서는 숨기고, 오른쪽 패널이 열리면 그만큼 비킨다. 오른쪽 패널은 사건 패널 하나 |
| Voice and Tone | URL 분석 예 · 「마인드맵 만들기」 · 근거 위치 행 지움. 「`detail` · `message`」 → `detail` 만(api.md 2절), `errors[].reason` 은 그대로 보인다. AI 생성 표시는 NewsData 요약에도. 마인드맵 가지 이름 표(`CORE` 핵심 내용 / 무슨 일이? …)를 더한다 |
| Component Patterns | URL 입력 모달 · 원문 근거 행 지움. 분야 탭(잠긴 탭을 누르면 「…는 준비 중입니다」), 필터 칩은 P1, 기사 행은 `mindmapStatus` 로 *마인드맵 보기* · 「분석 중」을 가른다, 사건 노드는 레인 두 개(메인 흐름 · 서브 흐름)와 호버 툴팁(포커스에도 같은 내용 `[가정]`). 더함: 로그인 · 가입 폼(v19 입력 오류 문구, 서버 `errors[].reason`), 관심 분야 칩(1개 이상, 잠긴 두 개는 못 고름), 용어사전 창(결과 3개까지, Esc · 접기로 닫음) |
| State Patterns | URL 분석 표 · 근거 없음 지움. 마인드맵 상태는 `mindmapStatus` 로 다시 쓴다(`QUEUED` 「분석 중」, `FAILED` 문구 미정). 더함: `LOGIN_FAILED` · `LOGIN_ID_TAKEN` · 용어사전 빈 결과 · `DICTIONARY_UNAVAILABLE` 「지금은 찾을 수 없어요」 · 관련 기사 없음 「아직 이 사건을 다룬 기사가 없어요.」, 토스트(「로그인했어요」 · 「가입을 마쳤어요」 · 「관심사를 저장했어요」) |
| Interaction · Accessibility | Esc 순서에 용어사전 창을 넣는다. 「분석 완료 알림」 지움. 용어사전 단축키는 없다(v19, MVP 개요의 「단축키나 버튼」 중 버튼) |
| Key Flows | 사쿠: 랜딩 → 로그인 → 홈(관심 분야 탭) → 이슈 → 사건 패널. 요섭: 홈 최신 기사 → 기사 마인드맵(흐름지도) → *이 기사가 속한 이슈 보기*. URL 입구 지움. 핵심 순간은 여전히 미정 |
| 아직 정하지 않은 것 | 지움: URL 분석 실패 뒤 갈 곳, F04 배치. 더함: 로그인 먼저 · 7개 탭(팀 확인), 나의 뉴스함 범위(SSOT 8절), 메인 · 서브 레인을 나누는 기준, 두 보기 이름(가제), F05 가 오기 전 노드를 누르면 무엇을 하나, 로그아웃 뒤 갈 곳(v19 문구 「둘러보기는 계속할 수 있어요」가 로그인 먼저와 맞지 않음), 사건 패널 관련 기사 수(v19 5건 · api-screen A6 4건), `loginId` 에 쓸 수 있는 글자 |

user-flow.md 는 10-20 전 그대로라 낡았다. 이번에는 고치지 않고 MR 에 적는다.

## 작업 순서

MR 1
- [x] `docs(common)`: 프로토타입 v19 를 넣음 — `b8ec6f9`
- [x] `docs(common)`: EXPERIENCE.md 를 10-20 · 21 회의와 프로토타입 v19 에 맞춤 — `2b63015`. 검토 반영은 커밋을 나눴다: `cf8c539` (구조 12건 · 문장 15건)

MR 2 (새 동작은 실패하는 테스트부터)
- [x] `chore(frontend)`: import 를 `@/` 로 쓰고 폴더 규칙을 README 에 적음 — `d763af7`. 빌드 · 기존 테스트 28개 통과
- [x] `test(frontend)`: 테스트마다 화면을 지우고 Query · 라우터를 감싼 render 도우미를 둠 — `ff223e8`. 지우기 전에 「banner 가 여러 개」로 실패하는 것을 먼저 봤다
- [x] `feat(frontend)`: API 오류를 ApiError 로 바꾸고 4xx 는 다시 부르지 않음 — `2938791`. 계획에 없던 `client.test.ts`(interceptor 확인)를 더했다
- [x] `chore(frontend)`: MSW 가짜 API — A1 핸들러, `dev:mock`, 테스트 서버 — `416aefe`. jsdom 의 axios 요청도 상대 주소 그대로 가로챈다 (리스크 1 해소)
- [x] `chore(frontend)`: SEED 아이콘 패키지를 넣음 — `a0365e5`
- [x] `feat(frontend)`: 개발 확인 화면에 A1 카테고리를 보여 줌 — `6570a3e`. 헤드리스 Chrome 으로 `dev:mock` 화면을 열어 「카테고리: 정치 · 사회 · 경제 · 국제 · IT·과학」과 `[MSW] Mocking enabled` 를 확인했다. `npm run dev` 에서는 MSW 가 켜지지 않는다

## 안 바꿀 것

- 화면 기능(앱 셸 · 홈 · 이슈 화면 · 회원 화면) — S15P31A102-31 · 44 · 66 에서
- A1 말고 다른 가짜 핸들러 — 그 화면 티켓에서 더한다
- 401 이면 로그인 화면으로 보내기, 로그인 상태 — 회원 화면 티켓(-66)에서
- `npm run dev` 의 동작, compose · Dockerfile · CI — 가짜 API 는 `dev:mock` 에서만 켜진다
- `seed-design/` 아래 SEED CLI 파일, `newlearn-theme.css`, DESIGN.md
- 이미 있는 프로토타입 HTML, `docs/user-flow.md` · PRD · AGENTS.md (낡은 곳은 보고만 한다)

## 리스크

- **MSW 가 jsdom 의 XMLHttpRequest(axios) 를 가로채는지 문서에 없다.** `categories.test.ts` 를 먼저 짜서 바로 확인한다. 안 되면 멈추고 다시 승인받는다 (대안: 테스트에서만 axios `fetch` 어댑터 + 절대 주소)
- **MSW 3 은 9월 말에 나온 새 판이다.** `virtual:msw` 에 「처리하지 않은 요청」 경고 옵션이 문서에 없다. 개발 서버 콘솔이 시끄러우면 같은 MR 안에서 `worker-only` 모드 + `setupWorker` 로 바꾼다
- **기본 주소를 `/api/v1` 로 바꾸면 헬스 확인이 깨진다.** 그 호출만 `baseURL: "/"` 로 덮고 `App.test.tsx` 가 잡는다
- **`npm run dev` 로 띄우면 가짜 API 가 꺼져 있어 화면이 빈다** (백엔드가 아직 없다). README 첫 줄에 `dev:mock` 을 적는다
- Firefox 는 서비스 워커가 XHR 을 못 가로챈다(MSW 문서). 지원 브라우저가 Chrome · Edge 라 영향 없다

## 어떻게 검증하나

- **완료 기준 1 (EXPERIENCE.md):** 바뀐 행마다 출처(mvp-overview · api · api-screen · v19)를 달고 원문과 대조한다. bmad-review structure · prose 를 돌린다
- **완료 기준 2 (가짜 API):** 자동 — `App.test.tsx` 가 MSW 로 A1 을 받아 카테고리 이름을 찾는다. 화면 — `npm run dev:mock` 을 띄워 첫 화면에 카테고리 다섯 개가 뜨는지 본다. 직접 띄우지 못하면 사용자에게 확인을 부탁하고 그렇다고 적는다
- **완료 기준 3:** `frontend/` 에서 `npm run format:check` · `npm run lint` · `npm test` · `npm run build` (stack.md §3) 를 돌려 통과와 테스트 수를 남긴다. 끝나면 `/verify`

## 되돌리는 법

MR 별로 revert 한다. MR 2 는 대부분 새 파일이고 의존성은 `package-lock.json` 과 함께 되돌아간다. 데이터 · 배포 · 인증에 닿는 것은 없다.
