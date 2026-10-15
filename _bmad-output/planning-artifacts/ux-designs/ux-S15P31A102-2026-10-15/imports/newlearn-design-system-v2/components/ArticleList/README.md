# ArticleList

최신 기사 리스트는 기사 제목을 중심으로, 언론사와 날짜를 보조 정보로 붙여 세로로 쌓는 SEED List 스타일의 목록입니다.

클래스: `ul.nl-article-list > li > a.nl-article` 안에 `__body`(`__title`, `__meta`)와 선택적 `__thumb`. 패널 안처럼 좁은 곳은 `.nl-article-list--compact`.

| 요소 | 색 | 타이포 | 간격 |
| --- | --- | --- | --- |
| 행 | 배경 `bg-layer-default` | — | padding 16px 20px (compact 12px 24px), 제목–메타 6px |
| 제목 | `fg-neutral` | t5Medium 16/22 (compact t4 14/20) | 최대 2줄 |
| 메타 | `fg-neutral-muted` | t3 13/18 (compact t2 12/16) | "언론사 · 날짜", 가운뎃점은 2px 점(`.nl-dot-sep`) |
| 구분선 | 1px `stroke-neutral-subtle` | — | 좌우 20px 안쪽(inset), 마지막 행 아래는 없음 |
| 썸네일(선택) | `bg-neutral-weak` 자리 | — | 72×72, radius `radius-r2` 8px, 오른쪽. 제목 중심이므로 기본은 생략 |

| 상태 | 표현 |
| --- | --- |
| Hover | 배경 `bg-layer-default-pressed` #F7F8F9 |
| Pressed | 배경 `bg-neutral-weak` #F3F4F5 |
| Selected (지금 읽는 기사, `aria-current="true"`) | 배경 `bg-brand-weak` #E7FAF5, 글자색은 그대로 |
| Focus | 안쪽 2px `stroke-focus-ring` |

- 리스트 자체에는 테두리가 없습니다. 카드처럼 감쌀 때만 바깥에 1px `stroke-neutral-weak` + radius 16px을 둡니다.
- 하지 말 것: 왼쪽 컬러 바로 선택 표시, 언론사 로고를 제목보다 크게, 날짜를 제목 앞에 두기.
- 날짜 표기는 International Design 섹션을 따릅니다(오늘·어제는 상대 시간, 그 외 "10월 14일").
