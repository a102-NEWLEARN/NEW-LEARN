# S15P31A102-83 [FE] SEED 테마에 NEW:LEARN 브랜드 적용

## 무엇을 / 왜

프론트 앱은 지금 SEED 기본 모양(당근 오렌지)으로 뜬다. DESIGN.md(-82, `dev` 에 머지됨)의 색 · 글꼴 · 로고를 frontend 에 입힌다. 이후 화면은 SEED 토큰만 써도 NEW:LEARN 모양이 된다.
**색은 SEED CSS 변수(`--seed-color-*`)를 덮어쓰는 파일 하나로 처리한다.** SEED 공식 문서에는 브랜드 색을 바꾸는 방법이 없고, SEED 컴포넌트와 Tailwind 테마가 모두 이 변수를 읽기 때문이다.

조사로 확인한 근거는 다섯 가지다.
- SEED 테마 문서와 `@seed-design/css/theming` 은 색 모드(라이트 · 다크)만 다룬다. 브랜드 색 API 는 없다.
- `@seed-design/tailwind4-theme` 은 `--color-fg-brand: var(--seed-color-fg-brand)` 처럼 SEED 변수를 가리킨다. 그래서 변수를 덮어쓰면 Tailwind 클래스(`text-fg-brand` · `bg-bg-brand-solid`)까지 바뀐다.
- SEED 레시피 4곳은 역할 변수 대신 `palette-carrot-200` 을 직접 쓴다. 브랜드 외곽선 버튼의 로딩 링, 체크마크 ghost 의 눌림 배경, 진행 원 brand 톤, 리액션 버튼의 로딩 링이다. 이 값은 SEED 의 `bg-brand-weak-pressed` 값과 같다.
- SEED `base.css` 에는 시스템이 다크 모드면 다크 색으로 바꾸는 규칙이 있다. 그래서 `<html data-seed-color-mode="light-only">` 가 필요하다.
- SEED 는 `body` 에 글꼴 · 글자색을 걸지 않는다.

이 브랜치(`origin/frontend` 기준)의 DESIGN.md 는 아직 빈 틀이다. 값은 `origin/dev` 의 DESIGN.md 를 따른다.

## 바꿀 파일 (모두 `frontend/` 안)

> **2026-10-20 계획 변경 (승인받음):** 라이트 고정은 `vite.config.ts` 의 `seedDesignPlugin({ colorMode: "light-only" })` 로 한다. SEED Vite 플러그인이 페이지를 띄울 때 `<html data-seed-color-mode>` 를 자기 옵션 값(기본 `system`)으로 덮어써서 `index.html` 속성은 효과가 없었다. 헤드리스 Edge 로 화면을 열어 보고 알았다.

- `vite.config.ts` — `seedDesignPlugin({ colorMode: "light-only" })` (위 변경)
- `index.html` — 파비콘 링크
- `src/newlearn-theme.css` (새 파일) — 층(`@layer`) 밖에 둬서 SEED 층보다 항상 이기게 한다
  - 기본 색 11개 `--nl-brand-*` (DESIGN.md Colors 「기본 색 11개」)
  - 값을 바꾼 SEED 역할 14개 `--seed-color-*` 덮어쓰기 (「값을 바꾼 SEED 역할 14개」)
  - 새 역할 3개 `--nl-color-*`, Tailwind `@theme` 에 등록 → `text-fg-brand-accent` · `bg-bg-brand-accent` · `bg-bg-accent-lime`
  - carrot-200 을 직접 쓰는 SEED 선택자 4곳 → `var(--seed-color-bg-brand-weak-pressed)`
  - `body` 글꼴 `var(--seed-font-family)`, 글자색 `fg-neutral`, 배경 `bg-layer-default`
