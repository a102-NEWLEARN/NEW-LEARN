# Timeline

타임라인은 한 이슈의 사건을 날짜순으로 잇는 세로 흐름으로, 메인 흐름과 곁가지 사건, 그리고 사건마다 NEW · REPEAT · UPDATE · CONFLICT 상태를 구분해 보여줍니다.

구조: `ol.nl-timeline > li.nl-tl-item` 안에 `.nl-tl-date` | `.nl-tl-rail > .nl-tl-node` | `.nl-tl-body`(상태 라벨, `.nl-tl-title`, `.nl-tl-desc`, `.nl-tl-relation`). 열 폭은 날짜 52px · 레일 44px · 본문, 열 간격 8px, 사건 사이 20px.

| 요소 | 메인 흐름 | 곁가지 (`.is-branch`) |
| --- | --- | --- |
| 선 | 2px `stroke-brand-weak` #28CDAA (세로) | 메인 선에서 2px 점선 `palette-gray-500`으로 가지 |
| 노드 | 12px 사각(모서리 3px) `bg-brand-accent` 채움 + 3px 흰 테두리 | 10px 빈 사각, 2px `palette-gray-600` 테두리, 16px 들여씀 |
| 제목 | t5Bold 16/22 `fg-neutral` | t4Medium 14/20 `fg-neutral` |
| 설명 | t4 14/20 `fg-neutral-muted` | 같음 |

**상태 라벨** (`.nl-status--*`, 높이 20px, radius 4px, t1Bold 11/15, 12px 아이콘 — 색만으로 구분하지 않고 항상 글자 + 아이콘)

| 상태 | 뜻 | 배경 / 글자 | 아이콘 |
| --- | --- | --- | --- |
| NEW | 처음 등장한 사건 | `bg-brand-weak` / `fg-brand-contrast` (5.9:1) | `plus-small` |
| REPEAT | 앞선 사건과 같은 내용의 반복 보도 | `bg-neutral-weak` / `fg-neutral-muted` (4.5:1) | `arrow-clockwise-circular` |
| UPDATE | 앞선 사건의 내용(수치·일정 등)이 바뀜 | `bg-informative-weak` / `fg-informative-contrast` (8.4:1) | `pencil` |
| CONFLICT | 보도끼리 내용이 엇갈리는 **상충 후보** | `palette-carrot-100` / `palette-carrot-800` (5.3:1), 노드는 주황 테두리 빈 사각 | `arrow-right-arrow-left` |

**관계 표시** — `.nl-tl-relation`(t2 12/16 `fg-neutral-muted`, 14px 아이콘)으로 어떤 사건과 어떻게 이어지는지 씁니다: "09.02 사건 반복", "09.02 사건 내용 변경", "곁가지 · 관련 사건", "상충 후보 2건". 날짜는 `MM.DD`, 해가 바뀌는 첫 사건에만 연도를 위에 붙입니다.

| 상태 | 표현 |
| --- | --- |
| Hover | 본문 영역(`.nl-tl-hit`) 배경 `bg-layer-default-pressed`, radius 8px |
| Selected (`.is-selected`) | 노드 16px `bg-brand-solid` #087F72 + 4px `bg-brand-weak` 링, 본문 배경 `bg-brand-weak` |

- CONFLICT는 진위 판정이 아닙니다. 빨간색(critical)·"오보"·"거짓" 같은 표현을 쓰지 않고, 라벨이나 설명에 "상충 후보"를 함께 씁니다. 내용은 ChangeCard의 CONFLICT 형식으로 두 보도를 나란히 보여줍니다.
- 하지 말 것: 상태마다 노드 색을 바꾸기(노드 색은 메인/곁가지/선택만 구분), 라임색 사용, 노드에 그림자·그라디언트.
