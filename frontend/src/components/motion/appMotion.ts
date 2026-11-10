import type { CSSProperties } from "react";
import { enterAt } from "@/components/motion/screenMotion";

// 앱 전체의 움직임 — 프로토타입 v21 · 모바일 v1 이 모든 화면에 쓰는 규칙(.im-screen · .grid > * · ul > li · im-fade)을 옮겼다.
// 길이는 프로토타입 값이다. 카드 440ms · 목록 행 380ms · 홈 배경 520ms 는 EXPERIENCE.md 「모션」 숫자(큰 움직임 300ms 이하)의
// 예외다(2026-11-06 사용자 결정, Jira 184). 기사 · 이슈 화면 안의 움직임은 screenMotion.ts 에 있다.
// 모두 motion-safe 라 동작 줄이기를 켜면 처음부터 다 그린 모양이다. 지연 동안은 첫 장면(투명)에 머문다(backwards).
// Tailwind 가 찾을 수 있게 클래스는 글자 그대로 적는다

/** 화면이 바뀔 때 본문이 10px 아래에서 떠오른다 — 셸 본문 (.im-screen) */
export const SCREEN_RISE =
  "motion-safe:animate-[newlearn-rise-in_300ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 카드 묶음의 카드 하나 — style 에 cardAt(i) 를 함께 준다 (.grid > *) */
export const CARD_RISE =
  "motion-safe:animate-[newlearn-rise-in_440ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 목록 행 하나 — style 에 rowAt(i) 를 함께 준다 (ul > li) */
export const ROW_RISE =
  "motion-safe:animate-[newlearn-rise-in_380ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** 새로 그린 묶음 · 폼이 떠오른다 — 로그인 폼 · 분야를 바꾼 추천 이슈 */
export const GROUP_RISE =
  "motion-safe:animate-[newlearn-rise-in_260ms_var(--seed-timing-function-enter)_backwards]";

/** 나타난다 — 로그인 화면 150ms */
export const SCREEN_FADE =
  "motion-safe:animate-[newlearn-fade-in_150ms_var(--seed-timing-function-enter)_backwards]";
/** 나타난다 — 검색 결과 목록 120ms */
export const LIST_FADE =
  "motion-safe:animate-[newlearn-fade-in_120ms_var(--seed-timing-function-enter)_backwards]";
/** 나타난다 — 좁은 화면 홈 보기 탭 패널 180ms (모바일 v1) */
export const PANEL_FADE =
  "motion-safe:animate-[newlearn-fade-in_180ms_var(--seed-timing-function-enter)_backwards]";
/** 천천히 나타난다 — 홈 배경 그림 520ms */
export const BACKDROP_FADE =
  "motion-safe:animate-[newlearn-fade-in_520ms_ease-out_backwards]";

// 호버 안내 — 평소 투명하고, 감싼 링크(group)에 마우스를 올리거나 키보드로 오면 왼쪽 4px 에서 미끄러지며 나타난다
// (프로토타입 v21 im-rec-arrow 150ms · im-row-hint 180ms). 호버는 마우스가 있을 때만 걸린다(Tailwind hover 변형).
// 동작 줄이기면 미끄러짐은 빼고 나타나기만 한다. 꾸밈이라 aria-hidden 으로 두고, 없어도 링크를 쓸 수 있다
const HINT =
  "opacity-0 transition-[opacity,translate] ease-[var(--seed-timing-function-enter)] group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:translate-x-[-4px] motion-safe:group-hover:translate-x-[0px] motion-safe:group-focus-visible:translate-x-[0px]";
/** 이슈 카드 「흐름 보기 ›」 */
export const CARD_HINT = `${HINT} duration-[150ms]`;
/** 기사 행 「마인드맵 보기 ›」 */
export const ROW_HINT = `${HINT} duration-[180ms]`;

/** 카드 차례 — 45ms 간격, 8번째(315ms)부터는 같이 나온다 */
export const cardAt = (index: number): CSSProperties =>
  enterAt(Math.min(index, 7) * 45);
/** 목록 행 차례 — 30ms 간격, 10번째(270ms)부터는 같이 나온다 */
export const rowAt = (index: number): CSSProperties =>
  enterAt(Math.min(index, 9) * 30);
