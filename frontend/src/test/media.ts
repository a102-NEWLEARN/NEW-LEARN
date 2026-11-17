import { vi } from "vitest";
import { NARROW_SCREEN } from "@/components/shell/useMediaQuery";

type Width = "wide" | "narrow";

let current: Width = "wide";
const listeners = new Set<() => void>();

// jsdom 에는 matchMedia 가 없다. 화면 폭 조건이 맞는지를 흉내 낸다.
// 기본은 넓은 화면(PC)이다 (src/test/setup.ts). 좁은 화면 테스트는 그 안에서 stubScreen("narrow") 를 부른다
export function stubScreen(width: Width) {
  current = width;
  listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return current === "narrow" && query === NARROW_SCREEN;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => false,
  }));
}

// 동작 줄이기(prefers-reduced-motion)를 켠 것처럼 한다. 넓은 화면이다
export function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

// 창 폭이 바뀐 것처럼 듣고 있는 쪽에 알린다. 화면이 다시 그려지므로 act 안에서 부른다
export function resizeScreen(width: Width) {
  current = width;
  for (const listener of [...listeners]) listener();
}
