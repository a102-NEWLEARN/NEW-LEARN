# 화면을 끄면 로그아웃 — 탭 닫기 · 브라우저 닫기 · 30분 미사용

## 무엇을 / 왜
지금 로그인 세션은 쿠키 `Max-Age` 1일 · Redis 세션 만료 1일이라(Jira 62, `docs/api.md` 1절 「인증」) 화면을 닫아도 하루 동안 로그인이 남는다.
사용자가 「화면 끄면 바로 로그아웃」을 원했고, 탭을 닫으면 로그아웃 + 쿠키를 브라우저 세션 쿠키로 + 30분 동안 요청이 없으면 만료, 셋 다 하기로 골랐다(2026-11-17).
분야 브랜치 규칙(`docs/git-convention.md`)에 따라 백엔드 · 화면을 티켓 · 브랜치 · MR 둘로 나눈다. 둘은 서로 기다리지 않는다.

## 바꿀 파일

### MR 1 — backend (분야 브랜치 `backend` 로)
- `backend/src/main/resources/application.yaml`
  - `spring.session.timeout` · `server.servlet.session.timeout` 을 `1d` → `30m` 으로 바꾼다. Redis 세션은 요청이 올 때마다 마지막 사용 시각이 갱신되므로 「30분 동안 요청이 없으면」 만료다
  - `server.servlet.session.cookie.max-age` 를 뺀다 → `SESSION` 쿠키가 브라우저 세션 쿠키가 된다
  - 주석을 새 값과 이유로 고친다
- `backend/src/test/java/kr/io/newlearn/SessionCookieHttpTest.java` — `Max-Age=86400` 단언을 「`Max-Age` · `Expires` 가 없다」로 바꾼다(먼저 고쳐 빨개지는 것을 본다)
- `backend/src/test/java/kr/io/newlearn/MemberAuthApiIntegrationTest.java` — `sessionLivesInRedisForOneDay` 를 30분(TTL 1,700 ~ 1,800초)으로 바꾸고 이름도 고친다. 「하루」라고 적힌 주석 둘을 고친다
- 문서 — 같은 사실은 한 곳에만 두고 나머지는 가리킨다
  - `docs/api.md` 1절 「인증」 줄: 「하루 남는다 … 브라우저를 닫아도 하루는 남는다」 → 「브라우저를 닫거나 30분 동안 요청이 없으면 끝난다」. 표의 62 줄 「Redis 세션(하루)」도 고친다
  - `docs/specs/F12-member-auth-api.md` AC-8
  - `docs/api-screen.md` A14 `name` 줄의 「하루 동안 Redis 에 남아서」
  - `SSOT.md` 6절의 「가입은 세션을 열어 Redis 에 하루 남는다」와 결정 기록 표에 한 줄(날짜 · 사용자 요청 · 대가)

### MR 2 — frontend (분야 브랜치 `frontend` 로)
- `frontend/src/lib/tabLogin.ts`(새 파일) — 「이 탭에서 로그인했다」 표시
  - `sessionStorage` 키 `newlearn.tab-login` 을 두고 · 지우고 · 읽는다. 새로 고침에는 남고 탭을 닫으면 사라진다
  - `BroadcastChannel("newlearn.tab-login")` 으로 열려 있는 다른 탭에 「로그인한 탭 있나」 묻고 150ms 안에 답이 오면 표시를 넘겨받는다. 로그인한 탭에서 기사를 새 탭으로 열어도 로그아웃되지 않게 하는 장치다
  - 저장소 · 채널을 못 쓰는 브라우저면 지금처럼 로그인을 유지한다(막지 않는다)
- `frontend/src/api/members.ts` `fetchMe` — 회원이 왔는데 이 탭에 표시가 없고 다른 탭도 답이 없으면 `logout()`(A16)을 보내고 손님(`null`)을 돌려준다. 로그아웃이 실패해도 손님으로 보인다(서버 세션은 30분 뒤 끝난다)
- `frontend/src/pages/LoginPage.tsx` · `frontend/src/pages/SignupPage.tsx` — 성공하면 표시를 둔다
- `frontend/src/components/useLogout.ts` — 로그아웃하면 표시를 지운다
- `frontend/src/test/setup.ts` — 시험은 「늘 회원」 전제라(`src/mocks/session.ts` 주석) 시험마다 표시를 둔다
- 시험: `frontend/src/lib/tabLogin.test.ts`(새 파일) · `frontend/src/api/members.test.ts`
- 문서: `docs/api.md` 1절 「인증」 줄에 「화면은 탭을 닫으면 로그아웃한다 — `frontend/src/lib/tabLogin.ts`」 한 구절

