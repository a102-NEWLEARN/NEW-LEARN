# DESIGN.md 와 NEW:LEARN 디자인 시스템 v2 대조 (2026-10-19)

## 값 불일치

원본 위치는 `imports/newlearn-design-system-v2/` 기준이다. `README.md` 는 패키지 맨 위 README 다. 「SEED 원래 값」 열은 패키지로 확인할 수 없어 보지 않았다.

**맞은 것:** 기본 색 11개 hex, 역할 14개와 새 역할 3개의 연결이 모두 맞다. `tokens.css` 라이트 블록에서 `brand-*` 를 가리키는 역할은 정확히 17개다. 대비 수치 13개는 다시 계산해서 모두 맞았다. 로고 파일 4개 이름과 크기, 상태 라벨 아이콘 4개 이름, 모서리 표, 텍스트 스타일 크기, 이름 있는 간격, 브레이크포인트, F 번호 이름도 맞다.

| DESIGN.md 줄 | DESIGN.md | 원본 | 원본 위치 |
| --- | --- | --- | --- |
| 207 (13–14 · 116) | 글꼴과 텍스트 스타일은 SEED 그대로이고 바꾼 값이 없다 | 패턴 4곳이 14px 글자에 줄 높이 20px 을 쓴다. SEED t4 는 14/19 인데 README 는 이를 「t4 14/20」 으로 적는다. 상태 라벨에는 자간 .02em 을 더한다 | `components/IssueCard/README.md:12` · `components/ArticleList/README.md:10` · `components/Timeline/README.md:11-12` · `components/bundle.css:31,52,76,147,149` · `tokens.css:312` |
| 80–82 (`border-line`) · 237 · 275 | 구분선은 1px `stroke-neutral-weak` 이다. 275줄 「안쪽 구분선」 은 토큰 없이 적었다 | `stroke-neutral-weak` 는 카드 · 입력 필드 테두리와 탭 바 밑선에만 쓴다. 카드 안 메타 위, 리스트 행 사이, 패널 섹션 사이 구분선은 더 옅은 `stroke-neutral-subtle` 이다 | `components/IssueCard/README.md:13` · `components/ArticleList/README.md:12` · `components/EventDetailPanel/README.md:14,17` · `components/bundle.css:54,64,120` |
| 278 | 노드 색은 메인 · 곁가지 · 선택만 구분한다 | CONFLICT 사건 노드는 2px `palette-carrot-800` 테두리의 빈 사각이다. 원본 31줄도 DESIGN.md 와 같은 말을 해서 원본끼리 어긋난다. 21줄과 구현은 주황 테두리다 | `components/Timeline/README.md:21` 과 `:31` · `components/bundle.css:143` |
| 264 · 62–64 (`selected-item`) | 선택된 리스트 행은 `bg-brand-weak` 에 글자 `fg-brand-contrast`, 테두리 `stroke-brand-solid` 다 | 기사 리스트의 선택 행은 배경 `bg-brand-weak` 만 바꾸고 글자색은 그대로, 테두리는 없다. 타임라인 선택 본문도 배경만 바꾼다. v2 README 114줄은 DESIGN.md 와 같아서 원본끼리 어긋난다 | `components/ArticleList/README.md:19` · `components/bundle.css:67,152,155` 과 `README.md:114` |
| 299 (294) | Selected 는 2px `stroke-brand-solid` 테두리다. 모든 패턴이 같은 규칙을 따른다 | 필터 칩의 선택 테두리는 1px 다. 2px 는 이슈 카드와 변화 카드만 쓴다. 탭은 Hover 때 글자색이 바뀌고 선택 때 굵은 글자와 밑줄이 붙어서 공통 규칙을 따르지 않는다 | `components/CategoryTabs/README.md:17-19,29` · `components/bundle.css:101` · `components/IssueCard/README.md:20` · `components/ChangeCard/README.md:26` |
| 281 · 289–292 | 작은 라벨은 태그를 포함해 높이 20px 이고, 항상 글자와 아이콘을 함께 쓴다 | 높이 20px 과 아이콘 필수는 상태 라벨(NEW · REPEAT · UPDATE · CONFLICT)만이다. 태그는 「모서리 4px 의 작은 사각 라벨」 이라고만 하고 높이 · 아이콘 규정이 없다. DESIGN.md 표도 태그의 아이콘 칸을 「—」 로 두어 281줄과 스스로 어긋난다 | `components/Timeline/README.md:14` · `components/bundle.css:29-30` · `README.md:120` |
| 146 (20) | 화면 코드는 역할 토큰만 쓴다 | 팔레트(`palette-*`)는 역할로 나타내기 어려운 예외에 직접 쓴다. 금지는 `brand-*` 를 직접 쓰는 것이다. DESIGN.md 도 202 · 288 · 298줄에서 `palette-carrot-*` · `palette-gray-500` 을 직접 쓴다 | `README.md:91,102` |

