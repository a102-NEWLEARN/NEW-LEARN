---
title: 'S15P31A102-31 요청 상태 UI — 스낵바 · 곧 제공 · 찾을 수 없음'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '28b04dd47be3fe184671618adb432cc217a589f9'
context:
  - '{project-root}/frontend/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 홈 · 이슈 · 사건 패널 화면(-44 · -45 · -50 · -52)이 짧은 알림, 곧 제공 기능 안내, 없는 주소 화면을 같은 규칙으로 써야 하는데 아직 없다. 화면마다 따로 만들면 문구와 동작이 갈라진다.

**Approach:** SEED 스낵바 스니펫 위에 2.4초 알림 훅과 곧 제공 훅을 두고, 라우트 목록을 `routes.tsx` 로 빼서 그 밖의 주소에 찾을 수 없음 화면을 띄운다. 개발 확인 화면에서 이미 만든 `QueryState` 와 곧 제공 버튼을 써 보며 화면으로 확인한다.

**정한 것 (2026-10-23 사용자 승인):** 찾을 수 없음 기본 제목은 「페이지를 찾을 수 없어요」, 화면이 `title` 로 바꾼다. 설명 문구 없이 제목과 *홈으로*(`/home`)만 둔다. 스낵바 훅은 `components/` 바로 아래에 둔다(`src/hooks/` 를 만들지 않는다).

## Boundaries & Constraints

**Always:** 문구는 EXPERIENCE.md 그대로 쓴다 — 곧 제공 「MVP 이후 제공 예정인 기능이에요」, 스낵바 2.4초. 곧 제공 항목은 비활성으로 두지 않는다. 오류는 스낵바로 알리지 않는다. 색 · 글자는 SEED 역할 토큰 클래스만 쓴다. 새 동작은 실패하는 테스트를 먼저 보고 구현한다. 커밋은 목표마다 나누고 `type(scope): 내용` 한국어, 끝 마침표 없음, 작성자 트레일러 없음.

