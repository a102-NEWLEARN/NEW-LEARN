import { type RefObject, useEffect, useState } from "react";
import { clamp01 } from "@/components/landing/issueChart";
import { prefersReducedMotion } from "@/lib/motion";

/** 한 장마다 남은 거리의 14% 씩 따라간다 — 스크롤이 뚝뚝 끊겨도 장면은 부드럽다 (프로토타입 v21) */
const FOLLOW = 0.14;
const SETTLE = 0.0006;

/**
 * 화면에 붙는 긴 구간(스크롤 연출 ① · ②)을 얼마나 내렸나 — 구간 맨 위가 화면 맨 위에 닿으면 0,
 * 구간 끝이 화면 끝에 닿으면 1. 동작 줄이기를 켜면 구간을 화면에 붙이지 않고(pinned false) 마지막 장면(1)을 보인다
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const [pinned] = useState(() => !prefersReducedMotion());
  const [progress, setProgress] = useState(pinned ? 0 : 1);

  useEffect(() => {
    if (!pinned) return;
    let frame: number | null = null;
    let target = 0;
    let current: number | null = null;

    const measure = () => {
      const element = ref.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const span = element.offsetHeight - window.innerHeight;
      target = span > 0 ? clamp01((window.scrollY - top) / span) : 0;
    };
    const tick = () => {
      frame = null;
      // 처음 한 장은 그 자리로 바로 — 새로 고침해 중간에서 열어도 장면이 맞는다
      const gap = target - (current ?? target);
      current =
        Math.abs(gap) < SETTLE ? target : (current ?? target) + gap * FOLLOW;
      setProgress(current);
      if (current !== target) frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      measure();
      frame ??= requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [pinned, ref]);

  return { progress, pinned };
}
