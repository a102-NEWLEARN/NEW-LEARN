import { vi } from "vitest";
import { NARROW_SCREEN } from "@/components/shell/useMediaQuery";

// jsdom 에는 matchMedia 가 없다. 화면 폭 조건이 맞는지만 흉내 낸다 — 바뀜 알림은 보내지 않는다.
// 기본은 넓은 화면(PC)이다 (src/test/setup.ts). 좁은 화면 테스트는 그 안에서 stubScreen("narrow") 를 부른다
export function stubScreen(width: "wide" | "narrow") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width === "narrow" && query === NARROW_SCREEN,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}