**Never:** `seed-design/ui/` 파일 고치기. 셸(헤더 · 사이드바 · 패널), `<title>` · 포커스 옮기기, 401 처리, `_NOT_FOUND` 를 받은 화면 전체 교체 — 다른 티켓이다. 새 가짜 API 핸들러(테스트에서만 `server.use`). 새 npm 의존성. DESIGN.md · EXPERIENCE.md · README 수정.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 곧 제공 누름 | `useComingSoon()` 을 단 버튼 클릭 | 「MVP 이후 제공 예정인 기능이에요」 스낵바, 2.4초 뒤 사라짐 | N/A |
| 연달아 누름 | 스낵바가 떠 있을 때 다시 클릭 | 앞 스낵바를 새 것으로 바꾼다 (SEED 기본 `immediate`) | N/A |
| 없는 주소 | `/nope` 를 연다 | 「페이지를 찾을 수 없어요」 제목 + `/home` 으로 가는 *홈으로* 링크 | N/A |
| 제목 지정 | `<NotFoundPage title="이슈를 찾을 수 없어요" />` | 그 제목 | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/components/state/*` -- 이미 있음(커밋 `28b04dd47be3fe184671618adb432cc217a589f9`). `QueryState` 를 개발 화면에서 쓴다. 고치지 않는다
- `frontend/seed-design/ui/action-button.tsx` -- `ActionButton`. *홈으로* 는 `asChild` 로 `Link` 를 감싼다
- `frontend/src/main.tsx` -- 지금 라우트를 직접 만든다. `routes` 를 받아 `createBrowserRouter` 하고 `QueryClientProvider` 안을 `SnackbarProvider` 로 감싼다
- `frontend/src/test/render.tsx` -- `renderWithProviders`. `MemoryRouter` 를 감싸므로 라우트 테스트는 이 도우미 대신 `createMemoryRouter(routes)` + `RouterProvider` 를 쓴다
- `frontend/src/App.tsx` · `App.test.tsx` -- 개발 확인 화면. 성공 문구 「카테고리: 정치 · …」를 지켜야 기존 테스트 4개가 그대로 통과한다
- `frontend/src/test/setup.ts` -- `ResizeObserver` 스텁이 있다. SEED 스낵바 영역이 쓴다
- `@seed-design/react` 3.0.0 `Snackbar` · `useSnackbarAdapter` -- `create({ timeout, render })`, 기본 4000ms 라 2400 을 넘긴다. 영역은 `aria-live="polite"` · `position: fixed`
- `react-router` 8.4.0 -- `createMemoryRouter` · `RouteObject` · `Link` 가 있다(타입 선언 확인)

## Tasks & Acceptance

**Execution:**
- [x] `frontend/seed-design/ui/snackbar.tsx` -- `frontend/` 에서 `npx @seed-design/cli@1.7.2 add ui:snackbar` -- SEED 규칙. 받은 파일이 `@seed-design/react` 3.0.0 과 안 맞으면 멈추고 사용자에게 알린다
- [x] `frontend/src/components/useSnackbar.test.tsx` -- 곧 제공 클릭 → 문구가 뜨고 2.4초 뒤 사라진다(가짜 타이머, 안 되면 진짜 시간). 연달아 두 번 누르면 스낵바가 하나만 남는다. 먼저 실패를 본다
- [x] `frontend/src/components/useSnackbar.tsx` -- `useSnackbar().show(message, variant?)` · `useComingSoon()` · 문구 상수 -- 문구를 한 곳에 둔다
- [x] `frontend/src/main.tsx` · `frontend/src/test/render.tsx` -- `SnackbarProvider` 로 감싼다. 없으면 `useSnackbar` 가 SEED 컨텍스트 오류를 던진다
- [x] `frontend/src/routes.test.tsx` -- 없는 주소 · `title` 지정 두 경우. 먼저 실패를 본다
- [x] `frontend/src/pages/NotFoundPage.tsx` · `frontend/src/routes.tsx` -- `/` → `App`, `*` → `NotFoundPage`. `main.tsx` 가 `routes` 를 쓴다
- [x] `frontend/src/App.tsx` -- 카테고리를 `QueryState`(스켈레톤 · 「카테고리를 불러오지 못했어요」)로, *곧 제공* 버튼 하나 추가

**Acceptance Criteria:**
- Given `npm run dev:mock`, when 첫 화면을 열면, then 카테고리 다섯 개가 보이고 *곧 제공* 을 누르면 스낵바가 뜬다
- Given 백엔드 없이 `npm run dev`, when 첫 화면을 열면, then 카테고리 자리에 오류 안내와 *다시 시도* 가 보인다
- Given 개발 서버, when `/nope` 를 열면, then 찾을 수 없음 화면이 보인다

## Implementation Notes

- 2026-10-23 사용자 선택으로 조수에게 맡기지 않고 직접 단계마다 구현했다. 단계마다 개요를 먼저 보이고 진행했다
- 커밋: `d4c0efd` 스낵바 · 곧 제공, `13cf02d` 찾을 수 없음 · 라우트, `0c4741f` 개발 확인 화면
- 새 테스트 4개는 구현을 깨서 실패하는지 봤다: 시간 4초 · 줄 세우기(queued) · 그 밖 주소 라우트 없음 · 링크 `/` · `title` 무시. 전체 59개 통과
- 화면은 헤드리스 Chrome 을 DevTools 프로토콜로 조종해 확인했다. `--virtual-time-budget` 을 쓰면 `dev:mock` 의 MSW 서비스 워커가 켜지지 않아 빈 화면이 찍힌다. 스크린샷은 `.notes/mr/S15P31A102-31/`
  - 스낵바: 누른 뒤 2.0초에 보이고 3.0초에 없다. 영역 `aria-live="polite"`. 차콜 바탕 흰 글자
  - 동작 줄이기: 스켈레톤 `::after` 의 `animation-name` 이 평소 `slide-x`, `prefers-reduced-motion: reduce` 에서 `none`
  - 백엔드 없는 `npm run dev` 는 Vite 프록시가 500 을 돌려줘서 네트워크 안내가 아니라 일반 오류 안내가 뜬다. 브라우저가 서버에 아예 못 닿을 때만 네트워크 안내다
- 1차 리뷰 반영(Review Triage Log patch A~D): `35cfde4` provider 를 `src/providers.tsx` 한 곳에 두고 `renderRoute` 로 `/` 확인, `1b7eaae` 스낵바 테스트를 role 기준으로(1초 · 4초 · queued 모두 잡음), `9e636e0` `show` 가 critical 을 못 받게, `1546194` 주석. 다시 돌린 검증: 포맷 · 린트 · 테스트 60개 · 빌드 통과

## Spec Change Log

## Review Triage Log

1차 리뷰 (2026-10-23). 층: VG 검증 빈틈 · EC 경계 사례 · BH 맥락 없는 리뷰

| # | 층 | 위치 | 지적 | 판정 | 근거 | 처리 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | VG | `main.tsx` · `test/render.tsx` | 앱의 provider 순서를 테스트 도우미가 손으로 베꼈고, 진짜 순서로 `/` 를 그리는 테스트가 없다 | medium | 검증 층이 확인해 옴. `main.tsx` 에서 `SnackbarProvider` 를 빼도 테스트 59개 · 빌드가 다 통과하고 화면만 깨진다 | patch A |
| 2 | VG | `App.tsx` | 개발 화면의 실패 · 빈 상태 · 곧 제공 버튼을 App 테스트가 안 본다 | low | 버리는 개발 화면이고(-44 에서 바뀜) `QueryState` · `useComingSoon` 은 각자 테스트가 있다. patch A 의 `/` 테스트가 화면이 뜨는지는 본다 | 기각 |
| 3 | EC | `NotFoundPage.tsx:18` | *홈으로* 가 `/home` 인데 라우트가 없어 같은 화면으로 돌아온다 | low | 사실이다. 그러나 frozen 의도가 `/home` 링크를 정했고 홈은 -44 에서 생긴다 | 기각 (의도가 정함) |
| 4 | EC | `routes.tsx:7-11` | `errorElement` 가 없어 렌더 오류에 React Router 기본 오류 화면이 뜬다 | medium | 사실이다. 이번 변경 전(`[{ path: "/", element: <App /> }]`)에도 없었다 | defer |
| 5 | EC | `useSnackbar.tsx:15-27` | SEED 컨텍스트가 바뀔 때마다 `show` 의 정체가 바뀌어 쓰는 쪽이 다시 그려진다 | low | 사실이나 컨텍스트를 구독하는 한 다시 그려지는 것은 피할 수 없고, `show` 에 기대는 effect 는 아직 없다. 고치려면 ref · 컨텍스트 층을 더해야 한다 | 기각 |
| 6 | EC | `App.tsx:49-55` | A1 이 `items: null` 을 주면 `data.length` 에서 터진다 | false | `docs/api.md` 목록 응답의 `items` 는 늘 배열이고 `fetchCategories` 타입도 배열이다. 닿을 수 없는 입력이다 | 기각 |
| 7 | EC | `routes.test.tsx:10-11` | 라우트 테스트가 provider 없이 그려서 `/` 테스트를 쓸 수 없다 | medium | 1번과 같은 원인(provider 순서를 한 곳에 두지 않음) | patch A |
| 8 | EC | `NotFoundPage.tsx:15` | `/nope` 화면에 `<main>` 랜드마크가 없다 | low | 사실이다. 다음 MR 셸이 `<main>` 을 준다(사용자 승인한 3단계 개요). 지금 `<main>` 을 넣으면 셸과 겹친다. 아직 사용자에게 배포되지 않았다 | 기각 |
| 9 | BH | `useSnackbar.test.tsx` | 「2.4초 뒤 사라진다」가 너무 짧은 시간을 못 잡는다. 사라지는 중(aria-hidden)인 스낵바도 `getByText` 가 찾는다. 연달아 누름의 첫 개수도 나가는 스낵바를 센다 | medium | SEED 는 dismissing 동안 root 를 `aria-hidden` 으로 남겨 둔다(`react-snackbar/src/useSnackbar.ts`). 리뷰어가 100 · 1000 · 2000ms 로 바꿔도 통과함을 확인 | patch B |
| 10 | BH | `useSnackbar.test.tsx` | 테스트가 SEED 기본 `removeDelay` 200ms 에 기댄다 | low | SEED 가 바꾸면 테스트가 크게 실패할 뿐 조용히 틀리지 않는다 | 기각 |
| 11 | BH | `useSnackbar.tsx` | `show` 가 `critical`(오류 모양)을 받는다. 「오류는 스낵바로 알리지 않는다」와 어긋난다 | low | 사실이다. 타입을 좁히면 규칙을 타입이 지킨다. 바로 고칠 수 있다 | patch C |
| 12 | BH | `useSnackbar.tsx` · `useComingSoon` | memo 가 안정된 정체를 주지 못한다 | low | 5번과 같은 원인 | 기각 |
| 13 | BH | `routes.tsx` · `NotFoundPage.tsx` | 주석이 아직 없는 동작을 있는 것처럼 적었다(`/` 는 IA 상 랜딩인데 개발 화면, `_NOT_FOUND` 연결은 화면 티켓 몫, `/home` 은 -44). 결정이 커밋 안 된 스펙에만 있다 | low | 주석은 바로 고칠 수 있다. 스펙을 어디 둘지는 이 스펙을 고치는 일이라 마무리에서 사용자와 정한다 | patch D (주석만) |
| 14 | BH | `main.tsx` · `routes.tsx` | 루트 레이아웃 라우트가 없다. `errorElement` 가 없고, 스낵바가 라우터 밖이라 스낵바 안에 `Link` 를 못 쓴다 | medium | `errorElement` 는 4번과 같은 원인. 스낵바 안 링크는 지금 아무도 안 쓴다 | defer (4번과 함께) |

## Design Notes

곧 제공은 버튼 컴포넌트가 아니라 훅이다. 헤더 글자 버튼 · 사이드바 항목 · 이슈 헤더 버튼처럼 모양이 다 달라서 `onClick` 만 공유한다.

```tsx
const comingSoon = useComingSoon();
<button type="button" onClick={comingSoon}>나의 뉴스함</button>
```

*홈으로* 는 링크다(`ActionButton asChild` + `Link to="/home"`). `/home` 은 -44 에서 생기므로 그전에는 누르면 다시 찾을 수 없음 화면이다.

## Verification

**Commands:** (`frontend/` 에서, `.claude/stack.md` §3)
- `npm run format:check` -- 통과
- `npm run lint` -- 통과
- `npm test` -- 전부 통과, 테스트 수가 지금(55개)보다 늘어난다
- `npm run build` -- 통과

**Manual checks:**
- 헤드리스 Chrome 으로 위 AC 세 화면을 찍어 `.notes/mr/S15P31A102-31/` 에 둔다. 스낵바를 누르는 것과 DevTools 「prefers-reduced-motion」 에서 스켈레톤 반짝임이 멈추는지는 사용자에게 확인을 부탁한다
