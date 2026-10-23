import { useSyncExternalStore } from "react";

/** 사이드바가 서랍이 되는 폭 — md(768px) 미만 (EXPERIENCE.md Responsive & Platform, DESIGN.md 브레이크포인트) */
export const NARROW_SCREEN = "(max-width: 767px)";

// 미디어 쿼리가 지금 맞는지. 창 폭이 바뀌면 다시 그린다
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
