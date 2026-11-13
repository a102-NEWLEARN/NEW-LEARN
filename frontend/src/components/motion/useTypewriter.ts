import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** 한 글자 찍는 간격 · 다 찍은 뒤 커서가 남는 시간 (EXPERIENCE.md Interaction Primitives 「모션」 홈 인사 줄) */
export const TYPE_STEP_MS = 30;
export const CARET_TAIL_MS = 900;

/**
 * 글을 타자 치듯 한 글자씩 내놓는다 — 홈 인사 줄. 처음 그릴 때 한 번 돈다. 글이 바뀌면 부르는 쪽이 key 로 새로 그린다.
 * 동작 줄이기를 켜면 처음부터 다 찍은 글이고 커서가 없다
 */
export function useTypewriter(text: string) {
  const length = [...text].length;
  const [count, setCount] = useState(() =>
    prefersReducedMotion() ? length : 0,
  );
  const [caret, setCaret] = useState(() => !prefersReducedMotion());

  const typing = count < length;
  // 타이머 하나로 다 찍을 때까지 돈다
  useEffect(() => {
    if (!typing) return;
    const timer = setInterval(
      () => setCount((n) => Math.min(n + 1, length)),
      TYPE_STEP_MS,
    );
    return () => clearInterval(timer);
  }, [typing, length]);

  useEffect(() => {
    if (typing || !caret) return;
    const timer = setTimeout(() => setCaret(false), CARET_TAIL_MS);
    return () => clearTimeout(timer);
  }, [typing, caret]);

  return {
    /** 지금까지 찍은 글 */
    shown: [...text].slice(0, count).join(""),
    typing,
    caret,
  };
}
