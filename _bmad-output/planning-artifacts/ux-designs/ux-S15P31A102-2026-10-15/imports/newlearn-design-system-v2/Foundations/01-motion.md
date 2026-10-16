# Motion

모션은 인터페이스가 무엇을 하고 있는지 보여주고, 조작을 더 쉽게 만듭니다. SEED는 모션을 규모에 따라 두 가지로 나눕니다.

- **마이크로 모션** — 버튼 클릭, 입력창 포커스, 스크롤처럼 작은 범위의 움직임. **0.2초(`duration-d4`) 이하**로 끝냅니다.
- **매크로 모션** — 페이지 전환, 모달 팝업, 슬라이드 메뉴처럼 레이아웃 단위의 큰 움직임. **0.2초를 넘깁니다**(`duration-d5`, `duration-d6`).

누름에 대한 반응(색 전환, 축소)은 마이크로 모션이지만 규칙이 따로 있어 Feedback 섹션에서 다룹니다.

## 곡선 (Timing function)

| 토큰 | 값 | 쓰임 |
| --- | --- | --- |
| `timing-function-easing` | `cubic-bezier(0.35, 0, 0.35, 1)` | 버튼 클릭·포커스 같은 기능적 마이크로 모션 |
| `timing-function-enter` | `cubic-bezier(0, 0, 0.15, 1)` | 다이얼로그·시트가 나타날 때 |
| `timing-function-exit` | `cubic-bezier(0.35, 0, 1, 1)` | 다이얼로그·시트가 사라질 때 |
| `timing-function-enter-expressive` | `cubic-bezier(0.03, 0.4, 0.1, 1)` | 특히 강조해야 하는 등장 |
| `timing-function-exit-expressive` | `cubic-bezier(0.35, 0, 0.95, 0.55)` | 특히 강조해야 하는 퇴장 |
| `timing-function-linear` | `cubic-bezier(0, 0, 1, 1)` | 시간에 비례해야 하는 움직임 |
| `timing-function-pressed-scale` | `cubic-bezier(0, 0, 0.15, 1)` | 눌림 축소 (enter와 같은 곡선) |

등장(enter)은 빠르게 시작해 부드럽게 멈추고, 퇴장(exit)은 천천히 시작해 빠르게 빠져나갑니다. 같은 요소의 등장과 퇴장에는 짝이 맞는 곡선을 쓰세요(`enter` ↔ `exit`, `enter-expressive` ↔ `exit-expressive`).

## 시간 (Duration)

| 토큰 | 값 |
| --- | --- |
| `duration-d1` | 50ms |
| `duration-d2` | 100ms |
| `duration-d3` | 150ms |
| `duration-d4` | 200ms |
| `duration-d5` | 250ms |
| `duration-d6` | 300ms |
| `duration-color-transition` | 150ms (= d3) |
| `duration-pressed-scale` | 150ms (= d3) |

## 예시

```css
/* 입력창 포커스 — 마이크로 모션 */
.field { transition: border-color var(--duration-d3) var(--timing-function-easing); }

/* 바텀시트 — 매크로 모션 */
.sheet[data-state="open"]   { animation: sheet-in  var(--duration-d6) var(--timing-function-enter); }
.sheet[data-state="closed"] { animation: sheet-out var(--duration-d5) var(--timing-function-exit); }
```

SEED CSS를 직접 쓸 때는 같은 값이 `--seed-duration-d3`, `--seed-timing-function-enter`처럼 노출됩니다.

## 동작 줄이기

OS의 "동작 줄이기" 설정이 켜져 있으면 눌림 축소는 일어나지 않습니다. 직접 만드는 모션도 `prefers-reduced-motion: reduce`에서 위치·크기 변화를 없애거나 짧은 페이드로 바꾸고, 색 전환처럼 상태를 알려주는 반응은 남겨 두세요.
