# SEED Design 리서치 (2026-10-15 확인)

> 리서치 서브에이전트 보고서 원문. 출처 URL은 하단 참조. `UNVERIFIED` 표시는 확인되지 않은 항목.
> NEW:LEARN 디자인 시스템 v2(`imports/newlearn-design-system-v2/`)가 이 문서보다 우선한다.

## 1. 버전과 상태

- "V3"는 SEED 디자인 언어 세대의 이름이다 [S1]. 이와 별도로 npm 패키지도 메이저 3이다. `@seed-design/react` 3.0.0은 2026-10-01, `@seed-design/css` 3.0.2는 2026-10-08에 배포됐다. 둘 다 안정판 `latest` 태그이며 alpha 태그도 있다 [S2].
- 2.0부터 엄격한 SemVer를 따르고, 색상 토큰 값은 메이저 릴리스에서만 바뀐다 [S3].
- 라이선스는 Apache-2.0. 당근 로고와 브랜드 자산은 제외되며, 당근과 제휴한 것처럼 보이게 쓰면 안 된다 [S4][S5].
- GitHub Releases 페이지는 비어 있다. 릴리스는 npm과 changesets로 배포된다 [S6].

## 2. 패키지와 설치

- README에 나온 패키지 [S6]:
  - `react` (react >=18, `css` ^3 필요)
  - `css` (토큰, 레시피, `/breakpoints`, `/theming`)
  - `cli` (shadcn 방식으로 스니펫을 `./seed-design/ui`에 복사)
  - `stackflow`
  - `tailwind3-plugin`, `tailwind4-theme`
  - vite, webpack, rsbuild 플러그인
  - `rootage-artifacts`, `figma`, `mcp`
  - Lynx 패키지
- **Vue 등 다른 프레임워크 패키지는 없다.** iOS·Android는 언급만 있고 패키지는 없다 [S6].
- Figma: SEED Codegen 플러그인이 Figma Community에 있다 [S7]. 공개 Figma UI 키트는 UNVERIFIED.
- React 설치 4단계 [S8]:
  1. `@seed-design/react`, `@seed-design/css` 설치
  2. `<html data-seed data-seed-color-mode="system" data-seed-user-color-scheme="light">`와 문서에 나온 인라인 color-scheme 스크립트 추가
  3. `@seed-design/css/all.css` import
  4. `npx @seed-design/cli@latest init` 실행 → `seed-design.json`(`rsc`, `tsx`, `path`) 생성, tsconfig에 `seed-design/*` 별칭 추가
- Next.js 가이드는 없다. Vite, Rsbuild, Webpack, Manual 가이드만 있다 [S9]. CLI의 `rsc` 옵션이 `"use client"` 유지 여부를 정한다 [S7].

## 3. 토큰

- 원천은 Rootage YAML(`packages/rootage/*.yaml`, `components/*.yaml`)이며, 여기서 CSS 변수·TypeScript·Tailwind 출력이 생성된다. 색상·그라디언트·그림자 YAML은 Figma 변수에서 동기화된다 [S10].
- 2단계 구조: Scale 토큰, Semantic 토큰 [S11].
- **색상** [S12][S13]
  - 팔레트: `$color.palette.gray-00…1000`, `carrot|blue|red|green|yellow|purple-100…1000`, `static-black/white(-alpha-N)`
  - 시맨틱 패턴: `$color.{fg|bg|stroke}.{role}-{variant}-{state}`. 예: `fg.neutral-muted`, `bg.brand-solid-pressed`, `bg.layer-default`, `stroke.focus-ring`, `fg.on-brand-solid`
  - 역할: brand, neutral, positive, warning, critical, informative
  - CSS 변수 형태: `--seed-color-bg-layer-default`
- **Radius:** `$radius.r0_5…r6`(2–24px), `full` [S14]
- **Dimension:** `$dimension.x0_5…x16`(x1 = 4px). 시맨틱 간격으로 `spacing-x.global-gutter`(= x4), `spacing-y.component-default`, `spacing-y.screen-bottom` [S15]
- **Shadow:** `$shadow.s1–s3`, 라이트·다크 값이 다르다 [S16]
- **Motion:** `$duration.d1–d6`(50–300ms), `$timing-function.easing|enter|exit|enter-expressive|exit-expressive` [S17]
- **기타:** `$scale.s95/s97/s98`, AI 기능용 `$gradient.*-magic` [S11][S18]

## 4. 테마

- `data-seed-color-mode`는 `system`, `light-only`, `dark-only`를 받는다. 하위 트리에 지정해 테마를 국소적으로 바꿀 수도 있다 [S19].
- **브랜드 색을 다른 색으로 바꾸는 공식 방법과 당근 외 제품을 위한 가이드는 찾지 못했다: UNVERIFIED.** `--seed-color-*` 변수 덮어쓰기는 추론이며 문서화된 계약이 아니다.

## 5. 플랫폼

- SEED는 명시적으로 "Mobile First"를 따른다 [S20]. 데스크톱도 문서화되어 있다.
  - 브레이크포인트: base 0, sm 480, md 768, lg 1280, xl 1440
  - 대시보드 레이아웃: 8 또는 12컬럼, 최대 폭 720 또는 1040px, 또는 fluid
  - 콘텐츠 레이아웃: 12컬럼, 최대 폭 1040 또는 1280px
  - 영역: Header, Side Nav(md 이상에서 표시), Main, Aside [S20]
