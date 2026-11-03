import { type RefObject, useLayoutEffect, useState } from "react";

// 요소의 폭 · 높이 — 창이나 옆 패널 때문에 크기가 바뀌면 다시 잰다. 잴 수 없으면(jsdom) 0
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
