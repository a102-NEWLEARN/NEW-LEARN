---
version: alpha
name: NEW:LEARN
description: 뉴스 기사를 6하원칙 마인드맵과 이슈의 흐름으로 보여 주는 웹 서비스. SEED Design 을 그대로 쓰고 브랜드 색과 NEW:LEARN 패턴만 얹는다. 이 문서는 SEED 와 달라진 것과 화면을 만들 때 자주 찾는 SEED 값(참고)을 적는다.
status: draft
updated: 2026-10-30
sources:
  - imports/newlearn-design-system-v2/README.md
  - imports/newlearn-design-system-v2/tokens.css
  - imports/newlearn-design-system-v2/components/
  - imports/newlearn-design-system-v2/Foundations/
  - imports/newlearn-design-system-v2/assets/Logos/README.md
  - .working/research-seed-design.md
  - .working/reconcile-newlearn-design-system-v2.md
omitted:
  - section: spacing
    reason: SEED dimension · spacing 토큰을 그대로 쓴다
  - section: rounded
    reason: SEED radius 토큰(r0_5~r6 · full)을 그대로 쓴다. SEED 단계에 없는 3px 하나는 컴포넌트에 직접 적었다
colors:
  # NEW:LEARN 기본 색 11개. 화면 코드에서는 직접 쓰지 않고 아래 역할 토큰으로 쓴다
  brand-main: '#28CDAA'
  brand-dark: '#087F72'
  brand-pressed: '#066B61'
  brand-light: '#E7FAF5'
  brand-light-pressed: '#D0F5EC'
  brand-accent-lime: '#C7F36C'
  brand-background: '#FFFFFF'
  brand-background-subtle: '#FAFBFC'
  brand-text-primary: '#222B30'
  brand-text-secondary: '#66717A'
  brand-border: '#E7ECEF'
  # DESIGN.md 규격의 대표색. bg-brand-solid 와 같은 색이다
  primary: '{colors.brand-dark}'
  # 값을 바꾼 SEED 역할 14개
  fg-brand: '{colors.brand-dark}'
  fg-brand-contrast: '{colors.brand-pressed}'
  fg-neutral: '{colors.brand-text-primary}'
  fg-neutral-muted: '{colors.brand-text-secondary}'
  bg-brand-solid: '{colors.brand-dark}'
  bg-brand-solid-pressed: '{colors.brand-pressed}'
  bg-brand-weak: '{colors.brand-light}'
  bg-brand-weak-pressed: '{colors.brand-light-pressed}'
  bg-layer-default: '{colors.brand-background}'
  bg-neutral-muted: '{colors.brand-background-subtle}'
  bg-neutral-solid: '{colors.brand-text-primary}'
  stroke-brand-solid: '{colors.brand-dark}'
  stroke-brand-weak: '{colors.brand-main}'
  stroke-neutral-weak: '{colors.brand-border}'
  # SEED 에 없는 새 역할 19개 — 브랜드 3개와 기사 마인드맵 가지 4색 16개
  fg-brand-accent: '{colors.brand-main}'
  bg-brand-accent: '{colors.brand-main}'
  bg-accent-lime: '{colors.brand-accent-lime}'
  mindmap-core-fill: '#EEEAFE'
  mindmap-core-stroke: '#8B6CF0'
  mindmap-core-line: '#CDBFF8'
  mindmap-core-text: '#5B3FC4'
  mindmap-cause-fill: '#EEF8D8'
  mindmap-cause-stroke: '#8DBF3F'
  mindmap-cause-line: '#CFE6A2'
  mindmap-cause-text: '#4F7A12'
  mindmap-reaction-fill: '#DCF5EA'
  mindmap-reaction-stroke: '#3FB585'
  mindmap-reaction-line: '#A6DFC5'
  mindmap-reaction-text: '#1E7A55'
  mindmap-outlook-fill: '#FDF1D0'
  mindmap-outlook-stroke: '#D19A2E'
  mindmap-outlook-line: '#ECD08A'
  mindmap-outlook-text: '#8A5E06'
typography:
  # SEED 텍스트 스타일과 다른 NEW:LEARN 패턴 텍스트 스타일 2가지. 나머지는 SEED 스타일 그대로다
  pattern-body-sm:
    fontSize: 0.875rem
    lineHeight: 1.25rem
    fontWeight: 400
  status-label:
    fontSize: 0.6875rem
    lineHeight: 0.9375rem
    fontWeight: 700
    letterSpacing: 0.02em
components:
  button-primary:
    backgroundColor: '{colors.bg-brand-solid}'
    textColor: '#FFFFFF'
  button-primary-pressed:
    backgroundColor: '{colors.bg-brand-solid-pressed}'
    textColor: '#FFFFFF'
  text-link:
    textColor: '{colors.fg-brand}'
  filter-chip-selected:
    backgroundColor: '{colors.bg-brand-weak}'
    textColor: '{colors.fg-brand-contrast}'
    rounded: 8px
    height: 32px
  filter-chip-selected-pressed:
    backgroundColor: '{colors.bg-brand-weak-pressed}'
    textColor: '{colors.fg-brand-contrast}'
  list-row-selected:
    backgroundColor: '{colors.bg-brand-weak}'
    textColor: '{colors.fg-neutral}'
  issue-card:
    backgroundColor: '{colors.bg-layer-default}'
    textColor: '{colors.fg-neutral}'
    rounded: 16px
    padding: 20px
  issue-card-latest:
    backgroundColor: '{colors.bg-layer-default}'
    textColor: '{colors.fg-neutral}'
    typography: '{typography.pattern-body-sm}'
  card-meta:
    backgroundColor: '{colors.bg-layer-default}'
    textColor: '{colors.fg-neutral-muted}'
  evidence-quote:
    backgroundColor: '{colors.bg-neutral-muted}'
    textColor: '{colors.fg-neutral}'
    rounded: 12px
  border-line:
    backgroundColor: '{colors.stroke-neutral-weak}'
    height: 1px
  tab-indicator:
    backgroundColor: '{colors.bg-brand-solid}'
    height: 2px
  timeline-rail:
    backgroundColor: '{colors.stroke-brand-weak}'
    width: 2px
  timeline-node:
    backgroundColor: '{colors.bg-brand-accent}'
    size: 12px
    rounded: 3px
  status-new:
    backgroundColor: '{colors.bg-brand-weak}'
    textColor: '{colors.fg-brand-contrast}'
    typography: '{typography.status-label}'
    rounded: 4px
    height: 20px
  landing-accent:
    backgroundColor: '{colors.bg-accent-lime}'
