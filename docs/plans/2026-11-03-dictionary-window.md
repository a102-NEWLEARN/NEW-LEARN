# S15P31A102-157 용어사전 창 — F13 용어사전 화면

## 무엇을 / 왜

F13 용어사전은 백엔드 A19(`GET /api/v1/dictionary`, Jira 102)가 사이트에 올라가 있는데, 화면은 아직 없다.
셸 화면 오른쪽 아래에 *용어 사전* 버튼을 띄우고, 누르면 그 자리에 채팅 모양의 작은 창을 연다. 모양은 프로토타입 v21 `GlossaryChat` 을, 동작은 EXPERIENCE.md 「용어사전 창」을 따른다.
머지되면 Jira -157 을 Done 으로 옮긴다.

## 정한 것 (사용자가 볼 것)

- 창은 360×480 이고 모달이 아니다. 열면 입력칸으로 포커스가 간다. 접기 버튼 · Esc 로 닫으면 버튼으로 포커스가 돌아온다 — 닫을 때 포커스가 창 안에 있었을 때만 그렇다
- 단어를 보내면 내 말풍선 → 점 세 개(「찾는 중」) → 결과 말풍선 순서로 뜬다. 첫 말풍선은 「모르는 용어를 입력하면 뜻을 알려드려요.」
- 결과는 **처음 3개, 나머지는 *N개 더 보기* 로 편다**(2026-11-03 사용자 — 계획을 낸 뒤 바꿨다). 사전은 흔한 뜻을 뒤에 준다 — 사이트의 「사과」 8개 중 「사과나무의 열매」가 5번째, 「용서를 빎」이 8번째라 3개에서 자르면 가려진다. 펼치면 새로 보인 첫 뜻으로 포커스가 간다. 칸마다 표제어 · 품사 · 뜻풀이를 보인다. 품사가 null 이면 품사를 빼고, 표제어의 `^` 는 띄어 쓴다(「구원^투수」 → 「구원 투수」). 글자 사이의 `-`(낱말이 붙은 자리, 「이-자」)는 지우고 맨 앞 · 맨 끝의 `-`(접사 · 어미 표시)는 남긴다(2026-11-03 사용자, 진짜 결과를 본 뒤 더함). 결과 아래에 출처 `source`(「국립국어원 표준국어대사전」)를 붙인다 — CC BY-SA 라서 반드시 보여야 한다
- 실패하면 창 안 말풍선으로 알린다

  | 경우 | 문구 | 출처 |
  | --- | --- | --- |
  | 결과 없음 | 「'금리'의 뜻을 찾지 못했어요. 다른 표현으로 물어봐 주세요.」 | EXPERIENCE.md |
  | 502 `DICTIONARY_UNAVAILABLE` | 「지금은 찾을 수 없어요」 | api.md 2절 |
  | 429 (`RATE_LIMITED` 이거나 코드 없이 429) | 「요청이 많아요. 잠시 뒤 다시 시도해 주세요」 | api.md 2절 · LoginPage 와 같은 처리 |
  | 400 `VALIDATION_FAILED` | 서버가 준 `errors[q]` 문장 그대로 | api-screen.md A19 |
  | 연결 실패 · 그 밖의 오류 | `errorDescription()` 의 네트워크 · 일반 오류 안내 | ErrorState |

- 빈칸 · 공백만 넣으면 보내기 버튼이 꺼진다. 입력은 50자까지 받는다(`maxLength`). 찾는 동안에는 보내지 않는다
- 같은 단어를 다시 찾으면 받아 둔 결과를 쓴다(TanStack Query 캐시). 결과 없음은 받아 두지 않는다 — 서버도 틀린 키의 빈 본문을 굳히지 않으려고 저장하지 않는다(리뷰 반영). 실패하면 다시 부르지 않는다(`retry: false`) — 사용자가 다시 보내면 된다
- 대화 기록은 셸이 떠 있는 동안만 남는다. 창을 접었다 펴거나 화면을 옮겨도 남고, 새로 고치거나 셸 밖(랜딩 · 로그인)으로 나가면 사라진다. 어디에도 저장하지 않는다
- 넓은 화면에서 사건 패널이 열리면 버튼과 창이 **패널의 실제 폭**만큼 왼쪽으로 비킨다. 패널은 420px 이지만 화면이 좁으면 `max-w-[50%]` 로 줄어서 숫자 대신 잰 폭을 쓴다. 좁은 화면의 사건 시트는 딤으로 덮어서 비키지 않는다. 폭은 패널과 함께 생기고 사라지는 작은 컴포넌트가 잰다 — 좁은 화면에서 넓어져 패널이 나타날 때도 재게(리뷰 반영)
- Esc 순서(EXPERIENCE.md Interaction Primitives): TIP · 검색 목록 → 모달 → **용어사전 창** → 사건 패널 → 서랍. 다른 창(`role="dialog"`) 안에서 누른 Esc 는 그쪽 몫이다
- 좁은 화면에서도 버튼에 글자 「용어 사전」을 그대로 둔다(프로토타입)
- 버튼 · 보내기 버튼 색은 진한 청록(`bg-brand-solid`)에 흰 글자다. 프로토타입의 밝은 민트 바탕은 쓰지 않는다 — DESIGN.md 가 밝은 민트를 그래픽에만 쓰고 행동 버튼(CTA)은 진한 청록으로 정했다
- 입력칸 예시는 「예: 금리」. 프로토타입의 「소버린 AI」는 표준국어대사전에 없는 말이라 바꾼다
- `npm run dev:mock` 에서도 용어사전만 진짜 서버로 보낸다(MSW passthrough → Vite 프록시 → `API_PROXY_TARGET`). 사전 키는 화면 코드에 넣지 않는다(2026-11-03 사용자, 계획을 낸 뒤 더함). 테스트는 가짜 사전을 그대로 쓴다
- 개발용 Query devtools 버튼은 왼쪽 아래로 옮긴다. 오른쪽 아래가 용어사전 버튼 자리다(2026-11-03 사용자)
- 기사에서 쓰인 뜻을 앞에 세우는 일(분야 · 한자 표시, AI 로 문맥 고르기)은 이 티켓에서 하지 않는다. 사전 API 에 「많이 쓰는 순」 정렬이 없다. 사용자가 AI 쪽으로 넘겼다(2026-11-03)

