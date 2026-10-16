# CategoryTabs

카테고리 탭은 보고 있는 범주 전체를 바꾸는 밑줄 탭이고, 필터 칩은 지금 목록을 좁히는 조건 버튼입니다. 둘은 역할이 달라 한 화면에서 위아래로 함께 씁니다.

| | 탭 `.nl-tabs > .nl-tab` | 필터 칩 `.nl-filter-row > .nl-filter-chip` |
| --- | --- | --- |
| 하는 일 | 범주 전환(전체·정치·경제…) — 화면 내용이 통째로 바뀜 | 조건 추가(기간, 언론사, 변화 있는 이슈만) — 목록이 좁아짐 |
| 선택 | 하나만 (`role="tab"`, `aria-selected`) | 여러 개 가능 (`aria-pressed`), "초기화"로 해제 |
| 위치 | 화면·패널 맨 위, 가로 스크롤 허용 | 탭 바로 아래 |
| 모양 | 글자 + 밑줄. 배경·테두리 없음 | 높이 32px, radius `radius-r2` 8px — 알약(pill) 모양으로 만들지 않음 |

**탭**

| 요소 | 값 |
| --- | --- |
| 높이 / 간격 | 48px (작은 탭 `.nl-tabs--small` 40px), 탭 사이 24px(작은 탭 20px), 좌우 padding 20px |
| 글자 | 기본 t5Medium 16/22 `fg-neutral-muted` · 선택 t5Bold `fg-neutral` (작은 탭은 14/19) |
| 선택 표시 | 2px 밑줄 `bg-brand-solid` #087F72, 탭 바 밑선 1px `stroke-neutral-weak` 위에 겹침 |
| Hover | 글자 `fg-neutral` |
| 개수 | `.nl-tab__count` — 탭 이름 뒤 4px, `fg-neutral-muted` |

**필터 칩**

| 상태 | 배경 | 테두리 | 글자 |
| --- | --- | --- | --- |
| 기본 | `bg-layer-default` | 1px `stroke-neutral-weak` | `fg-neutral` t4Medium 14/19 |
| Hover | 그대로 | `palette-gray-500` #D1D3D8 | 그대로 |
| Pressed | `bg-layer-default-pressed` | 그대로 | 그대로 |
| Selected | `bg-brand-weak` #E7FAF5 | 1px `stroke-brand-solid` #087F72 | `fg-brand-contrast` #066B61 + 16px 체크 아이콘 |

- 드롭다운을 여는 칩은 끝에 `chevron-down-small` 아이콘을 붙이고, 값이 정해지면 칩 글자를 그 값으로 바꿉니다("이번 주").
- 하지 말 것: 탭을 칩 모양으로 만들기, 칩을 완전한 알약 모양으로 여러 줄 반복하기, 선택 칩을 진한 청록으로 꽉 채우기(CTA와 헷갈림).
