import { vi } from "vitest";

// jsdom 에는 ResizeObserver 가 없다. SEED 컴포넌트가 크기 변화를 보느라 쓴다
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
