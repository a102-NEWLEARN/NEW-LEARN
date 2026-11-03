import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "@/mocks/node";
import { stubScreen } from "@/test/media";

// findBy · waitFor 의 기본 대기 1초 → 3초. 테스트 파일을 함께 돌릴 때 PC 가 바쁘면 파일마다 첫 가짜 API 응답이
// 1초를 넘어 첫 테스트가 돌아가며 실패했다 (2026-10-30, SSOT.md 7절)
configure({ asyncUtilTimeout: 3000 });

// Vitest globals 를 꺼 두어 Testing Library 가 화면을 스스로 지우지 않는다. 테스트마다 지운다
afterEach(() => cleanup());

// 가짜 API. 핸들러가 없는 요청은 테스트를 실패시킨다 — 모르는 사이에 진짜 서버를 부르지 않게
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom 에는 ResizeObserver 가 없다. SEED 컴포넌트가 크기 변화를 보느라 쓴다
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// jsdom 에는 matchMedia 도 없다. 넓은 화면(PC)에서 도는 것으로 둔다
afterEach(() => stubScreen("wide"));
stubScreen("wide");
