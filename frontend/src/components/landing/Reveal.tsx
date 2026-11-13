import { type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

type RevealProps = {
  children: ReactNode;
  /** 늦출 시간(ms) — 칸이 여럿이면 70ms 씩 (프로토타입 v21) */
  delay?: number;
  className?: string;
};

// 화면에 들어오면 16px 아래에서 500ms 로 떠오른다 — 랜딩 섹션 (프로토타입 v21 Reveal, threshold 0.12).
// 한 번 보이면 그대로 둔다. 들어왔는지 알 수 없는 곳(오래된 브라우저 · 시험의 jsdom)과 동작 줄이기에서는 처음부터 보인다
export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (shown || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { threshold: 0.12 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={`transition-[opacity,translate] duration-500 ease-[var(--seed-timing-function-enter)] ${
        shown ? "opacity-100" : "opacity-0 motion-safe:translate-y-[16px]"
      } ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
