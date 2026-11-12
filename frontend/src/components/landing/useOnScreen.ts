import { type RefObject, useEffect, useState } from "react";

/**
 * 요소가 화면에 보이나 — 계속 움직이는 미리보기를 화면 밖에서 멈추려고 쓴다.
 * 알 수 없는 곳(IntersectionObserver 가 없는 오래된 브라우저 · 시험의 jsdom)에서는 보인다고 본다
 */
export function useOnScreen(ref: RefObject<Element | null>) {
  const [onScreen, setOnScreen] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(Boolean(entry?.isIntersecting)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return onScreen;
}
