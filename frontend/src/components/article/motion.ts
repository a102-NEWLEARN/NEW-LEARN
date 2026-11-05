import type { CSSProperties } from "react";

// 기사 마인드맵 두 보기(흐름지도 · 마인드맵)와 기사 머리의 움직임 — 열 때 차례로 나오기 · 호버 · 강조
// (프로토타입 v21 im-node-in · im-draw · im-rise · im-pulse 를 키웠다). 키프레임은 newlearn-theme.css.
// 이 화면은 EXPERIENCE.md 「모션」 숫자(하나 300ms 이하)의 예외다 — 하나하나 500 ~ 650ms 로 넘쳤다 자리 잡고,
// 다 나오기까지 2초가 안 걸린다(2026-11-05 사용자 「밋밋하다」).
// 모두 motion-safe 라 동작 줄이기를 켜면 처음부터 다 그린 모양이다. 지연 동안은 첫 장면(투명 · 작게)에 머문다(backwards).
// 꾸밈(파문 · 달리는 점)은 늘 opacity 0 으로 두고 애니메이션이 도는 동안만 보인다 — 동작 줄이기면 끝까지 안 보인다.
// Tailwind 가 찾을 수 있게 클래스는 글자 그대로 적는다

/** 넘쳤다가 자리 잡으며 튀어나온다 — 가운데 원 · 흐름지도 번호 원 · 머리 줄 점 */
export const SPRING_IN =
  "motion-safe:animate-[newlearn-spring-in_600ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 부모 자리에서 날아 나온다 — 마인드맵 가지 · 잎. style 에 flyFrom 을 함께 준다 */
export const FLY_OUT =
  "motion-safe:animate-[newlearn-fly-out_650ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 선이 시작점에서 끝점으로 뻗는다 — 날아가는 노드와 같은 길이 · 곡선이라 선 끝이 노드를 따라간다. 선에 pathLength={1} */
export const DRAW =
  "motion-safe:animate-[newlearn-draw_650ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 아래에서 떠오른다 — 흐름지도 질문 · 잎 카드 · 기사 머리 */
export const RISE =
  "motion-safe:animate-[newlearn-rise-short_500ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 잇는 선이 왼쪽에서 오른쪽으로 · 위에서 아래로 자란다 — 흐름지도 번호 원 사이 */
export const GROW_X =
  "origin-left motion-safe:animate-[newlearn-grow-x_300ms_cubic-bezier(0.4,0,0.2,1)_backwards]";
export const GROW_Y =
  "origin-top motion-safe:animate-[newlearn-grow-y_300ms_cubic-bezier(0.4,0,0.2,1)_backwards]";
/** 선이 자라는 동안 그 끝을 따라 달리는 점 — 선과 같은 길이 · 곡선. style 에 travel 을 함께 준다 */
export const TRAVEL_X =
  "opacity-0 motion-safe:animate-[newlearn-travel-x_300ms_cubic-bezier(0.4,0,0.2,1)_both]";
export const TRAVEL_Y =
  "opacity-0 motion-safe:animate-[newlearn-travel-y_300ms_cubic-bezier(0.4,0,0.2,1)_both]";
/** 나타난다 — 선 끝 화살표 */
export const FADE_IN =
  "motion-safe:animate-[newlearn-fade-in_200ms_var(--seed-timing-function-enter)_backwards]";
/** 원 둘레에서 파문이 한 번 · 계속 번진다 */
export const RIPPLE_ONCE =
  "opacity-0 motion-safe:animate-[newlearn-ripple_700ms_cubic-bezier(0.2,0.8,0.2,1)_both]";
export const RIPPLE_LOOP =
  "opacity-0 motion-safe:animate-[newlearn-ripple_3s_cubic-bezier(0.2,0.8,0.2,1)_infinite_backwards]";
/** 마인드맵 잎이 둥실 떠 있다 — 잎마다 박자를 달리한다(floatPhase) */
export const FLOAT =
  "motion-safe:animate-[newlearn-float_4.8s_ease-in-out_infinite]";
/** 마우스를 올린 길 위로 흐르는 점선 — 동작 줄이기면 보이지 않는다 */
export const FLOW =
  "opacity-0 motion-safe:opacity-100 motion-safe:animate-[newlearn-flow_900ms_linear_infinite]";
/** 강조한 잎 원이 한 번 튄다. 강조할 때 붙여서 그때마다 다시 돈다 */
export const POP_ONCE =
  "motion-safe:animate-[newlearn-pop-once_300ms_cubic-bezier(0.34,1.56,0.64,1)]";
/** 마우스를 올리면 살짝 넘치며 커진다 */
export const HOVER_SPRING =
  "transition-[scale,translate] duration-[var(--seed-duration-d4)] ease-[cubic-bezier(0.34,1.56,0.64,1)]";

/** 애니메이션 지연 — 등장 차례 */
export const enterAt = (ms: number): CSSProperties => ({
  animationDelay: `${ms}ms`,
});

/** 날아 나오는 출발점 — 제자리에서 부모까지의 거리(SVG 사용자 단위) */
export const flyFrom = (dx: number, dy: number, ms: number): CSSProperties =>
  ({
    ...enterAt(ms),
    "--nl-from-x": `${dx}px`,
    "--nl-from-y": `${dy}px`,
  }) as CSSProperties;

/** 달리는 점의 출발 · 도착(left 또는 top 값) */
export const travel = (from: string, to: string, ms: number): CSSProperties =>
  ({
    ...enterAt(ms),
    "--nl-travel-from": from,
    "--nl-travel-to": to,
  }) as CSSProperties;

/** 둥실 뜨는 박자 — 음수 지연이라 처음부터 서로 다른 자리에서 시작한다 */
export const floatPhase = (seed: number): CSSProperties => ({
  animationDelay: `${-((seed * 730) % 4800)}ms`,
});