## 근거 없는 내용

- **256줄 「SEED 컴포넌트는 모양을 바꾸지 않고 그대로 쓰고, 색은 역할 토큰을 따라 자동으로 바뀐다」** — v2 에 이런 말이 없다. v2 는 「개발 단계에서 SEED React 로 도입한다」 까지만 말한다(`README.md:189`). 두 곳과 부딪힌다.
  - SEED 칩은 알약 모양이다. `README.md:158` 이 `radius-full` 을 칩용이라고 적는다. 그래서 「Chip 은 모양 그대로」 는 248 · 252 · 276 · 316줄의 8px 칩과 맞지 않는다. SEED Tabs 의 선택 밑줄이 `bg-brand-solid` 인지도 패키지로는 확인할 수 없다.
  - 「자동으로 바뀐다」 는 328줄(브랜드 색을 입히는 방법을 못 찾았다)과 어긋난다. 원본은 SEED CSS 변수 `--seed-color-*` 를 덮어써야 같은 결과가 나온다고 한다(`Foundations/09-design-token.md:26`).
- **104줄 「이 문서에 없는 값은 SEED 기본값이다」** — 270줄은 패턴 세부를 v2 README 로 넘긴다. 그런데 v2 README 에는 SEED 에 없는 값이 있다. 14/20 줄 높이, 3px 모서리, 자간 .02em, 패턴별 크기가 그렇다. 실제 순서는 「이 문서 → v2 패턴 README → SEED」 다.
- **252줄의 까닭 「같은 모양이 여러 줄 반복되면 화면이 산만해지기 때문이다」** — 원본은 하지 말라고만 하고 까닭은 적지 않았다(`components/CategoryTabs/README.md:10,32` · `README.md:120`).
- **222줄 「워드마크 글꼴은 로고 전용이고 화면 글자에는 쓰지 않는다」** — 원본에 없는 규칙이다. 원본은 반대 방향인 「워드마크를 다른 글꼴로 다시 쓰지 않는다」 만 말한다(`README.md:48`). SEED 시스템 글꼴만 쓴다는 원칙(`README.md:134`)에서 나온 추론이라 남겨도 되지만 출처는 없다.
- **275줄 ArticleList 를 쓰는 곳 「홈」** — v2 에 없다. `docs/user-flow.md:45` 의 「홈의 최신 기사」 에서 온 것으로 보이는데, 이 파일은 frontmatter `sources` 에 없다.

## 빠진 시각 규칙

모두 시각 규칙이라 DESIGN.md 몫이다. 확정 기능에 걸리는 것부터 적었다.

**확정 기능(F07 사건 중심 이슈 에볼루션 맵 · F08 사건별 관련 기사 조회 · 홈)에 걸리는 것**

1. **타임라인 노드 세부.** F07 맵이 이 모양을 따르는데 278줄에는 「회색 점선 + 빈 사각」 만 있고 선택 노드 모양이 없다. 출처는 `components/Timeline/README.md:9-11,28` · `components/bundle.css:139-143,149,155`.
   - 메인 노드에는 3px 흰 링(`0 0 0 3px bg-layer-default`)이 있다. 그림자가 아니라 선을 끊어 보이게 하는 링이다.
   - 선택 노드는 16px `bg-brand-solid` 사각(모서리 4px)에 4px `bg-brand-weak` 링을 두르고, 본문 배경은 `bg-brand-weak` 다.
   - 곁가지 노드는 10px 빈 사각에 2px `palette-gray-600` 테두리다. 연결선은 2px 점선 `palette-gray-500`, 16px 들여 쓰고 제목은 14/20 Medium 으로 한 단계 작다.
