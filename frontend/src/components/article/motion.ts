// 기사 마인드맵 두 보기(흐름지도 · 마인드맵)의 움직임 — 열 때 차례로 나오기 · 강조한 잎 튀기
// (프로토타입 v21 im-node-in · im-draw · im-rise · im-pop-once). 키프레임은 newlearn-theme.css.
// 하나하나의 길이는 EXPERIENCE.md Interaction Primitives 「모션」을 따른다 — 큰 움직임 300ms, 작은 움직임 200ms.
// 프로토타입 길이(460 · 720 · 340ms) 대신 지연(차례)으로 퍼져 나가는 느낌을 낸다.
// 모두 motion-safe 라 동작 줄이기를 켜면 처음부터 다 그린 모양이다. 지연 동안은 첫 장면(투명 · 작게)에 머문다(backwards).
// Tailwind 가 찾을 수 있게 클래스는 글자 그대로 적는다

/** 제자리에서 작게 시작해 튀어나온다 — 마인드맵 노드 · 흐름지도 번호 원 */
export const POP_IN =
  "motion-safe:animate-[newlearn-pop-in_300ms_var(--seed-timing-function-enter-expressive)_backwards]";
/** 선이 시작점에서 끝점으로 뻗는다 — 선에 pathLength={1} 을 함께 준다 */
export const DRAW =
  "motion-safe:animate-[newlearn-draw_300ms_var(--seed-timing-function-enter)_backwards]";
/** 짧게 떠오른다 — 흐름지도 머리 줄 · 질문 · 잎 카드 */
export const RISE =
  "motion-safe:animate-[newlearn-rise-short_300ms_var(--seed-timing-function-enter)_backwards]";
/** 잇는 선이 왼쪽에서 오른쪽으로 · 위에서 아래로 자란다 — 흐름지도 번호 원 사이 */
export const GROW_X =
  "origin-left motion-safe:animate-[newlearn-grow-x_300ms_var(--seed-timing-function-enter)_backwards]";
export const GROW_Y =
  "origin-top motion-safe:animate-[newlearn-grow-y_300ms_var(--seed-timing-function-enter)_backwards]";
/** 나타난다 — 선 끝 화살표 */
export const FADE_IN =
  "motion-safe:animate-[newlearn-fade-in_200ms_var(--seed-timing-function-enter)_backwards]";
/** 강조한 잎 원이 한 번 튄다 — 작은 움직임이라 200ms. 강조할 때 붙여서 그때마다 다시 돈다 */
export const POP_ONCE =
  "motion-safe:animate-[newlearn-pop-once_200ms_var(--seed-timing-function-enter-expressive)]";

/** 애니메이션 지연 — 등장 차례 */
export const enterAt = (ms: number) => ({ animationDelay: `${ms}ms` });
