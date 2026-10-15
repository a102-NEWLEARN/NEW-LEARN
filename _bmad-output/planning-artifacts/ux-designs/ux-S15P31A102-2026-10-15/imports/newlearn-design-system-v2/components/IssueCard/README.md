# IssueCard

추천 이슈 카드는 하나의 이슈를 카테고리·제목·최근 사건·사건 수·기사 수로 요약해 보여주는 흰 카드로, 홈과 이슈 목록에서 그리드로 반복해 씁니다.

클래스: `.nl-issue-card` 안에 `__category`, `__title`, `__latest`(`__latest-label`, `__latest-text`), `__meta`. 여러 장은 `.nl-issue-grid`(최소 280px, 간격 16px). 스타일은 `components/bundle.css`에 있습니다.

| 요소 | 색 | 타이포 | 비고 |
| --- | --- | --- | --- |
| 카드 | 배경 `bg-layer-default`, 테두리 1px `stroke-neutral-weak` | — | radius `radius-r4` 16px, padding 20px, 내부 간격 12px. 그림자 없음 |
| 카테고리 | `fg-brand` #087F72 | t3Medium 13/18 | 카테고리는 글자만, 배지 배경을 깔지 않음 |
| 제목 | `fg-neutral` #222B30 | t6Bold 18/24 | 최대 2줄 |
| 최근 사건 | 라벨 `fg-neutral-muted`, 본문 `fg-neutral` | 라벨 t2Medium 12/16, 본문 t4 14/20 | 앞에 8px 민트 노드(`bg-brand-accent`, radius 2px). 최대 2줄 |
| 메타(사건·기사 수) | `fg-neutral-muted`, 숫자는 `fg-neutral` | t3 13/18, 숫자 tabular | 위 1px `stroke-neutral-subtle` 구분선, padding-top 12px, 항목 간격 16px, 아이콘 16px. 카드 맨 아래에 붙음 |

| 상태 | 표현 |
| --- | --- |
| 기본 | 흰 배경 + 연한 테두리 |
| Hover | 테두리 `palette-gray-500` #D1D3D8 (배경은 그대로) |
| Pressed | 배경 `bg-layer-default-pressed` |
| Selected (`.is-selected` 또는 `aria-current="true"`) | 테두리 2px `stroke-brand-solid` #087F72 (1px border + inset 1px). 배경은 흰색 유지 |
| Focus | 2px `stroke-focus-ring`, offset 2px |

- 하지 말 것: 카드 배경을 민트로 채우기, 그림자·글로우, 카테고리별로 카드 색 바꾸기, 썸네일을 크게 넣어 제목보다 눈에 띄게 하기.
- 사건 수가 0이면 메타에서 그 항목만 빼고, "0건"으로 쓰지 않습니다.