---

# NEW:LEARN 디자인

NEW:LEARN 화면은 **SEED Design 을 그대로 쓰고 브랜드 색과 NEW:LEARN 패턴만 얹는다.** 값을 찾는 순서는 이 문서 → v2 패턴 README → SEED 기본값이다.
이 문서의 원본은 NEW:LEARN 디자인 시스템 v2 다 (`imports/newlearn-design-system-v2/`). 이 문서와 원본이 다르면 이 문서를 따른다.
절 제목은 DESIGN.md 규격 검사기(lint)가 영어 이름으로 순서를 보기 때문에 영어로 둔다.

| SEED 와 달라진 것 | 얼마나 | 어느 절 |
| --- | --- | --- |
| 새 기본 색 | 11개 | Colors |
| 값을 바꾼 SEED 역할 | 14개 | Colors |
| 새 역할 | 19개 (마인드맵 가지 색 16개 포함) | Colors |
| SEED 에 없는 텍스트 스타일 | 2가지 | Typography |
| 라이트 테마 고정 | — | Brand & Style |
| 그림자를 쓰는 곳 | 뜨는 요소만 | Elevation & Depth |
| 모서리를 쓰는 곳 · SEED 에 없는 3px | — | Shapes |
| NEW:LEARN 패턴 · 상태 라벨 · 태그 · 상태 모양 | 패턴 6개 | Components |
| 쓰지 않는 표현 | — | Do's and Don'ts |
| **그대로 쓰는 것** | 글꼴 · 간격 토큰, 모서리 · 그림자 토큰 값 | 각 절 첫 문장 |

기사 마인드맵(F04) 두 보기의 가지 색은 Colors, 노드 모양 · 배치는 Components 에 있다. 노드 상세(F05)와 이슈 에볼루션 맵(F07) 배치는 아직 정하지 않았다. 맨 끝 「아직 정하지 않은 것」을 먼저 본다.

## Brand & Style

> 뉴스를 넘어, 흐름을 읽다.
> 흩어진 기사를 연결해, 새로운 맥락을 배울 수 있는 뉴스 플랫폼 NEW:LEARN.

브랜드 키워드는 「연결하다 · 맥락을 읽다 · 새로운 시각 · 신뢰할 수 있는 · 쉽고 빠르게 · 지속적인 학습」 여섯 가지다.
시각 원칙은 **밝고 산뜻하게, 정돈되게**다. 흰 배경이 중심이고 구분은 1px 테두리와 여백으로 한다.

밝은 민트는 로고 · 아이콘 · 그래프 같은 그래픽에만 쓴다. 글자는 뉴트럴 차콜, 행동을 부르는 버튼(CTA)은 진한 청록이다.
말투는 SEED 원칙(명확한 · 이해하기 쉬운 · 사려 깊은)에 NEW:LEARN 키워드 「신뢰할 수 있는 · 쉽고 빠르게」를 더한다. 기본은 해요체다.
뉴스 서비스라 과장 · 단정 평가를 피한다. 보도가 엇갈리면 어느 쪽이 맞다고 판정하지 않고 「상충 후보」라고 쓴다.

**라이트 테마만 쓴다.** 다크 전환과 시스템 다크 모드 대응(`prefers-color-scheme`)을 넣지 않는다.
SEED 의 색 모드를 라이트로 고정한다 (`data-seed-color-mode="light-only"`). v2 `tokens.css` 의 다크 값은 참고용으로만 남아 있다.

로고는 심볼(L자 받침 위에 기사를 잇는 두 노드)과 워드마크를 플랫한 2색 벡터로 쓴다. 심볼은 민트 + 차콜, 워드마크는 차콜에 콜론만 민트다.
로고 둘레에는 심볼 높이의 1/4 이상을 비운다. 원본 규정이 오기 전까지 쓰는 임시값이다.

| 쓰는 곳 | 파일 (`imports/newlearn-design-system-v2/assets/Logos/`) | 규칙 |
| --- | --- | --- |
| 웹 헤더 | `newlearn-logo-horizontal.svg` | 높이 20–32px, 최소 20px |
| 브라우저 탭 아이콘 · 좁은 공간 | `newlearn-symbol.svg` | 최소 16px |
| 어두운 배경(차콜 · 청록 · 사진) | `newlearn-logo-reversed-white.svg` | 민트 + 흰색 |
| 밝은 민트 바탕 · 한 가지 색만 쓸 때 | `newlearn-logo-mono-dark.svg` | 민트 바탕에는 흰 로고 대신 이 차콜 단색 |
| 소개 · 표지 | `newlearn-logo-horizontal-slogan.svg` | 브랜드를 크게 보일 때 |

세로형과 앱 아이콘 파일은 v2 README 「로고」 절에 있다.

## Colors

색은 세 층이다. **기본 색 11개 → 역할 토큰 → 컴포넌트** 순서로 이어진다.
화면 코드는 역할 토큰을 쓰고 기본 색(`brand-*`)은 직접 쓰지 않는다. 역할로 나타내기 어려운 예외에만 SEED 팔레트(`palette-*`)를 직접 쓴다. 예외 목록은 이 절 끝에 있다.
역할 토큰 이름은 SEED 를 따라 속성 – 역할 – 변형 – 상태 순서다 (예: `bg-brand-solid-pressed`). 속성은 `fg`(글자 · 아이콘) · `bg`(배경) · `stroke`(선)다.

**기본 색 11개** — v2 가 새로 정한 NEW:LEARN 고유 색이다.

