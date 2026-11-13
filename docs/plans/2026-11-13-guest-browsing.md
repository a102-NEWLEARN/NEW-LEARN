# Jira S15P31A102-205 손님 둘러보기 — 로그인 없이 시작하기 · 저장 버튼을 누르면 가입 권유 창

작업 폴더 `S15P31A102-205`, 브랜치 `feat/frontend/S15P31A102-205-guest-browsing`(origin/frontend 기준). 흐름은 EXPERIENCE.md 에 먼저 적어 커밋했다(`b754a0f`).

## 무엇을 / 왜

손님(로그인하지 않은 사람)도 홈 · 분야별 이슈 · 이슈 · 기사 · 검색 · 용어사전을 다 쓰게 한다. 회원만 하는 일은 저장(북마크 · 관심 이슈 · 관심 분야)과 나의 뉴스함 · 마이페이지다. 손님이 저장 버튼을 누르면 「가입하면 더 편하게 이용할 수 있어요」 창을 띄운다(2026-11-13 사용자). API 는 이미 로그인 없이 열려 있어서 화면(frontend)만 바꾼다.

**계획에서 바꾸는 것 하나 — 가입 권유 창의 「이미 계정이 있나요? 로그인」 줄을 뺀다.** 창은 마이페이지에서 쓰는 `ConfirmDialog`(*닫기* · *가입하기*)를 그대로 쓴다. 계정이 있는 손님은 헤더 *로그인* 을 누르거나, 가입 화면 첫 단계의 「이미 계정이 있나요?」로 넘어가면 된다. 이렇게 하면 202 가 고치고 있는 `ConfirmDialog` 를 건드리지 않아도 되고, 202 의 가벼운 창 모양도 그대로 따라온다. EXPERIENCE 의 해당 줄은 5단계에서 고친다.

## 바꿀 파일

모두 `frontend/src/` 아래다.
- `routes.tsx` — `RequireMember` 를 셸 전체가 아니라 `/me` · `/bookmarks` 만 감싸는 경로 없는 묶음으로 옮긴다. `shellRoute(pages)` 의 모양은 그대로 둔다(시험이 쓴다)
- `components/RequireMember.tsx` — 주석만(이제 회원 화면 둘만 막는다)
- `components/shell/AppShell.tsx` + 새 `components/shell/SessionExpiredRedirect.tsx` — 셸이 떠 있는 동안 **회원이던 사람의 내 정보가 손님(null)으로 바뀌면** `/login?next=<지금 주소>` 로 보낸다. 「회원이었다」는 렌더 중 상태 조정(`if (me.data && !wasMember) setWasMember(true)`)으로 기억한다 — effect 안 setState · 렌더 중 ref 를 쓰지 않으려고
- `api/query-client.ts` — 주석만(401 → 손님으로 바꾸기는 그대로, 보내는 일은 위 컴포넌트가 한다)
- `components/shell/Header.tsx` — `meQuery` 를 읽는다. 손님이면 *로그인* 하나(`loginPath(지금 주소)`), A17 을 받는 동안에는 오른쪽을 비운다
- `pages/LoginPage.tsx` — *회원가입* 아래에 글자 버튼 *로그인 없이 시작하기*. 닫기(X)는 앞 기록으로 가고, 앞 기록이 없으면(`location.key === "default"`) 랜딩으로 간다. 로그인에 성공하면 받아 둔 응답을 버린다(`removeQueries` 다음에 내 정보 넣기 — `useLogout` 과 같은 순서)
- `pages/SignupPage.tsx` — 닫기(X) · 가입 성공은 로그인 화면과 같게 바꾼다
- `components/AuthSwitch.tsx` — 로그인 ↔ 가입 이동을 `replace` 로(기록을 쌓지 않는다)
- `lib/login-path.ts` — `guestPath(next)` 를 더한다. `nextPath` 를 거친 뒤 `/me` · `/bookmarks` 면 `/home`(회원 화면에서 왔는데 로그인 없이 시작하면 다시 로그인 화면으로 돌아오지 않게)
- 새 `components/useSignupPrompt.tsx` — `ConfirmDialog` 를 쓰는 훅. `{ open(), dialog }` 를 돌려주고, 설명 한 줄은 `"bookmark" | "interest" | "categories"` 에 따라 고른다. *가입하기* → `signupPath(지금 주소)`
- `components/BookmarkButton.tsx` · `components/issue/InterestButton.tsx` — 내 정보가 `null`(손님으로 확인됨)이면 보내지 않고 창을 연다. A17 을 받는 중이면 지금처럼 보낸다
- `components/home/RecommendedIssues.tsx` — 손님의 *관심사 편집* 은 링크 대신 창을 여는 버튼
- 시험: `routes.test.tsx` · `Header.test.tsx` · `LoginPage.test.tsx` · `SignupPage.test.tsx` · `BookmarkButton.test.tsx` · `InterestButton.test.tsx` · `RecommendedIssues.test.tsx` · `login-path.test.ts` · 새 `useSignupPrompt.test.tsx`. `pwa/manifest.test.ts` 는 주석만 바꾼다
- `_bmad-output/.../EXPERIENCE.md` — 권유 창의 로그인 줄 빼기, 「로그인 · 가입을 마치면 받아 둔 응답을 버린다」를 이동 규칙에 더하기

## 작업 순서

