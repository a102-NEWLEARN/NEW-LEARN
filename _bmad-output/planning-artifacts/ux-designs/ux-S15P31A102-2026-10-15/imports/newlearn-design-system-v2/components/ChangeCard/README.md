# ChangeCard

변화 카드는 같은 사건에 대해 이전 근거와 이후 근거 문장을 나란히 놓아 무엇이 바뀌었는지(UPDATE), 또는 어떤 보도가 엇갈리는지(CONFLICT)를 보여주는 카드입니다.

구조: `article.nl-change-card` → `__head`(상태 라벨, `__field` 바뀐 항목, `__date`) → (CONFLICT만) `.nl-conflict-note` → `__body`(`.nl-change-side` 둘, UPDATE는 사이에 `__arrow`).

| 요소 | 색 | 타이포 | 간격·모양 |
| --- | --- | --- | --- |
| 카드 | `bg-layer-default`, 테두리 1px `stroke-neutral-weak` | — | radius `radius-r3` 12px, padding 16px, 내부 간격 12px |
| 바뀐 항목 | `fg-neutral` | t4Bold 14/19 | 상태 라벨 오른쪽 8px |
| 날짜 | `fg-neutral-muted` | t2 12/16 | 오른쪽 끝, "09.02 → 10.08" |
| 이전 근거 | 배경 `bg-neutral-muted`, 인용 `fg-neutral-muted` | 라벨 t2Bold 12/16, 인용 14/22, 출처 12/16 | radius 8px, padding 12px, 1px `stroke-neutral-weak` |
| 이후 근거 | 배경 `bg-layer-default`, 인용 `fg-neutral` | 같음 | 같음 |
| 바뀐 부분 | 이전 `.nl-mark-before`(`bg-neutral-weak`) / 이후 `.nl-mark-after`(`bg-brand-weak` + `fg-brand-contrast` Bold) | — | 원문 글자는 고치지 않고 배경만 칠함. 취소선 쓰지 않음 |
| 화살표 | `fg-neutral-subtle` | 16px `arrow-right` | 좁은 화면(520px 이하)에서는 위아래로 쌓고 아래 방향 |

**CONFLICT** (`.nl-change-card--conflict`)

- 두 쪽을 "보도 A" / "보도 B"로 똑같은 모양(흰 배경, 같은 테두리)으로 나란히 둡니다. 어느 쪽도 흐리게 하거나 강조하지 않습니다.
- 엇갈리는 부분은 양쪽 모두 `.nl-mark-claim`(`palette-carrot-100` 배경, 굵게)으로 같은 방식으로 칠합니다.
- 상태 라벨은 "CONFLICT · 상충 후보", 바로 아래 `.nl-conflict-note`(t3 13/18 `fg-neutral-muted`, 정보 아이콘)로 "어느 쪽이 맞는지 판정한 것이 아니라, 원문 확인이 필요한 상충 후보예요"라고 씁니다.

| 상태 | 표현 |
| --- | --- |
| Hover | 테두리 `palette-gray-500` |
| Selected (`.is-selected`, 타임라인에서 고른 사건과 연결) | 테두리 2px `stroke-brand-solid` |

- 하지 말 것: 이후 근거를 초록·체크로, 이전 근거를 빨강·X로 표시하기(옳고 그름이 아니라 시점 차이), 근거 없이 요약만 넣기.