## 만들 구조

```
frontend/src/
├─ api/
│  ├─ dictionary.ts               새 — A19 타입 · fetchDictionary · dictionaryQuery
│  └─ dictionary.test.ts          새
├─ components/shell/
│  ├─ DictionaryWindow.tsx        새 — 버튼 + 창 (대화 기록 · 점 세 개 · 결과 · 출처 · 오류 · Esc · 포커스)
│  ├─ DictionaryWindow.test.tsx   새
│  ├─ AppShell.tsx                고침 — 창을 띄우고, 오른쪽 패널 폭을 받아 넘긴다. <main> 에 isolate
│  └─ useShell.ts                 고침 — ShellContext 에 setRightPanelWidth 하나 더
├─ components/issue/
│  └─ EventDetailPane.tsx         고침 — 넓은 화면 패널(WidePanel)이 폭을 useElementSize 로 재서 셸에 알린다
├─ pages/IssuePage.test.tsx       고침 — 패널이 열리면 버튼이 비키는 시험 · 좁음 → 넓음 · Esc 순서
├─ routes.test.tsx                고침 — 셸 화면에만 버튼이 있는 시험
├─ mocks/handlers.ts              고침 — /api/v1/dictionary 가짜 응답 (금리 · 사과 4개 · 구원^투수, 그 밖은 빈 결과)
├─ main.tsx                       고침 — dev:mock 에서 용어사전 passthrough · devtools 버튼 왼쪽 아래 (나중에 더함)
└─ newlearn-theme.css             고침 — 창이 뜨는 모션 · 점 세 개 keyframes (newlearn-panel-in 옆)
frontend/README.md                고침 — 「가짜 API」 표에 용어사전 한 줄 (나중에 더함)
EXPERIENCE.md                     고침 — 용어사전 버튼 · 창 · 서버 오류 행과 포커스 줄
```

- 쌓는 순서: 버튼 · 창은 `z-[1]` 이고 SEED 의 시트 · 모달 · 서랍(z-index 2, body 에 붙음)보다 아래다. `<main>` 에 `isolate` 를 걸어 본문 안의 z-10 · z-20(검색 목록 · TIP)이 버튼 위로 새지 않게 한다. 지금 본문에 `fixed` 요소는 없다
- 다시 쓰는 것: `api` 클라이언트 · `ApiError` (`api/error.ts`), `errorDescription` (`ErrorState.tsx`), `useElementSize` (`components/issue/useElementSize.ts`), `useShell`, 아이콘 `IconBookOpenLine` · `IconChevronDownLine` · `IconArrowUpLine`, 시험 도우미 `renderRoute` · `server` · `stubScreen`

## 작업 순서

- [x] 1. 계획 파일을 `docs/plans/2026-11-03-dictionary-window.md` 로 옮겨 커밋 — `docs(plan)`
- [x] 2. A19 호출 — `dictionary.test.ts` 를 먼저 쓰고 `dictionary.ts` · 가짜 응답 — `npm test`
- [x] 3. 용어사전 창 — `DictionaryWindow.test.tsx` 를 먼저 쓰고 창 · AppShell · keyframes — `npm test`
- [x] 4. 사건 패널이 열리면 비키기 — IssuePage 시험을 먼저 쓰고 useShell · EventDetailPane — `npm test`
- [x] 5. EXPERIENCE.md — 위 「만들 구조」의 행들
- [x] 6. `/verify` (Node 26 시험 포함) · reviewer · `dev:mock` 화면 확인 · 스크린샷을 `.notes/mr/S15P31A102-157.md` 에 — 한글 Enter 손 확인만 남음
- [x] 그 사이 더한 것 — 표제어 `-` · dev:mock passthrough · devtools 자리 · 리뷰 반영(좁음 → 넓음 폭 재기, 결과 없음 안 받아 두기, *더 보기* 이름, 창 배경 floating, `aria-haspopup`)

