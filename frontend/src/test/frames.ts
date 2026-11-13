import { vi } from "vitest";

// 계속 움직이는 장식(홈 배경 · 랜딩 노드 그물)을 시험하는 도우미

/** requestAnimationFrame 을 붙잡아 두었다가 시험이 정한 시각으로 한 번씩 부른다 */
export function holdFrames() {
  let pending: FrameRequestCallback | null = null;
  const request = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      pending = callback;
      return 1;
    });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  return {
    request,
    runAt: (ms: number) => {
      const callback = pending;
      pending = null;
      callback?.(ms);
    },
  };
}

/** 그림이 화면에 보이는지 알리는 IntersectionObserver — jsdom 에는 없다 */
export function stubOnScreen(visible: boolean) {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      callback: (entries: { isIntersecting: boolean }[]) => void;
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: visible }]);
      }
      unobserve() {}
      disconnect() {}
    },
  );
}
