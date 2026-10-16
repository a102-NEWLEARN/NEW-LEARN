# MulticolorIcon

Seed Icon의 멀티컬러 아이콘 100종을 고정된 색 그대로 그리는 컴포넌트로, 카테고리·메뉴·빈 화면처럼 그림 자체가 눈에 띄어야 하는 곳에 씁니다.

```jsx
const { MulticolorIcon } = window.SeedDesign;

<MulticolorIcon name="gift" size={40} />
<MulticolorIcon name="bell" label="알림" />
```

| prop | 값 | 기본 |
| --- | --- | --- |
| `name` | 아이콘 이름 — Icon Library 페이지의 Multicolor 탭에서 검색 | — |
| `size` | 숫자(px), dimension 토큰, CSS 길이 | 24px |
| `label` | 접근성 이름. 없으면 장식용 | — |

- 색을 바꿀 수 없습니다. 상태(선택, 비활성)나 테마에 따라 색이 바뀌어야 하는 곳에는 모노크롬 `Icon`을 쓰세요.
- NEW:LEARN은 라이트 테마만 씁니다. 멀티컬러 아이콘은 색이 많아 화면이 산만해지기 쉬우니 카테고리 진입점이나 빈 화면처럼 한 화면에 몇 개만 쓰고, 목록·카드 안의 작은 아이콘은 모노크롬 `Icon`을 씁니다.
- 그라디언트가 있는 아이콘(`sparkle2`, `sparkle-arrow-up`, `wand-plus-circle`)은 한 화면에 여러 개 그려도 서로 간섭하지 않도록 내부 id가 자동으로 나뉩니다.
- 공식 패키지는 `@karrotmarket/react-multicolor-icon`(예: `IconGift`)입니다. `SeedDesign.multicolorIconSvg('gift')`로 SVG 문자열을 얻을 수 있습니다.
- 당근 브랜드 리소스인 `daangn-house`는 넣지 않았습니다.
