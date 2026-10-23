import { useCallback, useSyncExternalStore } from "react";

/** 사이드바가 서랍이 되는 폭 — md(768px) 미만 (EXPERIENCE.md Responsive & Platform, DESIGN.md 브레이크포인트) */
export const NARROW_SCREEN = "(max-width: 767px)";

// 미디어 쿼리가 지금 맞는지. 창 폭이 바뀌면 다시 그린다.
// 구독 함수를 query 가 같으면 그대로 둬야 렌더마다 리스너를 뗐다 붙이지 않는다
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
  );
}