0. `S15P31A102-205/frontend` 에서 `npm ci`(새 작업 폴더라 node_modules 가 없다). 이 계획은 `docs/plans/2026-11-13-guest-browsing.md` 로 옮겨 `docs(plan)` 으로 커밋한다

- [ ] 1. 셸 가드를 회원 화면 둘로 줄이고 세션 만료 감시를 더한다 — 시험을 먼저 쓴다: 손님이 `/issues/12` 를 열면 그 화면이 뜬다 · 손님이 `/bookmarks` · `/me` 를 열면 로그인 화면이고 `next` 가 남는다 · 회원이 쓰다 401 을 받으면 로그인 화면으로 간다 · 로그아웃하면 그대로 랜딩(ProfileMenu 시험)
- [ ] 2. 헤더의 손님 모양 — 손님은 *로그인* 하나이고 `next` 가 지금 주소다 · 받는 동안에는 비어 있다 · 회원은 지금과 같다
- [ ] 3. 로그인 · 가입 화면 — *로그인 없이 시작하기* → `next`(회원 화면이면 `/home`) · 닫기 → 앞 화면이고 앞이 없으면 랜딩 · 오가기는 `replace` · 로그인하면 받아 둔 기사 · 이슈 응답이 사라진다
- [ ] 4. 가입 권유 창 — 손님이 북마크 · 별 · *관심사 편집* 을 누르면 요청 없이 창이 뜬다(누른 것마다 설명) · *가입하기* → `/signup?next=<지금 주소>` · *닫기* · Esc 는 창만 닫는다 · 회원은 지금과 같다
- [ ] 5. EXPERIENCE 를 고치고 화면을 확인한다 — `dev:mock` 에서 손님 · 회원 흐름을 393 · 1440 폭으로 찍는다

## 안 바꿀 것

- backend · API 계약 · `docs/api*.md` (api.md 2절의 401 규칙 「앱이 뜰 때 A17 의 401 은 손님이라 보내지 않는다」는 새 규칙과 맞는다)
- `ConfirmDialog.tsx` — 202 가 고치고 있다
- 랜딩(*서비스 시작하기* → 로그인 화면) · 로그아웃 뒤 랜딩 · 마이페이지 · 나의 뉴스함 화면
- 가입 · 로그인을 마친 뒤 누르려던 저장을 대신 해 주는 일 — 한 번 더 누르게 둔다
- `docs/mvp-overview.md` · PRD (이미 「둘러보기는 로그인 없이」다)

## 리스크

- **202 · 203 과 겹친다.** 둘 다 아직 origin/frontend 에 안 들어갔다. EXPERIENCE 의 홈 행(한 줄이 길어서 고친 곳이 다르더라도 충돌한다)과 `RecommendedIssues.tsx`(202 는 *전체보기*, 205 는 *관심사 편집* — 덩어리가 달라 저절로 합쳐질 가능성이 크다)가 겹친다. 202 · 203 이 먼저 머지되면 205 를 rebase 하고 내가 손으로 푼다
- **로그아웃이 로그인 화면으로 새지 않나.** 세션 만료 감시도 「내 정보가 null」을 보는데, 지금 `RequireMember` 가 같은 순서(먼저 랜딩으로 이동하고 그다음 null)로 문제없이 돈다. ProfileMenu 의 로그아웃 시험 두 개가 지켜 준다
- **손님인지 알기 전에 누르는 경우.** A17 이 오기 전에 손님이 저장을 누르면 요청이 401 을 받고 아무 일도 일어나지 않는다. A17 은 앱이 뜰 때 바로 부르고 결과를 계속 쓰기 때문에 드물다. 감수한다
- **인증 · 권한 코드다** (AGENTS.md 「건드리지 말 것」). 화면 쪽 막기만 바꾸지만 머지 전에 사람이 최종 확인한다 — MR 본문에 확인할 곳을 적는다

## 어떻게 검증하나

- 단계마다 위 시험이 먼저 실패하는 것을 보고, 구현한 뒤 통과를 확인한다
- 끝에 `.claude/stack.md` §3 의 frontend 명령(lint · typecheck · test · build)을 돌린다. 시험은 CI 와 같은 Node 26(`npx node@26`)으로 돌린다
- 화면: `dev:mock` 을 손님으로 띄워 393 · 1440 폭으로 찍는다. 찍을 장면 — 로그인 화면의 *로그인 없이 시작하기* → 홈(날짜만 · 「추천 이슈」 · 헤더 *로그인*) → 이슈 화면의 별 → 권유 창 → *가입하기* → 가입 화면 → 닫기 → 이슈 화면으로 돌아옴, 기사 북마크 → 권유 창, 손님이 `/bookmarks` 를 열면 로그인 화면. 회원으로 로그인하면 헤더 · 별 · 북마크가 지금과 같다. 사진은 `.notes/mr/S15P31A102-205/` 에 둔다
- 끝에 `reviewer` 조수에게 리뷰를 맡긴다(인증 흐름이라)

## 되돌리는 법

데이터 · API 를 바꾸지 않아 되돌릴 수 없는 것이 없다. 머지 전이면 브랜치를 버리고, 머지 뒤면 205 커밋을 `git revert` 한다 — 되돌리면 다시 「손님은 로그인부터」가 된다. EXPERIENCE 커밋(`b754a0f`)도 같이 되돌린다.