- `src/style.css` — Pretendard 와 테마 파일 import
- `package.json` · `package-lock.json` — `pretendard` 1.3.9 (OFL-1.1, `.npmrc` 가 정확한 버전으로 고정)
- `public/favicon.svg` (새 파일) — v2 `newlearn-symbol.svg` 복사
- `src/assets/newlearn-logo-horizontal.svg` (새 파일) — v2 가로 로고 복사
- `src/components/Logo.tsx` (새 파일) — 가로 로고 `<img alt="NEW:LEARN">`, 높이 24px. -31 공통 레이아웃 헤더가 가져다 쓴다
- `src/App.tsx` — 확인용 첫 화면에 `<header>` + Logo. 「다시 확인」 버튼을 `brandSolid` 로 바꿔 청록 CTA 가 화면에 보이게 한다
- 테스트 — `src/newlearn-theme.test.ts` (새 파일), `src/App.test.tsx`

## 작업 순서 (커밋 3개)

- [x] 색 — 테스트 먼저(역할 17개 값 · light-only · carrot 4곳) → `newlearn-theme.css` · `index.html` → 테스트 통과
- [x] 글꼴 — Pretendard 설치 · import, `body` 글꼴 → 빌드 통과, 화면에서 글꼴 확인
- [x] 로고 — Logo 테스트 먼저 → 로고 · 파비콘 · App 헤더 · 버튼 → 테스트 통과

## 안 바꿀 것

- SEED 패키지와 복사해 온 SEED 스니펫(`seed-design/ui/*`)
- 다크 테마 — 넣지 않는다
- DESIGN.md — 이 브랜치에서는 빈 틀이라 고치지 않는다(`dev` 쪽이 진실). carrot 4곳 처리 방식은 MR 에 적고 DESIGN.md 반영은 따로 한다
- 공통 레이아웃(-31)과 다른 화면 — 헤더는 확인용 첫 화면에만 둔다
- 색 값 직접 쓰기를 막는 린트 — 이번 범위 밖. 필요하면 티켓을 따로 만든다
- `.claude/stack.md` · backend · ai · infra

## 리스크

- **SEED 공식 지원이 아닌 방법이다.** 변수 이름은 SEED 가 메이저 버전에서만 바꾼다(색 값 SemVer 약속). 하지만 레시피 선택자 4곳은 마이너 업데이트에서 바뀔 수 있고, 그러면 그 부분만 조용히 주황으로 돌아간다. SEED 를 올릴 때 `grep palette-carrot node_modules/@seed-design/css/recipes` 를 다시 보라고 테마 파일 주석과 MR 에 적는다.
- 층 밖 스타일이라 그 4곳(눌림 · 로딩 상태)은 Tailwind 클래스로 배경을 덮어도 우리 규칙이 이긴다.
- Pretendard 동적 서브셋은 woff2 조각이 많아 빌드 결과물이 커진다. 브라우저는 필요한 글자 조각만 내려받는다.
- 테마 테스트는 CSS 글자를 읽어 값을 비교한다. jsdom 은 CSS 를 계산하지 않으므로 실제 화면 색은 브라우저로 따로 본다.

## 어떻게 검증하나

- **테스트(먼저 실패를 본다):**
  - `newlearn-theme.test.ts` — 역할 14개 · 새 역할 3개가 DESIGN.md 값과 같다. `index.html` 이 light-only 다. carrot 4곳을 덮는다.
  - `App.test.tsx` — 헤더에 「NEW:LEARN」 로고 이미지가 있다.
- **frontend 게이트:** `npm run format:check` · `npm run lint` · `npm test` · `npm run build`
- **실제 화면:** `npm run dev` 를 띄우고 헤드리스 Edge(또는 Chrome)로 1280px 스크린샷을 찍는다.
  - 글자 차콜 #222B30, 「다시 확인」 버튼 청록 #087F72, 로고가 보이는지 본다.
  - `/favicon.svg` 가 200 으로 오는지 본다.
  - 다크 모드를 강제한 브라우저(`--force-dark-mode`)에서도 라이트로 뜨는지 본다.
- 마지막에 서진 님이 브라우저로 한 번 본다.

## 되돌리는 법

커밋 3개를 revert 하면 SEED 기본 모양으로 돌아간다. 데이터 · 서버 변경은 없고, `pretendard` 패키지도 `package.json` · lock 과 함께 되돌아간다.
