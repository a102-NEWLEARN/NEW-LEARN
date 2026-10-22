import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest globals 를 꺼 두어 Testing Library 가 화면을 스스로 지우지 않는다. 테스트마다 지운다
afterEach(() => cleanup());

// jsdom 에는 ResizeObserver 가 없다. SEED 컴포넌트가 크기 변화를 보느라 쓴다
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