- React는 반응형 props를 가진 Box, Flex, Grid, VStack, HStack과 Layout, Side Navigation 블록을 제공한다 [S21].
- Side Panel은 좌우에서 480·720·960px로 열린다. 모달 또는 persistent(비모달, 분할 레이아웃)가 가능하다. md 미만에서는 폭 80%가 되고, 반응형 변형은 Bottom Sheet로 바뀐다 [S22].

## 6. 컴포넌트 [S23][S9]

- 있음:
  - Tabs, Chip Tabs, Chip(3.0부터 Button·Toggle·Radio)
  - Bottom Sheet, Dialog, Alert Dialog, Side Panel
  - Help Bubble Tooltip, Popover, Skeleton, Callout, Badge, Notification Badge
  - Snackbar, Segmented Control, List, Avatar, Progress Circle
  - Menu, Select, Pagination, Table Pagination, Page Banner, Result Section
- 없음:
  - 별도 Drawer 컴포넌트 없음(Side Panel이 대신함)
  - Toast 없음(Snackbar가 대신함)
  - 선형 진행 바 없음
- **차트·그래프·데이터 시각화 컴포넌트는 없다(확인됨).**

## 7. 타이포그래피 [S24][S25]

- 폰트를 번들하지 않는다. `--seed-font-family`는 시스템 스택(-apple-system, "Apple SD Gothic Neo", Pretendard, …)이며 자동 적용되지 않아 `body`에 직접 지정해야 한다. Windows에서는 제품이 Pretendard를 직접 로드해야 한다.
- 크기: `$font-size.t1–t14`(11–48px, rem)와 `-static` px 변형
- 텍스트 스타일:
  - Scale: `t1Regular…t14Bold`
  - Semantic: `screenTitle`, `articleBody`, `articleNote`

## 8. 접근성 [S26]

- 역할 색상은 APCA 대비 기준으로 설계됐다: 읽는 텍스트 최소 Lc 75(권장 Lc 90), 기타 텍스트 Lc 60, placeholder·비활성 Lc 30.
- 터치 영역: 이상적 44px, 최소 24px.
- 누름 축소 피드백은 `prefers-reduced-motion`을 따른다.
- 키보드 표는 일부 컴포넌트 문서에만 있다(예: Side Panel의 Escape, Tab 포커스 트랩) [S22]. 전체 컴포넌트의 키보드 지원과 WCAG 2.x 대비 수치: UNVERIFIED.

## 9. 주의할 점

- Stackflow는 AppScreen과 stackflow 시트에만 필요하다 [S27].
- 많은 컴포넌트가 저장소에 복사되는 스니펫이라 메이저 업그레이드 시 재설치가 필요하다. `cli compat`으로 확인한다. `react`와 `css` 패키지 버전이 peer 범위에 맞아야 한다 [S3].
- **3.0은 배포된 지 2주이며 API 이름이 바뀌었다:** Dialog와 AlertDialog가 서로 바뀌었고, `Chip.Root`가 `Chip.Button`이 됐으며, Badge·Date Picker·Time Picker는 스니펫으로 옮겨졌다 [S28]. AI 도구는 여전히 2.x API를 생성할 수 있다.
- 문서는 한국어로만 제공된다.
- 일부 기능은 당근 앱을 전제로 한다(pull-to-refresh, 하단 내비게이션, 매너온도, WebView 폰트 스케일링, safe area) [S23][S8].
- 기본 브랜드 색은 당근 오렌지다.

## 출처

- S1 https://seed-design.io/updates/how-seed-evolved
- S2 https://registry.npmjs.org/@seed-design/react, https://registry.npmjs.org/@seed-design/css
- S3 https://seed-design.io/react/updates/upgrade
- S4 https://seed-design.io/get-started
- S5 NOTICE file in @seed-design/css@3.0.2 tarball
- S6 https://github.com/daangn/seed-design
- S7 https://seed-design.io/react/llms-full.txt
- S8 https://seed-design.io/react/getting-started/installation/manual
- S9 https://seed-design.io/react/llms.txt
- S10 https://github.com/daangn/seed-design/blob/dev/ARCHITECTURE.md
- S11 https://seed-design.io/foundations/design-token/reference
- S12 https://seed-design.io/foundations/color/palette
- S13 https://seed-design.io/foundations/color/color-role
- S14 https://seed-design.io/foundations/radius
- S15 https://seed-design.io/foundations/spacing
- S16 https://seed-design.io/foundations/elevation
- S17 https://seed-design.io/foundations/motion
- S18 https://seed-design.io/foundations/gradient
- S19 https://seed-design.io/react/getting-started/styling/theming
- S20 https://seed-design.io/foundations/layout
- S21 https://seed-design.io/react/components/concepts/responsive-design
- S22 https://seed-design.io/components/side-panel, https://seed-design.io/react/components/side-panel
- S23 https://seed-design.io/components/llms.txt
- S24 https://seed-design.io/foundations/typography
- S25 https://seed-design.io/react/getting-started/styling/fonts
- S26 https://seed-design.io/foundations/inclusive-design
- S27 https://seed-design.io/react/stackflow/getting-started
- S28 https://seed-design.io/react/updates/upgrade/v3
