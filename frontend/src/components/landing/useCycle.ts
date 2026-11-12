import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * 미리보기에서 강조할 것을 ms 마다 하나씩 넘긴다 — 흐름지도 2.6초 · 마인드맵 2.8초 (프로토타입 v21).
 * 마우스 · 포커스가 오면(hold) 그 자리에 멈춘다. 동작 줄이기를 켜거나 화면 밖이면(running false) 저절로 넘기지 않는다
 */
export function useCycle(count: number, ms: number, running = true) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [still] = useState(prefersReducedMotion);

  useEffect(() => {
    if (held || still || !running || count < 2) return;
    const timer = setInterval(
      () => setActive((index) => (index + 1) % count),
      ms,
    );
    return () => clearInterval(timer);
  }, [held, still, running, count, ms]);

  return {
    active,
    /** 마우스 · 포커스로 그것을 강조하고 멈춘다 */
    hold: (index: number) => {
      setHeld(true);
      setActive(index);
    },
    release: () => setHeld(false),
  };
}