| 토큰 | 값 | 쓰는 곳 | 흰 배경 대비 |
| --- | --- | --- | --- |
| `brand-main` | #28CDAA | 로고 · 아이콘 · 그래프와 타임라인 노드 · 브랜드 강조 그래픽 | 2.0:1 — 글자 금지 |
| `brand-dark` | #087F72 | CTA 배경 · 브랜드 글자 · 링크 | 4.9:1 |
| `brand-pressed` | #066B61 | CTA 눌림 · 연한 민트 위 브랜드 글자 | 6.4:1 |
| `brand-light` | #E7FAF5 | 선택 상태 · 일부 강조 배경 | — |
| `brand-light-pressed` | #D0F5EC | 연한 민트의 눌림 (`brand-light` 와 `brand-main` 을 88:12 로 섞은 값) | — |
| `brand-accent-lime` | #C7F36C | 랜딩페이지의 아주 작은 포인트 | 글자 금지 |
| `brand-background` | #FFFFFF | 기본 배경 | — |
| `brand-background-subtle` | #FAFBFC | 영역 구분용 옅은 배경 | — |
| `brand-text-primary` | #222B30 | 본문 · 제목 (뉴트럴 차콜) | 14.4:1 |
| `brand-text-secondary` | #66717A | 보조 텍스트 | 5.0:1 |
| `brand-border` | #E7ECEF | 카드 · 입력 필드 테두리, 탭 바 밑선 | 1.2:1 (장식) |

**값을 바꾼 SEED 역할 14개** — SEED 의 당근 오렌지 · 회색을 위 기본 색으로 바꾼다.

| 역할 | 쓰는 곳 | SEED 원래 값 | NEW:LEARN 값 |
| --- | --- | --- | --- |
| `fg-brand` | 브랜드 글자 · 링크 | #FF6600 | #087F72 `brand-dark` |
| `fg-brand-contrast` | 연한 민트 위 브랜드 글자 | #E14D00 | #066B61 `brand-pressed` |
| `fg-neutral` | 본문 · 제목 | #1A1C20 | #222B30 `brand-text-primary` |
| `fg-neutral-muted` | 보조 텍스트 · 메타 | #555D6D | #66717A `brand-text-secondary` |
| `bg-brand-solid` | CTA 배경 | #FF6600 | #087F72 `brand-dark` |
| `bg-brand-solid-pressed` | CTA 눌림 | #E14D00 | #066B61 `brand-pressed` |
| `bg-brand-weak` | 선택 상태 배경 | #FFF2EC | #E7FAF5 `brand-light` |
| `bg-brand-weak-pressed` | 선택 상태 눌림 | #FFE8DB | #D0F5EC `brand-light-pressed` |
| `bg-layer-default` | 기본 배경 | #FFFFFF | #FFFFFF `brand-background` (값은 같고 가리키는 곳만 바뀜) |
| `bg-neutral-muted` | 영역 구분 · 근거 인용 배경 | #F7F8F9 | #FAFBFC `brand-background-subtle` |
| `bg-neutral-solid` | 진한 중립 면 (SEED 용도 그대로) | #2A3038 | #222B30 `brand-text-primary` |
| `stroke-brand-solid` | 선택 테두리 | #E14D00 | #087F72 `brand-dark` |
| `stroke-brand-weak` | 그래프 · 타임라인 선 | #FFD5C0 | #28CDAA `brand-main` |
| `stroke-neutral-weak` | 카드 · 입력 필드 테두리, 탭 바 밑선 | #DCDEE3 | #E7ECEF `brand-border` |

SEED 원래 값은 `@seed-design/css` 3.0.2 의 라이트 값이다 (2026-10-19 확인). SEED 는 색 값을 메이저 버전에서만 바꾼다.

**새 역할 19개** — SEED 에 없어서 NEW:LEARN 이 더한 역할이다. 브랜드 3개와 기사 마인드맵 가지 4색 16개다.

| 역할 | 값 | 쓰는 곳 |
| --- | --- | --- |
| `fg-brand-accent` | #28CDAA `brand-main` | 장식용 민트 아이콘 · 그래픽 |
| `bg-brand-accent` | #28CDAA `brand-main` | 그래프 · 타임라인 노드 채움 |
| `bg-accent-lime` | #C7F36C `brand-accent-lime` | 랜딩페이지 포인트 (`landing-accent`) |

**기사 마인드맵 가지 4색** — 가지마다 채움 · 테두리 · 선 · 글자 네 역할을 둔다. 이름은 `mindmap-<가지>-<fill · stroke · line · text>` 이고, 기사 마인드맵의 두 보기(흐름지도 · 마인드맵)에서만 쓴다. 값은 프로토타입 v21 `MM_TONE` 이다 (2026-10-30, S15P31A102-58).

| 가지 | 채움 `fill` | 테두리 `stroke` | 선 `line` | 글자 `text` |
| --- | --- | --- | --- | --- |
| 핵심 내용 `core` | #EEEAFE | #8B6CF0 | #CDBFF8 | #5B3FC4 |
| 원인·배경 `cause` | #EEF8D8 | #8DBF3F | #CFE6A2 | #4F7A12 |
| 반응 `reaction` | #DCF5EA | #3FB585 | #A6DFC5 | #1E7A55 |
| 전망 `outlook` | #FDF1D0 | #D19A2E | #ECD08A | #8A5E06 |

- 글자색은 흰 바탕 5.1 ~ 7.1:1, 그 가지 채움색 위 4.6 ~ 6.0:1 로 본문 글자 기준(4.5:1)을 넘는다. 그래서 흐름지도 번호 원은 글자색을 바탕으로 흰 숫자를 올린다.
- 테두리색은 흰 바탕 2.2 ~ 3.8:1 로 그림 기준(3:1)에 셋이 못 미친다. **노드는 늘 가지 이름 글자와 함께 두어** 색만으로 가지를 가리지 않는다.

**대비** — 흰 배경 대비는 위 표에 있다. 여기에는 다른 바탕 위의 대비만 적는다.

- 민트 면 위에 글자가 꼭 필요하면 차콜(7.1:1)을 쓴다. 흰 글자는 올리지 않는다(2.0:1).
- 연한 민트 배경 위 브랜드 글자 · 링크는 한 단계 진한 `fg-brand-contrast`(5.9:1)를 쓴다.
- 보조 텍스트 #66717A 는 옅은 배경 4.8:1, 연한 민트 4.6:1 로 본문 글자 기준(WCAG AA) 4.5:1 을 넘는다.

**그 밖의 SEED 색**