커밋마다 끝나면 이 체크박스를 채운다.

## 안 바꿀 것

- 백엔드 A19 · `docs/api.md` · `docs/api-screen.md` — 계약은 그대로 쓴다
- 기사 본문의 어려운 말을 자동으로 표시하는 기능 — F13 은 버튼으로 여는 창뿐이다(MVP 개요)
- 용어사전 단축키 — 없다(EXPERIENCE.md)
- EXPERIENCE.md 36 · 48 · 64줄의 「제안(PM 확인 전)」 — Jira 104 의 몫이다
- 헤더 · 사이드바 · 서랍 · 사건 패널의 모양과 동작 — 패널은 폭을 알리는 일만 더한다
- 대화 기록 저장(localStorage 등) — 하지 않는다

## 리스크

- **표준국어대사전에 뉴스 용어가 적다.** 「소버린 AI」 · 「피벗」 같은 말은 결과 없음이 자주 뜰 수 있다. 화면이 아니라 데이터 소스의 한계다(F13 은 2026-10-21 에 이 사전으로 정했다). 만든 뒤 사이트에서 몇 낱말을 찾아 보고 알린다
- **한글 입력 중 Enter.** 조합 중에 Enter 를 누르면 브라우저에 따라 마지막 글자가 잘리거나 두 번 보내질 수 있다. 폼 submit 으로 보내고 Chrome 에서 손으로 확인한다. jsdom 시험으로는 못 잡는다
- **`<main>` 의 isolate.** 본문 안 요소는 이제 헤더 · 사이드바 위로 올라갈 수 없다. 지금은 그런 요소가 없지만 홈 검색 목록 · 이슈 TIP · 마인드맵 단추를 화면에서 한 번씩 본다
- **버튼이 본문 오른쪽 아래를 가린다.** 기사 목록 끝줄 · 타임라인 오른쪽 아래가 가려질 수 있다. 프로토타입도 같다. 거슬리면 따로 정한다
- **폭 재기는 jsdom 에서 0 이다.** 시험은 Timeline 시험처럼 `clientWidth` 를 spy 해서 420 을 준다

## 어떻게 검증하나

- `dictionary.test.ts` — `q` 를 그대로 보내고 응답을 돌려준다
- `DictionaryWindow.test.tsx`
  - 버튼을 누르면 창이 열리고 입력칸에 포커스가 가며, 접기를 누르면 닫히고 버튼으로 포커스가 돌아온다
  - 단어를 보내면 내 말풍선 · 「찾는 중」 다음에 결과 3개(사과 4개 중), 품사 null 은 품사 없이, 「구원 투수」, 출처
  - 결과 없음 · 502 · 429(코드 없는 429 포함) · 400 `errors[q]` · 연결 실패 문구
  - 빈칸 · 공백이면 보내기가 꺼지고, 입력은 50자까지
  - Esc 로 닫히고, 다른 `role="dialog"` 안에서 누른 Esc 로는 안 닫힌다
  - 같은 단어를 두 번 찾으면 A19 를 한 번만 부른다
  - `inset` 만큼 버튼과 창의 `right` 가 늘어난다
- `IssuePage.test.tsx` — 넓은 화면에서 사건을 고르면 버튼이 패널 폭(420)만큼 비키고, 닫으면 돌아온다. 좁은 화면 시트는 비키지 않는다
- 라우트 — 셸 화면에는 버튼이 있고 랜딩 · 로그인에는 없다
- 게이트: `npm run format:check` · `npm run lint` · `npm test` · `npm run build`, 그리고 Node 26 으로 `npx -y -p node@26 -- node node_modules/vitest/vitest.mjs run`
- 화면(`npm run dev:mock`): 홈 · 기사 · 이슈에서 열고 찾기, Esc, 사건 패널을 열고 닫을 때 버튼이 따라 움직이는지, 767px 이하, 한글 Enter. 용어사전은 프록시 대상(`API_PROXY_TARGET`)이 있어야 진짜 결과가 나온다
- 사이트 A19 를 한 번 불러 실제 응답 모양이 가짜 응답과 같은지 본다(읽기만 한다. 하루 한도에서 1건)

## 되돌리는 법

- 브랜치 커밋을 되돌린다(`git revert`). 데이터 · 서버 · 배포 설정을 건드리지 않는다
- 머지 뒤라면 frontend 에서 그 MR 을 revert 하면 버튼과 창이 사라지고 다른 화면은 그대로다
