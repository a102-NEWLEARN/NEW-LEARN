import { expect, test, vi } from "vitest";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";

// 서비스 워커는 운영 빌드에서만 등록한다 — dev:mock 은 같은 범위(/)에 MSW 워커를 써서, 우리 워커가 그 자리를 빼앗으면
// 가짜 API 가 멈춘다 (docs/plans/2026-11-05-pwa.md, Jira 176)

function fakeContainer() {
  return { register: vi.fn(() => Promise.resolve({})) };
}

test("운영 빌드면 페이지가 다 뜬 뒤 /sw.js 를 범위 / 로 등록한다", () => {
  const container = fakeContainer();
  registerServiceWorker({ production: true, container });

  expect(container.register).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("load"));

  expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
});

test("개발 · dev:mock 이면 등록하지 않는다", () => {
  const container = fakeContainer();
  registerServiceWorker({ production: false, container });

  window.dispatchEvent(new Event("load"));

  expect(container.register).not.toHaveBeenCalled();
});

test("서비스 워커를 못 쓰는 브라우저면 아무것도 하지 않는다", () => {
  expect(() =>
    registerServiceWorker({ production: true, container: undefined }),
  ).not.toThrow();
});

test("등록이 실패해도 화면에 오류를 던지지 않는다", async () => {
  const container = {
    register: vi.fn(() => Promise.reject(new Error("SecurityError"))),
  };
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  registerServiceWorker({ production: true, container });

  window.dispatchEvent(new Event("load"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  process.off("unhandledRejection", unhandled);
  expect(container.register).toHaveBeenCalled();
  expect(unhandled).not.toHaveBeenCalled();
});