- 나머지 SEED 역할(positive · warning · critical · informative)은 그대로 쓴다.
- 성공을 뜻하는 초록(#079171)은 CTA 청록과 거의 같다. **성공 상태는 체크 아이콘과 문구를 함께 써서** 색만으로 전하지 않는다.
- 그라디언트는 스켈레톤 로딩의 `gradient-shimmer-neutral` 만 쓴다. 당근 앱 기능용 색(`banner-*` · 매너온도 `manner-temp-*`)은 쓰지 않는다.

**SEED 팔레트를 직접 쓰는 예외** — 역할 토큰으로 나타낼 수 없는 곳은 이것뿐이다.

| 팔레트 | 쓰는 곳 |
| --- | --- |
| `palette-carrot-100` · `palette-carrot-800` | CONFLICT(상충 후보) 라벨 · 노드 · 엇갈린 부분 칠하기. SEED 원래 브랜드 색인 당근 오렌지는 여기에만 남는다 |
| `palette-gray-500` | 카드 · 칩 Hover 테두리, 타임라인 곁가지 점선 |
| `palette-gray-600` | 타임라인 곁가지 노드 테두리 |

## Typography

**글꼴과 텍스트 스타일 체계는 SEED 그대로다.** SEED 에 없는 텍스트 스타일은 아래 세 가지뿐이다.

| 텍스트 스타일 | 값 | SEED 와 다른 점 | 쓰는 곳 |
| --- | --- | --- | --- |
| `pattern-body-sm` | 14px / 줄 높이 20px | SEED t4 는 줄 높이 19px | 이슈 카드 최근 사건, 좁은 기사 목록 제목, 타임라인 설명 · 곁가지 제목(곁가지 제목만 굵기 500) |
| `status-label` | 11px / 15px / 700, 자간 0.02em | SEED t1Bold 에 자간을 더함 | 상태 라벨 NEW · REPEAT · UPDATE · CONFLICT |
| 랜딩 큰 글자 | 화면 폭에 따라 크기가 변한다(`clamp`) — 첫 화면 NEW:LEARN 56 ~ 128px / 1.08, 섹션 제목 28 ~ 72px / 1.18 ~ 1.3, 스크롤 연출 문장 30 ~ 64px. 굵기 800, 자간 −0.03 ~ −0.05em | SEED 최대 t14(48px)보다 크고 폭에 따라 변한다 | 랜딩만 (프로토타입 v21 값, 2026-11-12 S15P31A102-32). NEW:LEARN 의 쌍점은 `fg-brand-accent` |

글꼴은 SEED 의 시스템 글꼴 순서를 쓴다. macOS · iOS · Android 는 시스템 기본 글꼴, Windows 는 Pretendard 다.
SEED 는 글꼴 파일을 함께 주지 않고 `body` 에 자동으로 걸지도 않는다. 웹 서비스라서 Pretendard 웹폰트를 직접 불러오고 `body` 에 SEED 글꼴 순서를 건다.

**SEED 텍스트 스타일 (SEED 값, 참고)** — 역할이 맞으면 시맨틱 스타일을 먼저 쓴다.

| 종류 | 스타일 | 크기 / 줄 높이 / 굵기 |
| --- | --- | --- |
| 시맨틱 | `screenTitle` 화면 주요 제목 | 26 / 35 / 700 |
| 시맨틱 | `articleBody` 본문 · 사건 요약 | 16 / 24 / 400 |
| 시맨틱 | `articleNote` 주석 · 원문 근거 인용 (일반 본문에는 안 씀) | 14 / 22 / 400 |
| 스케일 | `t1`(11px) ~ `t14`(48px) × Regular · Medium · Bold | t1–t5 본문 · 보조, t6–t10 제목, t11–t14 큰 화면 대형 제목 |

크기는 rem 단위(1rem = 16px)라 사용자 글자 크기 설정을 따라 커진다. 패턴마다 쓰는 단계는 각 패턴 README 에 있다.
한글 줄은 단어 단위로 바꾼다 — `body` 에 `word-break: keep-all` 을 건다. 좁은 화면에서 「외/환당국」「시/연」처럼 단어 중간에서 끊기던 것을 막는다. 띄어쓰기 없이 칸보다 긴 말(주소 · 영문)은 `overflow-wrap: break-word` 로 칸 안에서 끊는다. SEED 아래 시트 · 창(Dialog · AlertDialog) 본문은 글자 단위(`break-all`)로 끊어서 사건 시트 · 크게 보기 · 확인 창에도 단어 단위를 다시 건다(좁은 화면 서랍은 2026-11-12 뺐다, S15P31A102-195). 화면마다 따로 걸던 `break-keep` 은 지웠다 (2026-11-05 모바일 총점검, S15P31A102-175).
가운데 맞춘 짧은 제목 · 부제(홈 인사)는 줄 길이를 고르게 꺾는다(`text-wrap: balance`) — 한 단어만 다음 줄로 넘어가지 않게. 「사건 4 · 기사 12」 같은 개수 묶음은 줄바꿈 없는 칸으로 이어 숫자만 넘어가지 않게 하고, 항목 사이 점으로 줄이 시작하지 않게 한다. 항목을 나란히 늘어놓는 줄(「새로운 이슈」)은 사이 점 대신 항목마다 앞에 4px 민트 점을 붙인다 (2026-11-05 UI 점검, S15P31A102-182).
숫자가 세로로 줄을 맞춰야 하는 곳(카드 메타의 개수, 타임라인 날짜, 변화 카드 날짜)은 고정폭 숫자를 쓴다 (`font-variant-numeric: tabular-nums`). 변화 카드는 F10(추후 논의) 기능이다.

## Layout & Spacing

**간격 토큰은 SEED 그대로다.** 4px 기반 `dimension-x*` 단계(2px ~ 64px)를 쓰고 용도가 정해진 간격은 이름 있는 토큰을 먼저 쓴다.
이름 있는 간격(SEED 값, 참고)은 화면 좌우 여백 16px, 칩 사이 8px, 내비게이션–제목 20px, 컴포넌트 사이 12px, 텍스트 사이 6px, 화면 하단 56px 이다 (`spacing-x-*` · `spacing-y-*`).
**좁은 화면(767px 이하)의 콘텐츠 좌우 여백은 SEED 16px 대신 20px(`x5`)** 다 — 16px 은 글 · 카드가 화면 끝에 붙어 답답했다(2026-11-05 사용자). 위 막대(앱 헤더)는 아이콘 버튼이 안쪽 여백을 가져 16px 그대로다. 스크롤 끝에는 96px 를 남겨 마지막 내용이 용어사전 버튼에 가리지 않게 한다. 바뀌는 화면 목록은 EXPERIENCE.md Responsive & Platform.

레이아웃 그리드도 SEED 를 따른다. 콘텐츠 화면은 12컬럼이고 최대 너비 1040px(넓은 탐색 화면은 1280px)로 가운데 정렬한다.
브레이크포인트(sm 480 · md 768 · lg 1280 · xl 1440px)별 거터 · 마진은 v2 `Foundations/04-layout.md` 에 있다. 화면 크기별로 무엇이 바뀌는지는 EXPERIENCE.md 의 Responsive & Platform 절에 있다.

## Elevation & Depth

**층과 그림자 토큰은 SEED 그대로다.** 바뀐 것은 그림자를 쓰는 곳이다.

화면은 SEED 층 순서로 쌓는다 (SEED 그대로). 전체 배경(`bg-layer-basement`) 위에 콘텐츠(`bg-layer-default`)를 놓고 시트는 `bg-layer-floating` 으로 띄운다. 모달 뒤를 어둡게 덮는 딤은 `bg-overlay` 다.
카드 · 패널 · 리스트에는 그림자를 쓰지 않는다. 구분은 1px 테두리와 여백으로 한다.
그림자는 화면 위에 뜨는 요소(메뉴 · 팝오버 · Select · 오버레이로 띄운 패널)에만 `shadow-s3` 로 쓴다. 글로우와 입체 그라디언트는 어디에도 쓰지 않는다.
스크롤할 때 상단 내비게이션 아래를 어떻게 구분할지는 아직 정하지 않았다 (아래 「아직 정하지 않은 것」).

## Shapes

**모서리 토큰은 SEED 그대로다** (`radius-r0_5` 2px ~ `radius-r6` 24px, `radius-full`). NEW:LEARN 은 어디에 어느 단계를 쓰는지만 정한다.

| 모서리 | 쓰는 곳 |
| --- | --- |
| 16px `radius-r4` | 이슈 카드 · 사건 상세 패널 · 카드로 감싼 기사 리스트 (마이페이지 섹션은 상자 없이 줄로 나눈다 — 2026-11-12, S15P31A102-195) |
| 12px `radius-r3` | 원문 근거 박스 · 변화 카드(F10, 추후 논의) |
| 8px `radius-r2` | 필터 칩 · 기사 썸네일 · 아이콘 버튼 · 변화 카드 안 근거 칸 |
| 4px `radius-r1` | 상태 라벨 · 태그 |
| 3px (SEED 단계에 없음) | 타임라인 노드(12px 사각). 고른 노드 둘레 고리는 5px |
| 없음 | 데스크톱 오른쪽에 붙인 사건 상세 사이드 패널 (왼쪽 테두리만 둔다) |

필터 칩 · 태그 · 상태 라벨은 알약 모양으로 만들지 않는다. SEED 칩은 알약 모양(`radius-full`)이지만 NEW:LEARN 필터 칩은 모서리 8px 사각이다.

## Components

SEED 컴포넌트(Action Button · Tabs · Chip · Dialog · Side Panel · Snackbar 등)는 개발 단계에서 SEED React 로 들여온다. 색은 SEED 역할 변수를 Colors 절의 값으로 덮어써서 맞춘다. SEED 가 이 방법을 지원하는지는 확인 중이다 (아래 「아직 정하지 않은 것」).
**SEED 컴포넌트와 NEW:LEARN 패턴의 모양이 다르면 패턴을 따른다.** 필터 칩의 8px 모서리가 그렇다.

**요소별 역할 토큰** — 오른쪽 칸은 frontmatter `components` 의 키다.

| 요소 | 배경 | 글자 · 테두리 | frontmatter 키 |
| --- | --- | --- | --- |
| 주요 버튼(CTA) | `bg-brand-solid` → 눌림 `bg-brand-solid-pressed` | 글자 `fg-on-brand-solid`(흰색) | `button-primary` · `button-primary-pressed` |
| 보조 버튼 | `bg-layer-default` | 글자 `fg-neutral`, 테두리 `stroke-neutral-weak` (SEED `neutralOutline`). 가입 · 로그인 · 기사 머리(*원문 보기*) · 확인 창의 머무는 버튼(*계속 고치기*)이 모두 이 모양이다 — 회색 채움(`neutralWeak`) · 글자만(`ghost`)으로 화면마다 달랐다 (2026-11-05 UI 점검). 글자만인 버튼은 *더 보기* · *관심사 편집* 같은 작은 보조 동작에만 | — |
| 텍스트 링크 | — | `fg-brand`, 굵기 500, 평소에는 밑줄 없음 | `text-link` |
| 선택된 필터 칩 | `bg-brand-weak` → 눌림 `bg-brand-weak-pressed` | 글자 `fg-brand-contrast` + 16px 체크 아이콘, 1px 테두리 `stroke-brand-solid` | `filter-chip-selected` · `filter-chip-selected-pressed` |
| 선택된 리스트 행 · 타임라인 본문 | `bg-brand-weak` | 글자색 그대로, 테두리 없음 | `list-row-selected` |
| 카드 · 패널 | `bg-layer-default` | 테두리 `stroke-neutral-weak`, 제목 `fg-neutral`, 메타 `fg-neutral-muted` | `border-line` · `card-meta` |
| 카드 · 리스트 · 패널 안쪽 구분선 | — | 1px `stroke-neutral-subtle` (테두리보다 옅게) | — |
| 영역 구분 · 근거 인용 | `bg-neutral-muted` | 글자 `fg-neutral`, 원문 근거 박스는 1px `stroke-neutral-weak` 테두리 | `evidence-quote` |
| 입력 필드 | `bg-layer-default` | 테두리 `stroke-neutral-weak`, 안내 글자 `fg-placeholder`, 포커스 `stroke-focus-ring` | — |
| 그래프 · 타임라인 노드와 선 | `bg-brand-accent` | 선 `stroke-brand-weak` | `timeline-node` · `timeline-rail` |

**NEW:LEARN 패턴 6개** — 서비스에서 반복되는 화면 단위다. 색 · 글자 · 간격 · 상태별 모양 전체는 각 원본 README 에 있다 (`imports/newlearn-design-system-v2/components/<패턴>/README.md`).

| 패턴 | 쓰는 곳 | 모양의 핵심 |
| --- | --- | --- |
| IssueCard 추천 이슈 카드 | 홈 · 이슈 목록 | 흰 카드, 1px 테두리, 16px 모서리, 그림자 없음. 머리는 업데이트 날짜(A2 `lastEventAt`, 「10.09 업데이트」 청록 글자) — 카드는 분야 탭 아래에만 놓여 카드마다 같은 분야명이 되풀이됐다. 제목은 최대 2줄, 최근 사건 앞에 8px 민트 노드와 「최근 사건」(날짜는 머리에 있어 다시 적지 않는다) (`issue-card` · `issue-card-latest`). 카드가 두 열 이상 놓이는 640px 이상에서는 제목 · 최근 사건 제목이 늘 두 줄 자리를 잡아 같은 줄 카드의 안쪽 줄이 맞는다 (2026-11-16 디자인 피드백, Jira 216). 호버 · 키보드 포커스 때 사건 · 기사 수 줄 오른쪽 끝에 「흐름 보기 ›」(`fg-brand` 13px 굵게, 프로토타입 v21 `im-rec-arrow`)가 나타난다 |
| ArticleList 최신 기사 리스트 | 최신 기사 목록 · 패널 안 관련 기사 | 제목 중심(최대 2줄, 16px 굵게 — 언론사 · 날짜 줄과 명암 차이를 키웠다, 2026-11-16 디자인 피드백 · Jira 216), 언론사 · 날짜는 보조(12px `fg-neutral-muted`). 행 사이 안쪽 구분선, 리스트 자체에는 테두리 없음. 홈 최신 기사 · 나의 뉴스함은 호버 · 키보드 포커스 때 행 링크 오른쪽 끝에 「마인드맵 보기 ›」(카드와 같은 모양, 프로토타입 v21 `im-row-hint`)가 나타난다 |
| CategoryTabs 카테고리 탭과 필터 칩 | 카테고리 전환 · 목록 좁히기 | 탭은 기본 `fg-neutral-muted` Medium, 선택 `fg-neutral` Bold + 2px 청록 밑줄(탭 바 밑선 위에 겹침, `tab-indicator`). 좁은 화면은 14px — 바로 위 보기 탭(「추천 이슈 / 최신 기사」 · 「흐름지도 / 마인드맵」, 16px · 줄을 반씩)보다 한 단계 아래로 보인다. 탭 줄이 넘치면 가로로 밀고, 더 밀 것이 남았으면 오른쪽 끝 40px 를 흐린다 (2026-11-05 UI 점검). 칩은 높이 32px · 모서리 8px |
| EventDetailPanel 사건 상세 패널 | F08 사건별 관련 기사 조회 | 최대 너비 480px 흰 패널. 제목 · 날짜 · 요약 · 원문 근거 · 관련 기사/관점 탭 순서, 근거는 옅은 배경 박스. 맨 아래 이전 · 다음 사건은 반씩 두 칸이고, 하나뿐이면 줄을 다 쓴다(다음은 오른쪽 정렬) |
| Timeline 타임라인 | F07 사건 중심 이슈 에볼루션 맵 | 세로 2px 민트 선 위에 사건 노드. 노드 모양은 아래 표. 좁은 화면은 이 세로 목록 그대로다 — 줄마다 날짜 · 기사 수(12px) 위에 제목 전체(메인 16px · 서브 14px 굵게), 노드는 글 첫 줄 높이, 달마다 12px 굵은 제목. 넓은 화면은 가로 시간축 · 레인 지도 — 사건 라벨은 이름 15px 굵게 · 날짜 · 기사 수 13px 다(2026-11-12 사용자 QA, Jira 197 — 13 · 12px 는 읽기 어려웠다). 같은 날 · 같은 레인 사건은 아래로 쌓고 두 줄 라벨 사이에 12px 를 남긴다(쌓는 간격 48px, 메인 선 위 사건 바로 아래만 62px). 라벨은 이름 줄을 사건 가운데에 맞추고, 메인 흐름 선 위 사건만 선 밑에 둔다 (2026-11-10, Jira 188 — 30px 로는 날짜 줄이 다음 사건 옆에 왔다) |
| ChangeCard 변화 카드 | F10 근거 기반 변화 카드 (추후 논의 기능) | 이전 · 이후 근거를 나란히. CONFLICT 는 두 보도를 똑같은 모양으로 두고 판정하지 않음 |

**타임라인 노드** — 메인 흐름 · 곁가지 · 최신 · 선택만 구분하고 CONFLICT 하나만 예외로 주황 테두리를 쓴다.

| 노드 | 모양 |
| --- | --- |
| 메인 흐름 | 12px 사각(모서리 3px) `bg-brand-accent` 채움 + 3px 흰 링. 링은 그림자가 아니라 선이 노드 둘레에서 끊겨 보이게 하는 테두리다 |
| 곁가지 | 10px 빈 사각, 2px `palette-gray-600` 테두리, 16px 들여씀. 메인 선에서 2px 점선 `palette-gray-500` 으로 갈라지고 제목이 한 단계 작다 |
| 최신 | 가장 늦게 일어난 사건 하나(같은 시각이면 id 가 큰 것)만 `bg-brand-solid`(짙은 청록)로 채운다. 크기 · 흰 링은 그 레인 노드 그대로이고, 곁가지여도 채운다. 화면 읽기 이름 끝에 「최신 사건」 (2026-11-16 디자인 피드백, Jira 216) |
| 선택 | 노드 채움은 그대로 두고 둘레(노드에서 4 ~ 5px 바깥)에 2px `bg-brand-solid` 고리 + `bg-brand-weak` 바탕(모서리 5px), 본문 배경 `bg-brand-weak`, 넓은 화면은 시간축에 날짜 가이드. 전에는 16px `bg-brand-solid` 로 채워 최신 사건과 헷갈렸다 (Jira 216) |
| CONFLICT | 빈 사각에 2px `palette-carrot-800` 테두리 |
| 호버 · 고를 때 | 마우스를 올린 노드는 1.15배. 고르면 둘레에 2px `bg-brand-solid` 사각 고리가 2.6배로 번지며 사라진다 (움직임은 EXPERIENCE.md 「모션」) |

**기사 마인드맵 두 보기** — F04 기사 마인드맵 생성. 같은 A9 응답을 두 모양으로 그린다. 가지 색은 Colors 「기사 마인드맵 가지 4색」, 동작은 EXPERIENCE.md 보기 탭에 있다. 프로토타입 v21 `MindmapGraph` · `MindmapFlowMap` 을 따랐다 (2026-10-30, S15P31A102-58).

| 요소 | 모양 |
| --- | --- |
| 마인드맵 — 가운데 | 반지름 28px `bg-brand-accent` 원. 기사 제목 16px |
| 마인드맵 — 가지 | 반지름 20px 원, 가지 채움 + 테두리. 가운데에서 가로 220px — 핵심 오른쪽 위 · 원인 왼쪽 위 · 반응 오른쪽 아래 · 전망 왼쪽 아래. 바깥쪽에 가지 이름 14px 굵게와 질문 12px |
| 마인드맵 — 잎 | 반지름 9px 흰 원 + 가지 테두리. 가지에서 바깥으로 230px, 위아래는 이웃 두 잎 글 높이의 반씩 + 12px(최소 58px — 두 잎 줄 수의 합이 5 이하면 58px). 글 13px, 16자에서 줄을 바꾸고 4줄에서 「…」(가운데 글은 14자 3줄, 앞의 「[속보]」 같은 말머리는 뺀다 — 2026-11-12 사용자 QA, Jira 197). 잘린 글은 마우스를 올리면 전체가 뜬다 (2026-11-10, Jira 188 — 14자 3줄 · 58px 로는 운영에서 잎 글이 자주 잘리고 붙어 보였다). 전망 가지 잎은 점선 원 |
| 마인드맵 — 강조 · 흐리기 | 강조한 잎은 테두리색으로 채운다. 가지 포커스면 나머지 가지를 22% 로 흐리고 1.5px 번지게 한다. 잎 글은 `fg-neutral-muted`, 마우스를 올리거나 강조하면 `fg-neutral` |
| 마인드맵 — 호버 | 마우스를 올린 노드는 1.12배, 가지 원은 둘레 6px 가 가지 채움색으로 찬다(포커스한 가지는 늘 찬다). 이어진 선은 가지 선색 대신 테두리색이고 그 위로 흰 점선(3 · 9)이 흐른다. 이어지지 않은 노드 · 선은 25% (프로토타입 v21 은 16%. 흐린 글이 비치게 옅게 했다). 강조한 잎까지의 선도 테두리색이다 |
| 마인드맵 — 파문 | 가운데 원 둘레에 2px `bg-brand-accent` 고리, 강조한 잎 둘레에 2px 가지 테두리색 고리가 2.6배로 번지며 사라진다 |
| 흐름지도 — 머리 줄 | `bg-brand-weak`(옅은 민트) 칸(모서리 12px, 안쪽 여백 16 · 14px, 768px 이상 20 · 16px) 안에 16px 민트 점(흰 4px 링) + 「기사 핵심」 12px + AI 한 줄 요지(A8 `summary`) 20px 굵게, 자리가 640px 보다 좁으면 18px. 요지가 없으면 두지 않는다. 전에는 기사 제목이라 바로 위 h1 과 같은 글이 두 번 보였다 (2026-11-12 사용자 QA, Jira 197). 민트 칸은 요약부터 눈이 가게 넣었다 (2026-11-16 디자인 피드백, Jira 216) |
| 흐름지도 — 가지 | 30px 번호 원(가지 글자색 바탕, 흰 숫자 14px 굵게) + 질문 18px 굵게 + 「가지 이름 · N개」 13px 굵게 가지 글자색 |
| 흐름지도 — 잎 카드 | 흰 카드, 1px `stroke-neutral-weak` 테두리, 모서리 14px. 12px 원(2.5px 가지 테두리, 전망은 점선) + 잎 문장 16px 전체. 전망 잎은 「전망·해석」 점선 태그 |
| 흐름지도 — 상태 | Hover 는 테두리를 가지 선색으로 바꾸고 카드를 2px 띄우며 원을 1.25배로 키운다(그림자는 없다). 강조는 가지 테두리 두 겹 + 가지 채움 바탕, 원도 테두리색으로 채운다. 나머지 카드는 55% |
| 흐름지도 — 배치 | 자리가 1024px 이상이면 가지 하나가 한 열 — 가지 수만큼 2 · 3 · 4열이고 최대 폭은 960 · 1200 · 1280px(열 사이 28px, 번호 원 사이를 2px 선 + 화살표로 잇는다). 4열 고정이면 두 갈래 기사가 왼쪽에 좁게 몰리고 문장이 길게 꺾였다 (2026-11-16 디자인 피드백, Jira 216). 가지가 하나이거나 자리가 좁으면 세로(가지 사이 40px, 번호 원 아래로 2px 선, 잎 카드는 260px 이상 칸으로 채우고 카드 사이 12px) |

**상태 라벨** — 높이 20px, 모서리 4px 사각이다 (`status-label` 텍스트 스타일, 12px 아이콘, `status-new`).

색만으로 구분하지 않고 **항상 글자와 아이콘을 함께 쓴다.**

| 상태 라벨 | 뜻 | 배경 / 글자 | 아이콘 |
| --- | --- | --- | --- |
| NEW | 처음 등장한 사건 | `bg-brand-weak` / `fg-brand-contrast` | `plus-small` |
| REPEAT | 앞선 사건과 같은 내용의 반복 보도 | `bg-neutral-weak` / `fg-neutral-muted` | `arrow-clockwise-circular` |
| UPDATE | 앞선 사건의 수치 · 일정 등이 바뀜 | `bg-informative-weak` / `fg-informative-contrast` | `pencil` |
| CONFLICT | 보도끼리 엇갈리는 상충 후보 | `palette-carrot-100` / `palette-carrot-800` | `arrow-right-arrow-left` |

**태그** — 모서리 4px 의 작은 사각 라벨이다. 높이 · 아이콘 규정은 없다.

| 태그 | 배경 / 글자 |
| --- | --- |
| 핵심 이슈 | `bg-brand-weak` / `fg-brand-contrast` |
| 새로운 정보 · 업데이트 | `bg-informative-weak` / `fg-informative-contrast` |
| 속보 | `bg-critical-weak` / `fg-critical` |
| 심층 분석 · 전문가 분석 | `bg-neutral-weak` / `fg-neutral-muted` |

**상태별 모양** — 카드 · 칩 · 리스트에 쓴다. 탭은 예외로, Hover 에 글자색이 진해지고 선택에 굵은 글자와 밑줄이 붙는다.

| 상태 | 모양 |
| --- | --- |
| Hover | 테두리를 `palette-gray-500` 으로 진하게(카드 · 칩), 또는 배경 `bg-layer-default-pressed`(리스트 행 · 타임라인 본문) |
| Selected | 이슈 카드 · 변화 카드(F10, 추후 논의)는 2px `stroke-brand-solid` 테두리. 칩 · 리스트 행은 위 요소 표를 따른다 |
| Focus | 2px `stroke-focus-ring` 윤곽선 |
| 색 전환 | `duration-color-transition` + `timing-function-easing` |

**아이콘** — Seed Icon 을 그대로 쓴다.

- 기본 24px, 최소 12px 이다. 글자와 한 줄에 놓을 때는 16 · 20 · 24px 중에서 고른다.
- 기본은 Line 형이고 켜짐 · 선택 상태와 15px 이하에서는 Fill 형을 쓴다.
- 색은 글자처럼 `fg-neutral` · `fg-neutral-muted`, 뜻을 전하는 브랜드 아이콘은 `fg-brand`, 장식용 민트 그래픽은 `fg-brand-accent` 다. 민트(2.0:1)는 혼자 뜻을 전하는 아이콘에 쓰지 않는다.

## Do's and Don'ts

| 한다 | 하지 않는다 |
| --- | --- |
| 흰 배경을 중심에 두고 1px 테두리와 여백으로 나눈다 | 카드 · 패널에 그림자 · 글로우 · 입체 그라디언트 넣기 |
| 라이트 테마로 고정한다 | 다크 전환 · 시스템 다크 모드 대응 넣기 |
| 로고는 원래 색 · 비율 그대로 쓴다 | 로고 색 · 비율 바꾸기, 워드마크를 다른 글꼴로 다시 쓰기 |
| 화면 코드에서 역할 토큰(`fg-*` · `bg-*` · `stroke-*`)을 쓴다 | 기본 색(`brand-*`)을 화면 코드에 직접 쓰기 |
| 글자는 차콜, CTA 는 청록 `bg-brand-solid` 로 쓴다 | 민트 #28CDAA 를 글자색으로 쓰기, 민트 위에 흰 글자 올리기 |
| 라임은 랜딩페이지의 아주 작은 포인트에만 쓴다 | 라임을 앱 화면의 상태 표현에 쓰기 |
| 상태 라벨은 글자 + 아이콘으로 함께 전한다 | 색만으로 상태 구분하기 (특히 성공 초록과 CTA 청록) |
| CONFLICT 는 「상충 후보」라고 쓰고 두 보도를 같은 모양으로 둔다 | 빨강(critical) · 「오보」 · 「거짓」 쓰기, 한쪽만 흐리거나 강조하기 |
| — | SEED 의 AI 그라디언트(`gradient-*-magic`), 어두운 네이비 · 탁한 녹색 · 올리브색 쓰기 |
| 칩 · 라벨 · 태그는 모서리 4–8px 사각, 탭은 글자 + 밑줄로 만든다 | 알약 모양을 여러 줄 반복하기, 탭을 칩 모양으로 만들기 |
| 선택 칩은 연한 민트 배경 + 청록 테두리로 둔다 | 선택 칩을 진한 청록으로 꽉 채우기 (CTA 와 헷갈림) |
| 선택은 테두리나 연한 민트 배경으로 보인다 | 왼쪽 색 막대로 선택 · 근거 표시하기, 요약을 민트 배경 박스에 넣기 |
| 카드는 카테고리와 상관없이 같은 흰 카드로 둔다 | 카드 배경을 민트로 채우기, 카테고리 · 관점마다 색 바꾸기 |
| 제목을 가장 눈에 띄게 둔다 | 썸네일 · 언론사 로고를 제목보다 크게 두기, 날짜를 제목 앞에 두기 |
| 변화 카드(F10, 추후 논의)의 이전 · 이후는 시점 차이로만 보여 준다 | 이후 근거를 초록 체크, 이전 근거를 빨강 X 로 표시하기 |

## 아직 정하지 않은 것

- **F05 노드 상세 및 근거 확인 화면** — v2 에 없고 추후 기능이다. F04 기사 마인드맵 두 보기의 모양은 Components 에 옮겼다(2026-10-30, S15P31A102-58).
- **흐름지도에서 강조한 잎 카드의 가지색 바탕** — Do's and Don'ts 의 「카드 배경을 관점마다 색 바꾸기」에 걸리는지 팀이 확인한다. 프로토타입 v21 을 따랐고, 강조하지 않은 카드는 흰 카드다.
- **원인·배경 가지의 연두(#8DBF3F · #4F7A12)** — Do's and Don'ts 의 「올리브색 쓰지 않기」에 걸리는지 팀이 확인한다.
- **F07 이슈 에볼루션 맵의 배치** — 노드 · 선 · 상태 라벨 모양은 Timeline 패턴을 따른다. 좁은 화면은 v2 Timeline 세로 목록을 쓴다(2026-11-05). 넓은 화면의 가로 시간축 · 레인 지도 배치는 문서로 정하지 않았다(프로토타입 v21 LaneTimeline 을 따랐다).
- **SEED 에 브랜드 색을 입히는 방법** — v2 는 SEED CSS 변수(`--seed-color-*`)를 덮어쓰라고 적었지만 SEED 공식 문서에서 이 방법을 지원한다는 근거는 아직 못 찾았다. S15P31A102-83 에서 확인한다.
- **스크롤할 때 상단 내비게이션 아래 구분** — SEED 는 그림자나 선으로 나누라고 하지만 NEW:LEARN 은 뜨는 요소에만 그림자를 쓴다. 선으로 할지 `shadow-s1` 을 허용할지 정해야 한다.
- **로고 원본** — 지금 로고는 가이드 이미지를 따라 다시 그렸다. 심볼 원본 벡터 · 워드마크 원본 글꼴 · 로고 여백 규정이 오면 바꾼다.