## 작업 순서
- [ ] Jira 티켓 둘(백엔드 · 화면)을 연다 — 지난번에 권한에서 막혀 사용자에게 받거나 허용을 받는다
- [ ] backend: worktree 를 `origin/backend` 에서 따서 시험 먼저 → 설정 → 문서 — `backend` 시험 · 린트
- [ ] frontend: worktree 를 `origin/frontend` 에서 따서 시험 먼저 → 구현 → 문서 — `frontend` 시험 · 린트 · 빌드
- [ ] 화면 확인 후 각각 MR

접기 작업(`feat/frontend/stack-fold`, 커밋 전)은 지금 작업 폴더에 그대로 두고 건드리지 않는다. 그 계획 파일은 이 파일을 덮어써서, 승인된 내용 그대로 `docs/plans/2026-11-17-timeline-stack-fold.md` 로 다시 만든다.

## 안 바꿀 것
- 로그인 · 가입 · 로그아웃 API 의 동작과 응답, CSRF 번호표, 실패 잠금, `SecurityConfig` 의 주소별 허용
- 세션 저장소(Redis · Spring Session) 자체
- 세션 만료 뒤 로그인 화면으로 보내는 `SessionExpiredRedirect` — 30분 만료도 이 길을 그대로 탄다
- 가짜 API 화면(`dev:mock` · `dev:demo`) — 이미 열 때마다 손님이다

## 리스크
- 30분 동안 요청 없이 글만 읽으면 다음 동작에서 로그인 화면으로 간다. 사용자가 고른 대가다
- 새 탭은 다른 로그인 탭이 150ms 안에 답해야 로그인이 이어진다. 다른 탭이 백그라운드에서 멈춰 있으면(브라우저가 얼린 탭) 답을 못 해 새 탭이 로그아웃을 보내고, 열린 탭들도 같이 손님이 된다
- 맥에서 창만 닫고 Chrome 을 끝내지 않으면 쿠키는 남는다. 다음에 열 때는 탭 표시가 없어 화면이 로그아웃을 보내므로 결과는 로그아웃이다
- Chrome 「이전 탭 계속」으로 탭을 되살리면 `sessionStorage` 도 되살아나 로그인이 이어진다(30분이 지났으면 서버 세션이 이미 끝나 있다)
- 인증 코드다 — `AGENTS.md` 에 따라 사람이 최종 확인한다

## 어떻게 검증하나
- backend
  - `SessionCookieHttpTest` — `SESSION` 쿠키에 `Max-Age` · `Expires` 가 없다. 바꾸기 전 설정에서는 빨간 것을 본다
  - `MemberAuthApiIntegrationTest` — 가입 직후 Redis 세션 TTL 이 1,700 ~ 1,800초
  - `/verify` 로 `backend` 시험 · 린트 · 빌드
- frontend
  - `tabLogin.test.ts` — 표시 두기 · 지우기, 다른 탭이 답하면 넘겨받기, 답이 없으면 없음, 저장소가 막히면 막지 않음
  - `members.test.ts` — 표시가 있으면 회원 / 표시가 없고 다른 탭도 없으면 로그아웃 요청을 보내고 `null` / 다른 탭이 답하면 회원
  - `/verify` 로 `frontend` 포맷 · 린트 · 시험 · 빌드
- 실제로: 로컬 compose(backend · Redis)와 frontend 를 띄워
  1. 로그인 → 새로 고침해도 로그인
  2. 링크를 새 탭으로 열어도 로그인
  3. 탭을 다 닫고 다시 열면 손님
  4. 응답 헤더에 `SESSION` 쿠키 `Max-Age` 없음
  5. Redis `TTL spring:session:sessions:<id>` 가 1,800초 이하

## 되돌리는 법
- MR 마다 커밋을 `git revert` 한다. 데이터 · 마이그레이션은 없다
- backend 를 되돌리면 이미 받은 쿠키는 브라우저 세션 쿠키로 남는다. 다음 로그인부터 다시 하루 쿠키가 된다
- frontend 를 되돌리면 탭 닫기 로그아웃만 빠진다
