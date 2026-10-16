# Icon

Seed Icon의 모노크롬 아이콘 344종(Line·Fill 각각)을 그리는 컴포넌트로, 색은 글자처럼 `currentColor`를 따르고 크기는 기본 24px입니다.

```jsx
const { Icon } = window.SeedDesign;

<Icon name="heart" />                                  // Line, 24px, 부모 글자색
<Icon name="heart" variant="fill" color="fg.brand" />  // Fill, 브랜드 청록 #087F72
<Icon name="bell" size="x5" label="알림" />            // 20px, 스크린 리더용 이름
```

## Props

| prop | 값 | 기본 |
| --- | --- | --- |
| `name` | 아이콘 이름(케밥 케이스) — 전체 목록은 Icon Library 페이지에서 검색 | — |
| `variant` | `line` · `fill` | `line` |
| `size` | 숫자(px), dimension 토큰(`x4` = 16px, `x6` = 24px), CSS 길이 | 24px |
| `color` | 색 토큰(`fg.brand` 또는 `fg-brand`), CSS 색 | `currentColor` |
| `label` | 접근성 이름. 없으면 장식용(`aria-hidden`) | — |
| `svg` | 직접 만든 `<svg>` 요소. 주면 `name`보다 우선 (SEED `Icon`과 같은 방식) | — |

SEED React의 `<Icon svg={<IconHeartLine />} size="x6" color="fg.brand" />`도 그대로 동작합니다. `PrefixIcon`·`SuffixIcon`(버튼 같은 컴포넌트 안에서 라벨 앞뒤에 놓는 슬롯, 항상 `aria-hidden`)도 같은 이름으로 들어 있습니다.

## 쓰는 법

- **크기**: 기본 24px, 최소 12px. 텍스트와 한 줄이면 16·20·24px 중 글자 크기에 맞는 것을 고르고 세로 가운데 정렬합니다.
- **Line과 Fill**: 기본은 Line. 15px 이하에서는 Fill을 씁니다. 탭의 선택됨, 좋아요 켜짐처럼 상태가 바뀌는 곳은 꺼짐 = Line, 켜짐 = Fill로 짝지어 씁니다.
- **색**: 텍스트와 같은 `fg-*` 역할 색을 씁니다. 기본 `fg-neutral`, 보조 `fg-neutral-muted`, 브랜드 `fg-brand`, 오류 `fg-critical`. 의미를 가진 아이콘은 배경 대비 3:1 이상이어야 하므로 `fg-placeholder`(라이트 약 2.1:1)는 쓰지 않고, `fg-disabled`는 비활성 상태에만 씁니다.
- **터치 영역**: 아이콘만 있는 버튼은 최소 40px, 24px 아이콘이면 44px 이상의 누를 수 있는 영역을 둡니다. 아이콘 자체를 키우지 말고 감싸는 버튼에 여백을 줍니다.
- **접근성**: 옆에 같은 뜻의 글자가 있으면 `label` 없이 장식용으로 둡니다. 아이콘만으로 뜻을 전할 때(아이콘 버튼 등)는 `label`이나 버튼의 `aria-label`을 꼭 붙입니다.
- **브랜드 색**: 뜻을 전하는 아이콘(활성 탭, 링크 옆 아이콘)은 `fg.brand`(#087F72, 4.9:1). 밝은 민트 `fg.brand-accent`(#28CDAA, 2.0:1)는 장식·그래프용이라 혼자 뜻을 전하는 아이콘에 쓰지 않습니다.
- **성공 표시**: 브랜드 청록과 positive 초록이 비슷한 계열이라, 성공 상태에는 `checkmark-circle` 같은 아이콘을 색과 함께 씁니다.

## React 밖에서

`SeedDesign.iconSvg('heart', 'fill', 20)`은 `fill="currentColor"`인 SVG 문자열을 돌려줍니다(덱·디자인·정적 HTML용). `SeedDesign.searchIcons('알림')`은 이름과 한/영 키워드로 찾고, `SeedDesign.iconInfo('heart')`는 공식 패키지의 컴포넌트 이름(`IconHeartLine` / `IconHeartFill`)을 알려줍니다. 실제 제품 코드에서는 `@karrotmarket/react-monochrome-icon`을 설치해 그 이름으로 가져오면 같은 그림이 나옵니다.

## 빠진 아이콘

당근 브랜드 리소스에 해당하는 `carrot`(당근)과 `daangn-house`는 넣지 않았습니다. 아이콘 그림은 Apache 2.0이지만, 당근의 제품이나 제휴처럼 보이게 쓰면 안 된다는 조건이 붙어 있습니다(NOTICE 참고).
