# NEW:LEARN

NEW:LEARN 웹 프로토타입용 디자인 시스템입니다. 색상 역할·타이포그래피·간격·모션·아이콘 같은 기반은 당근의 오픈소스 디자인 시스템 [SEED](https://github.com/daangn/seed-design)(Apache 2.0)를 그대로 쓰고, 그 위에 NEW:LEARN의 밝은 민트 브랜드와 로고, 그리고 서비스에서 반복되는 UI 패턴을 정리했습니다. 실제 개발에서는 SEED React를 따로 도입하므로, 이 시스템은 화면 설계와 프로토타입의 일관성을 위한 기준입니다.

토큰 이름은 SEED의 `$color.fg.brand` → `fg-brand`처럼 점을 하이픈으로 바꾼 형태이고, NEW:LEARN 고유 색은 `brand-*`입니다. SEED에서 가져온 부분의 라이선스 고지는 **라이선스 고지(NOTICE)** 섹션에 있습니다.

## 라이트 테마 고정

NEW:LEARN은 **라이트 테마만** 씁니다. 모든 화면과 예시는 흰 배경(`bg-layer-default`)과 중립적인 표면 위에서 설계합니다.

- 프로토타입 페이지에는 `<html data-theme="light">`를 두고, 다크 전환이나 `prefers-color-scheme` 대응을 넣지 않습니다.
- `tokens.json`의 Dark 값은 SEED 원본 구조를 지키기 위해 남겨 둔 참고용입니다. 이 가이드의 설명·대비 수치·예시는 모두 Light 기준입니다.
- 컴포넌트 미리보기도 뷰어 테마와 상관없이 Light로 고정되어 있습니다.

## 브랜드

> **뉴스를 넘어, 흐름을 읽다.**
>
> 흩어진 기사를 연결해, 새로운 맥락을 배울 수 있는 뉴스 플랫폼 NEW:LEARN.

키워드: **연결하다 · 맥락을 읽다 · 새로운 시각 · 신뢰할 수 있는 · 쉽고 빠르게 · 지속적인 학습**

**시각 원칙 — 밝고 산뜻하게, 정돈되게**

- 흰 배경이 중심입니다. 연한 민트(`bg-brand-weak`)는 선택 상태와 일부 강조에만 씁니다.
- 밝은 민트 #28CDAA는 로고·아이콘·그래프와 타임라인 노드 같은 **그래픽**에 씁니다. 글자는 뉴트럴 차콜, 행동을 부르는 버튼은 진한 청록 #087F72입니다.
- 라임 #C7F36C는 랜딩페이지의 아주 작은 포인트에만. 앱 화면의 상태 표현에는 쓰지 않습니다.
- 구분은 1px 테두리와 여백으로 합니다. 글로우, 입체 그라디언트, 카드 그림자를 쓰지 않습니다(그림자는 메뉴·팝오버처럼 화면 위에 뜨는 요소의 `shadow-s3`만).
- SEED 원본의 오렌지·핑크 AI 그라디언트(`gradient-*-magic`)는 NEW:LEARN 브랜드 표현에 쓰지 않습니다.
- 어두운 네이비, 탁한 녹색, 올리브색 계열은 쓰지 않습니다.

## 로고

심볼(L자 받침 위에 기사를 잇는 두 노드)과 워드마크 NEW:LEARN의 형태는 그대로 두고, 표현만 **플랫한 2색 벡터**로 다듬었습니다. 입체 면(베벨)과 그라디언트를 없애고, 심볼은 민트 #28CDAA + 차콜 #222B30, 워드마크는 차콜에 콜론만 민트입니다. 노드 연결선을 조금 굵게 해 20–24px 높이의 헤더에서도 끊기지 않게 했습니다. 파일은 Assets의 **Logos**·**App-Icons**에 SVG로 있습니다(ZIP에는 PNG도 함께).

| 파일 | 색 | 언제 쓰나 |
| --- | --- | --- |
| `newlearn-logo-horizontal.svg` | 심볼 민트+차콜, 워드마크 차콜, 콜론 민트 | 기본. 웹 헤더(높이 20–32px), 문서 |
| `newlearn-logo-horizontal-slogan.svg` | 위 + 슬로건 `fg-neutral-muted` | 소개·표지처럼 브랜드를 크게 보일 때 |
| `newlearn-logo-vertical.svg` | 세로형, 슬로건 포함 | 정사각형에 가까운 공간 |
| `newlearn-logo-mono-dark.svg` | 차콜 단색(받침과 막대 사이 3px 틈으로 형태 유지) | 한 가지 색만 쓸 수 있을 때 |
| `newlearn-logo-reversed-white.svg` | 민트 + 흰색 | 차콜·진한 청록·사진 등 어두운 배경 |
| `newlearn-symbol.svg` | 민트+차콜 | 파비콘, 좁은 공간 |
| `newlearn-app-icon-color/dark/light.svg` | 민트 바탕+차콜 심볼 / 차콜 바탕+민트·흰 심볼 / 흰 바탕+기본 심볼 | 앱 아이콘 |

- 밝은 배경에는 기본 로고, 어두운 배경에는 반전형을 씁니다. 민트 바탕에는 흰색이 아니라 차콜 심볼을 씁니다.
- 최소 크기: 가로형 높이 20px, 심볼 16px.
- 색·비율을 바꾸거나 워드마크를 다른 글꼴로 다시 쓰지 않습니다.

**확정 전에 필요한 원본 리소스.** 이번 로고는 브랜드 가이드 이미지(래스터)를 따라 다시 그린 것이라 원본과 미세하게 다를 수 있습니다. 확정하려면 다음이 필요합니다.

1. 심볼 원본 벡터(AI·SVG·Figma) — 현재 심볼의 비례·모서리 반경·연결선 각도는 이미지에서 잰 값입니다.
2. 워드마크에 쓴 원본 글꼴 이름 — 현재 워드마크는 형태가 가장 가까운 Poppins ExtraBold(OFL) 윤곽선으로 만들었고, 콜론은 원본처럼 큰 원 두 개로 따로 그렸습니다.
3. 로고 여백(clear space)·최소 크기 규정이 있다면 그 값.

## 출처와 라이선스

- NEW:LEARN 로고·슬로건·브랜드 색은 NEW:LEARN의 자산입니다. 워드마크·슬로건 윤곽선은 Poppins와 Pretendard(둘 다 SIL Open Font License)에서 만들었습니다.
- SEED 토큰·문서와 Seed Icon 아이콘은 Apache 2.0입니다. 재배포할 때는 라이선스 사본과 NOTICE의 귀속 고지를 함께 전달해야 합니다.
- 당근의 브랜드 리소스(로고, 상호명, 캐릭터)는 넣지 않았고, NEW:LEARN 화면이 당근의 제품이나 제휴처럼 보이게 쓰면 안 됩니다.

## 콘텐츠 원칙 (Voice & Tone)

SEED의 말하기 원칙 **명확한, 이해하기 쉬운, 사려깊은**을 따르고, NEW:LEARN 키워드대로 **신뢰할 수 있고 쉽고 빠르게** 말합니다. 기본은 친근한 해요체입니다.

- 필요한 정보만 짧고 분명하게 전해 사용자의 결정을 돕습니다.
- 기술 용어·한자어 대신 익숙한 말을 씁니다. 예: "검색이 불가능합니다" 대신 "지금은 검색할 수 없어요."
- 존칭어는 꼭 필요할 때만 씁니다. 예: "저장하실 수 있어요" 대신 "저장할 수 있어요."
- 수는 아라비아 숫자로 씁니다. 예: "관심 이슈 3개를 저장했어요."
- 뉴스 플랫폼이므로 과장·낚시성 표현과 단정적인 평가를 피하고, 사실과 출처를 앞세웁니다. 보도가 엇갈리면 "상충 후보"라고 쓰고 어느 쪽이 맞다고 판정하지 않습니다.
- 에러 메시지에는 사용자가 할 수 있는 해결 방법을 함께 알려줍니다.

## 색상

### NEW:LEARN 브랜드 색

| 토큰 | 값 | 역할 | 연결된 역할 토큰 | 대비(흰 배경) |
| --- | --- | --- | --- | --- |
| `brand-main` | #28CDAA | 로고, 아이콘, 그래프·타임라인 노드, 브랜드 강조 그래픽 | `fg-brand-accent`, `bg-brand-accent`, `stroke-brand-weak` | 2.0:1 — 글자 금지 |
| `brand-dark` | #087F72 | 주요 CTA 배경, 브랜드 글자·링크 | `bg-brand-solid`, `fg-brand`, `stroke-brand-solid` | 4.9:1 |
| `brand-pressed` | #066B61 | CTA 눌림, 연한 민트 위 브랜드 글자 | `bg-brand-solid-pressed`, `fg-brand-contrast` | 6.4:1 |
| `brand-light` | #E7FAF5 | 선택 상태, 일부 강조 배경 | `bg-brand-weak` | — |
| `brand-light-pressed` | #D0F5EC | 연한 민트의 눌림(Brand Light와 Main을 88:12로 섞은 값) | `bg-brand-weak-pressed` | — |
| `brand-accent-lime` | #C7F36C | 랜딩페이지의 아주 작은 포인트 | `bg-accent-lime` | 글자 금지 |
| `brand-background` | #FFFFFF | 기본 배경 | `bg-layer-default` | — |
| `brand-background-subtle` | #FAFBFC | 영역 구분용 옅은 배경 | `bg-neutral-muted` | — |
| `brand-text-primary` | #222B30 | 본문·제목(뉴트럴 차콜) | `fg-neutral`, `bg-neutral-solid` | 14.4:1 |
| `brand-text-secondary` | #66717A | 보조 텍스트 | `fg-neutral-muted` | 5.0:1 |
| `brand-border` | #E7ECEF | 카드·입력 필드 테두리, 탭 바 밑선 | `stroke-neutral-weak` | 1.2:1(장식) |

화면에서는 `brand-*`를 직접 쓰지 말고 연결된 역할 토큰을 씁니다. `fg-brand-accent`, `bg-brand-accent`, `bg-accent-lime`은 SEED에 없는 NEW:LEARN 확장 역할입니다.

**대비 규칙**

- CTA는 `bg-brand-solid`(#087F72) + `fg-on-brand-solid`(흰색) = 4.9:1, 눌림 6.4:1.
- 밝은 민트 #28CDAA 위에는 흰 글자를 올리지 않습니다(2.0:1). 민트 면 위에 글자가 꼭 필요하면 차콜(`fg-neutral`, 7.1:1).
- 브랜드 글자·링크는 `fg-brand`(#087F72, 4.9:1). 연한 민트 배경 위에서는 `fg-brand-contrast`(#066B61, 5.9:1).
- 보조 텍스트 #66717A는 흰 배경 5.0:1, Background Subtle 4.8:1, Brand Light 4.6:1로 모두 통과합니다.

### 역할 기반 색상

SEED 색상은 **역할 기반 색상**과 **팔레트 색상** 두 층입니다. UI에는 역할 기반 색상을 먼저 쓰고, 팔레트(`palette-*`, `brand-*`)는 역할로 표현하기 어려운 예외에만 직접 씁니다. 이름은 **속성 – 역할 – 변형 – 상태** 순서입니다.

- 속성: `fg-`(텍스트·아이콘), `bg-`(배경·표면), `stroke-`(경계선·윤곽선)
- 역할: `brand`, `neutral`, `positive`(성공), `warning`(주의), `critical`(오류), `informative`(정보)
- 변형: `solid`(진한 채움), `weak`(옅은 채움), `muted`·`subtle`(낮은 강조), `contrast`(더 강한 대비), `accent`(NEW:LEARN 그래픽용)
- 상태: `-pressed`, `-selected`, `disabled`

| 요소 | 배경 | 전경·테두리 |
| --- | --- | --- |
| 주요 버튼(CTA) | `bg-brand-solid` #087F72 → 눌림 `bg-brand-solid-pressed` #066B61 | `fg-on-brand-solid` 흰색 |
| 보조 버튼 | `bg-layer-default` | `fg-neutral`, 테두리 `stroke-neutral-weak` |
| 텍스트 링크 | — | `fg-brand` |
| 선택된 항목(칩, 리스트 행) | `bg-brand-weak` | `fg-brand-contrast`, 테두리 `stroke-brand-solid` |
| 카드·패널 | `bg-layer-default` | 테두리 `stroke-neutral-weak`, 제목 `fg-neutral`, 메타 `fg-neutral-muted` |
| 영역 구분·근거 인용 | `bg-neutral-muted` | `fg-neutral` |
| 입력 필드 | `bg-layer-default` | 테두리 `stroke-neutral-weak`, placeholder `fg-placeholder`, 포커스 `stroke-focus-ring` |
| 그래프·타임라인 노드와 선 | `bg-brand-accent` | `stroke-brand-weak` |

**태그(라벨)** — 모서리 4px의 작은 사각 라벨로 쓰고, 알약 모양을 반복하지 않습니다. 핵심 이슈: `bg-brand-weak` + `fg-brand-contrast` · 새로운 정보·업데이트: `bg-informative-weak` + `fg-informative-contrast` · 속보: `bg-critical-weak` + `fg-critical` · 심층 분석·전문가 분석: `bg-neutral-weak` + `fg-neutral-muted`. 사건 상태(NEW/REPEAT/UPDATE/CONFLICT)는 Timeline 패턴을 따릅니다.

**Positive와의 구분.** 성공을 뜻하는 positive(SEED green-700 #079171)는 CTA 청록 #087F72와 매우 비슷합니다. 성공 상태는 색만으로 전달하지 말고 체크 아이콘과 문구를 함께 씁니다.

그 밖의 전용 색상: `gradient-*`는 SEED 그라디언트의 stop 색입니다. NEW:LEARN에서는 `gradient-shimmer-neutral`(스켈레톤 로딩)만 쓰고 magic 계열은 쓰지 않습니다. `banner-*`, `manner-temp-*`는 SEED 전용이라 NEW:LEARN에서 쓸 일이 없습니다.

## Elevation과 표면

화면은 층위로 쌓습니다. 가장 아래 `bg-layer-basement`(Level 0, 전체 배경) 위에 `bg-layer-default`(Level 1, 리스트·카드·입력 필드·상단 내비게이션 등 대부분의 콘텐츠)가 놓이고, Bottom Sheet·Menu Sheet 같은 시트는 `bg-layer-floating`으로 새 쌓임 맥락을 만듭니다. Alert Dialog가 항상 최상위입니다. `bg-layer-default` 위에서 영역을 나눌 때는 `bg-neutral-muted`를 씁니다. 모달 뒤의 딤은 `bg-overlay`.

같은 레벨 안에서 구분감이 필요하면(스크롤 시 리스트가 상단 내비게이션 아래로 들어가는 경우 등) 레벨을 올리지 말고 그림자나 선으로 표현합니다. 그림자는 `shadow-s1`·`s2`·`s3` 세 단계이며, `shadow-s3`는 FAB, Menu, Popover, Select처럼 가장 위에 뜨는 요소에 쓰입니다.

## 타이포그래피

SEED는 웹폰트 대신 **각 플랫폼의 시스템 글꼴**을 씁니다(iOS·Android·macOS는 시스템 기본, Windows는 Pretendard). 그래서 이 시스템에도 폰트 파일이 없고, `sans` 스택이 그 순서를 그대로 담고 있습니다. Pretendard가 설치되지 않은 Windows에서는 맑은 고딕·Segoe UI로 대체되므로, 웹 제품이라면 Pretendard 웹폰트를 따로 준비하세요. 같은 500 굵기라도 한글은 Android가 iOS보다 조금 두껍게 보일 수 있습니다.

텍스트 스타일은 두 종류입니다.

- **시맨틱 스타일**: `screenTitle`(화면의 주요 제목, 26/35 bold), `articleBody`(게시물 본문, 16/24 regular), `articleNote`(주석·부가 정보, 14/22 regular — 일반 본문에는 쓰지 않음). 역할이 맞으면 이쪽을 먼저 씁니다.
- **스케일 스타일**: `t1`(11px)~`t14`(48px) × Regular(400)·Medium(500)·Bold(700). 예: `t4Medium` = 14px, 줄 높이 19px, 500. 대체로 t1–t5는 본문·보조 텍스트, t6–t10은 제목, t11–t14는 `sm` 브레이크포인트 이상의 큰 화면용 대형 제목입니다.

폰트 크기는 접근성을 위해 rem(1rem = 16px)이라 사용자 글자 크기 설정에 따라 커집니다. 커지면 안 되는 곳을 위한 **Static** 변형(`t5StaticBold` 등, 같은 px 값을 고정 단위로)이 원본에 있지만, 값이 기본 상태와 같아 여기서는 생략했습니다.

## 간격과 레이아웃

간격은 4px 기반 `dimension-x*` 스케일(2px `x0_5` ~ 64px `x16`)을 씁니다. 용도가 정해진 간격은 이름 있는 토큰을 먼저 씁니다.

- `spacing-x-global-gutter` 16px — 화면 좌우 기본 여백(안전 영역이 있으면 그 경계부터)
- `spacing-x-between-chips` 8px — 칩 사이 가로 간격
- `spacing-y-nav-to-title` 20px — 상단 내비게이션과 페이지 제목 사이
- `spacing-y-component-default` 12px — 따로 정해지지 않은 컴포넌트 사이 세로 간격
- `spacing-y-between-text` 6px — 텍스트 요소 사이 세로 간격
- `spacing-y-screen-bottom` 56px — 화면 하단 여백

웹 레이아웃은 12컬럼을 기본으로, 콘텐츠 페이지는 최대 너비 1040px(넓은 탐색 화면은 1280px)에서 가운데 정렬합니다. 대시보드는 거터 24px, 바깥 여백 32px.

## 모서리

`radius-r0_5`(2px)부터 `radius-r6`(24px)까지의 단계와, 칩·아바타·원형 버튼 같은 알약/원형 모양을 위한 `radius-full`(9999px)이 있습니다.

## 상태

컴포넌트 상태는 상호작용 상태(Enabled, Pressed)와 옵션 상태(Selected, Disabled)로 나뉘고, 서로 겹쳐 표현될 수 있습니다(Disabled는 보통 단독). 색상 토큰의 `-pressed`, `-selected` 접미사가 이 상태들에 대응합니다.

## 아이콘

Seed Icon(Apache 2.0)의 모노크롬 344종(Line·Fill)과 멀티컬러 100종이 `Icon`, `MulticolorIcon` 컴포넌트로 들어 있습니다. 기본 24px, 최소 12px, 15px 이하에서는 Fill을 씁니다. 아이콘 색은 글자처럼 `fg-neutral`·`fg-neutral-muted`, 뜻을 전하는 브랜드 아이콘은 `fg-brand`, 장식적인 민트 그래픽은 `fg-brand-accent`입니다. 단독 아이콘 버튼의 터치 영역은 최소 40px. 전체 목록은 Components의 Icon Library 페이지에서 검색할 수 있습니다. 당근 브랜드 리소스인 `carrot`, `daangn-house`는 빠져 있습니다.

## NEW:LEARN 패턴

프로토타입마다 디자인이 달라지지 않도록, 서비스에서 반복되는 화면 단위를 Components의 **NEW:LEARN Patterns** 그룹에 정리했습니다. 각 패턴은 가이드(색·타이포·간격·radius·테두리·Hover/Selected)와 라이트 테마 정적 예시를 함께 갖고, 스타일은 `components/bundle.css`의 `.nl-*` 클래스로 바로 쓸 수 있습니다. 새 기능이 아니라 디자인 패턴 정리입니다.

| 패턴 | 클래스 | 핵심 |
| --- | --- | --- |
| IssueCard — 추천 이슈 카드 | `.nl-issue-card` | 흰 카드, radius 16px, 1px 중립 테두리, 그림자 없음 |
| ArticleList — 최신 기사 리스트 | `.nl-article-list` | 제목 중심, 언론사·날짜는 보조, 안쪽 구분선 |
| CategoryTabs — 카테고리 탭과 필터 | `.nl-tabs`, `.nl-filter-chip` | 탭 = 범주 전환(밑줄), 칩 = 목록 좁히기(8px 모서리) |
| EventDetailPanel — 사건 상세 패널 | `.nl-panel` | 제목·날짜·요약·원문 근거 구분, 관련 기사/관점 탭 |
| Timeline — 타임라인 노드 | `.nl-timeline` | 메인 흐름 vs 곁가지, NEW/REPEAT/UPDATE/CONFLICT |
| ChangeCard — 변화 카드 | `.nl-change-card` | 이전·이후 근거, CONFLICT는 판정 없는 상충 후보 |

공통 규칙: 카드 radius 12–16px, 테두리 1px `stroke-neutral-weak`, Hover는 테두리를 `palette-gray-500`으로 진하게 하거나 배경 `bg-layer-default-pressed`, Selected는 `stroke-brand-solid` 테두리 또는 `bg-brand-weak` 배경, 포커스는 2px `stroke-focus-ring`. 색 전환은 `duration-color-transition` + `timing-function-easing`.

## 더 보기

모션, 피드백(눌림 표현), 그라디언트, 레이아웃과 브레이크포인트, 포용적 디자인, 국제화, 글쓰기, 아이콘, 디자인 토큰 구조는 각각 별도 섹션에 있습니다. 모션 시간(`duration-*`), 곡선(`timing-function-*`), 브레이크포인트(`breakpoint-*`)는 토큰으로도 들어 있습니다.

## 포함하지 않은 것

- SEED 컴포넌트 구현(Action Button, Checkbox, Bottom Sheet 등 약 100종) — 개발 단계에서 SEED React로 도입합니다. 이 시스템에는 아이콘 컴포넌트와 NEW:LEARN 패턴 가이드만 있습니다.
- 다크 테마 가이드 — 값만 참고용으로 남아 있습니다.
- 당근의 로고와 브랜드 아이콘(`carrot`, `daangn-house`).
- NEW:LEARN 로고 원본 벡터 — 지금 로고는 가이드 이미지를 따라 다시 그린 것입니다(로고 섹션의 필요한 원본 리소스 참고).
- `scale-s95`·`s97`·`s98`(SEED에서 제거 예정), `gradient-fade-mask`(Gradient 섹션에 CSS 값으로).