2. **사건 상세 패널을 사이드 패널로 붙일 때.** 데스크톱 오른쪽 사이드 패널로 쓰면 모서리 없이 왼쪽 테두리만 둔다. 246줄은 16px 만 적었다. 출처는 `components/EventDetailPanel/README.md:9`.
3. **원문 근거 박스의 테두리.** 배경 `bg-neutral-muted` 에 1px `stroke-neutral-weak` 테두리도 있다. 출처 줄은 12/16 `fg-neutral-muted` 다. frontmatter `evidence-quote`(76–79)와 266줄에는 테두리가 없다. 출처는 `components/EventDetailPanel/README.md:16` · `components/bundle.css:122-125`.
4. **탭 글자색.** 기본은 `fg-neutral-muted` Medium, 선택은 `fg-neutral` Bold 다. 밑줄은 1px 탭 바 밑선 위에 겹친다. 276줄은 밑줄만 적었다. 출처는 `components/CategoryTabs/README.md:17-18`.
5. **숫자 · 날짜는 tabular 숫자.** 카드 메타, 타임라인 날짜, 변화 카드 날짜에 `font-variant-numeric: tabular-nums` 를 쓴다. 출처는 `components/IssueCard/README.md:13` · `components/bundle.css:23,134,165`.
6. **제목은 최대 2줄.** 이슈 카드 제목과 최근 사건, 기사 제목이 그렇다. 출처는 `components/IssueCard/README.md:11-12` · `components/ArticleList/README.md:10`.
7. **텍스트 링크 모양.** `fg-brand`, 굵기 500, 평소에는 밑줄이 없다. 출처는 `components/bundle.css:25`.
8. **아이콘 세부.** 303줄에 없는 것들이다. 출처는 `components/Icon/README.md:28-33` · `Foundations/08-iconography.md:9-11,17-21` · `README.md:166` · `components/CategoryTabs/README.md:31`.
   - 최소 12px 이고, 글자와 한 줄이면 16 · 20 · 24px 중에서 고른다.
   - Line 이 기본이고, 켜짐 상태는 Fill 로 짝짓는다.
   - 뜻을 전하는 아이콘은 3:1 이상이어야 해서 `fg-placeholder`(2.1:1)를 쓰지 않는다. `fg-brand-accent`(2.0:1)는 혼자 뜻을 전하는 아이콘에 쓰지 않는다.
   - 드롭다운을 여는 칩 끝에는 `chevron-down-small` 을 붙인다.
9. **패턴별 「하지 말 것」 중 Do's and Don'ts 에 없는 것.**
   - 카드 배경을 민트로 채우기, 썸네일을 제목보다 크게 넣기 — `components/IssueCard/README.md:23`
   - 언론사 로고를 제목보다 크게, 날짜를 제목 앞에 두기 — `components/ArticleList/README.md:23`
   - 탭을 칩 모양으로 만들기, 선택 칩을 진한 청록으로 꽉 채우기(CTA 와 헷갈림) — `components/CategoryTabs/README.md:32`
   - 요약을 민트 배경 박스에 넣기 — `components/EventDetailPanel/README.md:21`
10. **로고 여백과 민트 바탕용 파일.** 로고 둘레에 심볼 높이의 1/4 이상을 비운다. 원본 규정이 오기 전까지 쓰는 임시값이다(`assets/Logos/README.md:15`). 327줄은 「규정이 오면」 이라고만 해서 지금 쓸 값이 없다. 민트 바탕에 놓는 파일은 `newlearn-logo-mono-dark.svg`(차콜 단색)인데 139줄에 파일 이름이 없다(`assets/Logos/README.md:16`).
11. **상태 라벨 글자.** t1Bold 11/15, 아이콘 12px, 좌우 여백 6px, 자간 .02em 이다. frontmatter `status-new`(93–97)에는 글자 정보가 없다. 출처는 `components/Timeline/README.md:14` · `components/bundle.css:30-32`.
12. **뜨지 않는 요소의 구분.** 스크롤 때 리스트가 상단 내비게이션 아래로 들어가는 경우, 원본(SEED 설명)은 그림자나 선으로 구분하라고 한다(`README.md:130`). 238줄은 뜨는 요소에만 그림자를 쓰므로, 이 경우 선으로 할지 `shadow-s1` 을 허용할지 정해야 한다.
13. **앱 아이콘** (낮음). 모서리 반경은 22.5% 다. 흰 바탕 버전을 흰 화면에 놓을 때는 1px `stroke-neutral-weak` 테두리를 둔다. 웹 공유 카드에 쓸 때 필요하다. 출처는 `assets/App-Icons/README.md:3,11`.
14. **레이아웃 그리드** (낮음). 브레이크포인트별 거터 · 마진(base · sm 16/12, md 이상 32/24)과 대시보드 밀도 3가지가 빠졌다(`Foundations/04-layout.md:9-13,22-26`). SEED 그대로 범위라 빼도 되지만, 229줄이 대시보드 거터 · 여백만 골라 적어 반쪽이다. 다 빼거나 다 적는 쪽으로 정한다.
15. **`brand-light-pressed` 를 만든 방법** (낮음). Brand Light 와 Main 을 88:12 로 섞은 값이다(`README.md:83`). 눌림 색을 더 만들 때 기준이 된다.

