# EventDetailPanel

사건 상세 패널은 타임라인이나 목록에서 고른 사건 하나를 제목·날짜·요약·원문 근거·관련 기사/관점 탭 순서로 보여주는 흰 패널입니다.

구조: `section.nl-panel` → `header.nl-panel__header`(eyebrow, title, date, 닫기 `nl-icon-button`) → `.nl-panel__section` "요약" → `.nl-panel__section` "원문 근거"(`figure.nl-evidence` 반복) → `.nl-tabs.nl-tabs--small`(관련 기사 / 관점) → `.nl-article-list--compact`.

| 영역 | 색 | 타이포 | 간격·모양 |
| --- | --- | --- | --- |
| 패널 | `bg-layer-default`, 테두리 1px `stroke-neutral-weak` | — | radius `radius-r4` 16px, 최대 폭 480px. 데스크톱 오른쪽 사이드 패널로 쓸 때는 radius 없이 왼쪽 테두리만 |
| Eyebrow(이슈명 · 사건 순번) | `fg-brand` | t3Medium 13/18 | — |
| 제목 | `fg-neutral` | t8Bold 22/30 | 헤더 padding 24px (오른쪽 64px — 닫기 버튼 자리), 요소 간 8px |
| 날짜 | `fg-neutral-muted` | t4 14/19 | 16px 달력 아이콘 + 6px |
| 닫기 | `fg-neutral` | — | 40×40 터치 영역, Hover `bg-transparent-pressed`, radius 8px |
| 섹션 | — | 라벨 t3Bold 13/18 `fg-neutral-muted` | padding 20px 24px, 섹션 사이 1px `stroke-neutral-subtle`, 라벨–내용 10px |
| 요약 | `fg-neutral` | articleBody 16/24 | 3–4문장 |
| 원문 근거 | 배경 `bg-neutral-muted` #FAFBFC, 테두리 1px `stroke-neutral-weak` | 인용 articleNote 14/22 `fg-neutral`, 출처 t2 12/16 `fg-neutral-muted` | radius `radius-r3` 12px, padding 12px 16px, 박스 사이 10px. "원문 보기"는 `.nl-link`(`fg-brand`) |
| 탭 | — | 작은 탭 14/19 | 섹션 위 1px 구분선, 좌우 24px |

- 근거 인용은 원문 문장을 그대로 따옴표 안에 넣고, 요약문과 섞지 않습니다. 근거가 없으면 섹션을 빼고 "원문 근거를 찾지 못했어요"라고 씁니다.
- "관점" 탭은 같은 사건을 다르게 다룬 기사들을 관점 이름(예: 정부 · 업계 · 시민단체)으로 묶은 목록입니다. 관점마다 색을 다르게 칠하지 않습니다.
- 하지 말 것: 패널 그림자로 띄우기(오버레이로 띄울 때만 `shadow-s3`), 요약을 민트 배경 박스에 넣기, 근거 박스에 왼쪽 컬러 바 넣기.
