/** 동작 줄이기를 켰나 — 켜져 있으면 확대 · 이동을 애니메이션 없이 한다 (EXPERIENCE.md Interaction Primitives 「모션」) */
export function prefersReducedMotion() {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}