**F10 근거 기반 변화 카드 (추후 논의)**

16. **변화 카드 세부.** 출처는 `components/ChangeCard/README.md:12-15,19-21` · `components/bundle.css:166-180`.
    - 이전 칸은 배경 `bg-neutral-muted` 에 인용 `fg-neutral-muted`, 이후 칸은 흰 배경에 `fg-neutral` 이다.
    - 바뀐 부분은 원문 글자를 두고 배경만 칠한다. 이전은 `bg-neutral-weak`, 이후는 `bg-brand-weak` 에 `fg-brand-contrast` 굵게, 상충은 `palette-carrot-100` 에 굵게다. 모서리는 2px 이고 취소선은 쓰지 않는다.
    - 화살표는 16px `arrow-right`, `fg-neutral-subtle` 이다.
    - CONFLICT 는 화살표 없이 두 칸을 같은 모양으로 두고, 정보 아이콘이 붙은 안내 줄을 단다.

## 빠진 동작 규칙 (EXPERIENCE.md 몫)

- **모션.** 작은 움직임은 200ms(`duration-d4`) 이하, 큰 움직임은 250–300ms 다. 등장과 퇴장 곡선은 짝을 맞춘다. 동작 줄이기에서는 위치 · 크기 변화를 없애고 색 전환은 남긴다. — `Foundations/01-motion.md:5-6,22,52`
- **눌림.** 색은 표면만 바뀌고 글자 · 아이콘 색은 그대로다. 축소는 배율이 아니라 2px 거리로 정한다. 탭 · 스위치는 색 대신 축소만 쓰고, 중첩 축소는 끄고, 로딩 중에는 축소하지 않는다. 패턴별 눌림 색은 카드 · 칩 `bg-layer-default-pressed`, 기사 행 `bg-neutral-weak`, 아이콘 버튼 `bg-transparent-selected-pressed` 다. — `Foundations/02-feedback.md` · `components/IssueCard/README.md:19` · `components/ArticleList/README.md:18` · `components/bundle.css:117`
- **포커스 위치.** 카드 · 칩은 바깥으로 2px 띄우고, 리스트 행 · 탭은 안쪽에 그린다. — `components/bundle.css:45,68,87,102,118`
- **글쓰기.** 해요체, 아라비아 숫자, 에러에는 해결 방법, 주의 메시지는 「~니다」, 알림에는 이슈 이름을 넣는다(`Foundations/07-writing.md:15-20`). 빈 상태는 「원문 근거를 찾지 못했어요」 이고, 근거 인용은 원문 그대로 두고 요약과 섞지 않는다(`components/EventDetailPanel/README.md:19`). 사건 수가 0이면 그 항목을 뺀다(`components/IssueCard/README.md:24`). CONFLICT 라벨은 「CONFLICT · 상충 후보」 에 안내 문장을 붙인다(`components/ChangeCard/README.md:21`).
- **날짜 · 숫자.** 기사 날짜는 오늘 · 어제면 상대 시간, 그 밖에는 「10월 14일」 이다(`components/ArticleList/README.md:24`). 타임라인은 `MM.DD` 이고 해가 바뀌는 첫 사건에만 연도를 붙인다(`components/Timeline/README.md:23`). 변화 카드는 「09.02 → 10.08」 이다(`components/ChangeCard/README.md:11`). 큰 수는 만 · 억으로 끊는다(`Foundations/06-international-design.md:41`).
- **접근성 · 키보드.** 탭은 하나만 고르고(`role="tab"` · `aria-selected`), 칩은 여러 개 고르고(`aria-pressed`) 「초기화」 로 푼다. 지금 항목은 `aria-current`, 아이콘만 있는 버튼은 `aria-label` 을 단다. 터치 영역은 44px 이상, 최소 24px, 아이콘 버튼은 40px 다. 핀치 줌 · 드래그에는 탭으로 하는 대체 수단을 둔다. 마인드맵 · 이슈 맵 화면에 바로 걸린다. — `components/CategoryTabs/README.md:8` · `components/Icon/README.md:31-32` · `Foundations/05-inclusive-design.md:20-21`
- **반응형.** 변화 카드는 520px 이하에서 위아래로 쌓고 화살표를 아래로 돌린다(`components/ChangeCard/README.md:15`). 사이드바는 md 이상에서 보인다(`Foundations/04-layout.md:15`). 탭 바는 가로로 스크롤한다(`components/CategoryTabs/README.md:9`).
- **드롭다운 칩.** 값을 고르면 칩 글자가 그 값(예: 「이번 주」)으로 바뀐다. — `components/CategoryTabs/README.md:31`
