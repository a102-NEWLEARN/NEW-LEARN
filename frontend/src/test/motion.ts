import { expect } from "vitest";

// 움직임 클래스 — 애니메이션과 위치 · 크기 변화(translate · scale)
const MOTION = /(^|:)-?(animate|scale|translate)-/;

/**
 * 그린 것 안의 움직임 클래스가 모두 `motion-safe:` 인지 — 동작 줄이기를 켜면 움직임이 빠진다
 * (EXPERIENCE.md Interaction Primitives 「모션」). 움직임이 하나도 없으면 시험이 헛돈 것이라 실패한다
 */
export function expectMotionSafe(root: Element = document.body) {
  const tokens = [...root.querySelectorAll("[class]")]
    .flatMap((element) => (element.getAttribute("class") ?? "").split(/\s+/))
    .filter((token) => MOTION.test(token));
  expect(tokens.length).toBeGreaterThan(0);
  expect(tokens.filter((token) => !token.startsWith("motion-safe:"))).toEqual(
    [],
  );
}

/** 애니메이션이 몇 ms 뒤에 시작하나 — 등장 차례를 잰다. 지연이 없으면 NaN */
export const enterDelay = (element: Element) =>
  Number.parseFloat((element as HTMLElement).style.animationDelay);

// 끝이 있는 등장 애니메이션 클래스와 그 길이 — 계속 도는 것(infinite)은 뺀다
const FINITE_ENTER = /animate-\[newlearn-[\w-]+_(\d+)ms(?![^\]]*infinite)/;

/** 등장이 다 끝나는 시각(ms) — 지연 + 길이가 가장 늦은 것 */
export function lastEnterEnd(root: Element = document.body) {
  return Math.max(
    0,
    ...[...root.querySelectorAll("[class]")].flatMap((element) => {
      const found = (element.getAttribute("class") ?? "").match(FINITE_ENTER);
      if (!found) return [];
      const delay = enterDelay(element);
      return [(Number.isNaN(delay) ? 0 : delay) + Number(found[1])];
    }),
  );
}
