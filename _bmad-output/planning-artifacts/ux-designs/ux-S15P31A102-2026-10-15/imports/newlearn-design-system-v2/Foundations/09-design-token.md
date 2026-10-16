# Design Token

디자인 토큰은 디자인 결정을 사람과 기계가 함께 읽을 수 있는 데이터로 옮긴 것입니다. 색·타이포그래피·간격·모션처럼 값을 가진 모든 결정에 이름을 붙여, 디자인과 개발이 같은 말을 쓰게 합니다.

## 두 단계 구조

- **Raw value** — `16px`, `#ffffff`, `cubic-bezier(0.35, 0, 0.35, 1)` 같은 실제 값.
- **Scale token** — 쓸 수 있는 값을 유한한 눈금으로 제한하고 이름을 붙인 것. 예: `palette-green-600`, `dimension-x4`, `duration-d3`, `t5`(폰트 크기). 출력 장치의 세부를 감춰 플랫폼에 덜 묶이게 합니다.
- **Semantic token** — scale token을 조합해 디자인 의도를 표현한 것. 실제 작업의 기본 재료입니다. 예: `bg-brand-solid`, `spacing-x-global-gutter`, `duration-color-transition`, `screenTitle`.

**semantic을 먼저, scale은 예외에만.** 같은 값이라도 의미가 다르면 따로 바꿀 수 있어야 합니다. 이 시스템이 SEED의 Carrot 브랜드를 NEW:LEARN 브랜드(`brand-dark`, `brand-main`)로 바꿀 수 있었던 것도, 화면이 `palette-carrot-600`이 아닌 `bg-brand-solid`를 참조하기 때문입니다.

## 이름 대응

| 이 시스템 | SEED 원본 | SEED CSS 변수 |
| --- | --- | --- |
| `fg-brand` | `$color.fg.brand` | `--seed-color-fg-brand` |
| `palette-green-600` | `$color.palette.green-600` | `--seed-color-palette-green-600` |
| `dimension-x4` | `$dimension.x4` | `--seed-dimension-x4` |
| `spacing-x-global-gutter` | `$dimension.spacing-x.global-gutter` | `--seed-dimension-spacing-x-global-gutter` |
| `radius-r2` | `$radius.r2` | `--seed-radius-r2` |
| `duration-d3` | `$duration.d3` | `--seed-duration-d3` |
| `timing-function-enter` | `$timing-function.enter` | `--seed-timing-function-enter` |
| `gradient-glow-magic-80` | `$gradient.glow-magic`의 80% stop | `--seed-gradient-glow-magic` (stop 목록 전체) |

SEED 패키지(`@seed-design/css`)를 그대로 쓰는 제품이라면 브랜드 색 교체는 SEED CSS 변수 `--seed-color-*-brand*`(와 README에서 NEW:LEARN 값으로 바꾼 neutral 역할들)를 덮어써야 같은 결과가 나옵니다.
