/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

// public/sw.js 를 가짜 워커 환경(self · caches · fetch)에서 돌린다 (Jira 176).
// 지키는 것: API · 다른 출처 · GET 이 아닌 요청은 건드리지 않는다, 화면 주소는 네트워크 먼저 · 끊기면 오프라인 안내,
// /assets/ 는 캐시 먼저

const ORIGIN = "https://newlearn.io.kr";
// public 파일은 직접 읽는다. `new URL("…/public/…", import.meta.url)` 꼴은 Vite 가 정적 자산 주소로 바꿔 버려서 경로를 만든다
const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const code = readFileSync(join(frontendDir, "public/sw.js"), "utf8");

type Handler = (event: unknown) => void;

function loadWorker(fetchImpl: (request: unknown) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  // 캐시는 이름과 상관없이 주소 경로 하나로 모은다 — 무엇이 들어갔는지만 본다
  const store = new Map<string, Response>();
  const keyOf = (request: unknown) =>
    typeof request === "string"
      ? request
      : new URL((request as { url: string }).url).pathname;
  const cache = {
    addAll: async (urls: string[]) => {
      for (const url of urls) store.set(url, new Response(`precached ${url}`));
    },
    put: async (request: unknown, response: Response) => {
      store.set(keyOf(request), response);
    },
    keys: async () => [],
    delete: async () => true,
  };
  const caches = {
    open: async () => cache,
    match: async (request: unknown) => store.get(keyOf(request)),
    keys: async () => [],
    delete: async () => true,
  };
  const self = {
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    location: { origin: ORIGIN },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetchSpy = vi.fn(fetchImpl);
  runInNewContext(code, {
    self,
    caches,
    fetch: fetchSpy,
    URL,
    Response,
    Promise,
  });
  return { handlers, store, fetchSpy };
}

async function install(handlers: Record<string, Handler>) {
  let done: Promise<unknown> = Promise.resolve();
  handlers.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
}

// fetch 이벤트를 보내고 respondWith 로 준 응답을 돌려준다. 건드리지 않으면 undefined
function dispatchFetch(
  handlers: Record<string, Handler>,
  request: { url: string; method?: string; mode?: string },
) {
  let responded: Promise<Response> | undefined;
  handlers.fetch({
    request: { method: "GET", mode: "cors", ...request },
    respondWith: (p: Promise<Response>) => {
      responded = p;
    },
  });
  return responded;
}

const online = () => Promise.resolve(new Response("from network"));
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

test("설치하면 오프라인 안내 페이지를 미리 받아 둔다", async () => {
  const { handlers, store } = loadWorker(online);

  await install(handlers);

  expect(store.has("/offline.html")).toBe(true);
});

test.each([
  ["API", { url: `${ORIGIN}/api/v1/members/me` }],
  [
    "API (이동처럼 보여도)",
    { url: `${ORIGIN}/api/v1/issues`, mode: "navigate" },
  ],
  ["상태 확인", { url: `${ORIGIN}/actuator/health` }],
  ["다른 출처", { url: "https://cdn.example.com/a.js" }],
  ["GET 이 아닌 요청", { url: `${ORIGIN}/assets/a.js`, method: "POST" }],
])(
  "%s 요청은 건드리지 않는다 — 회원별 응답을 캐시하지 않는다",
  (_, request) => {
    const { handlers } = loadWorker(online);

    expect(dispatchFetch(handlers, request)).toBeUndefined();
  },
);

test("화면 주소는 네트워크에서 받는다", async () => {
  const { handlers } = loadWorker(online);
  await install(handlers);

  const response = await dispatchFetch(handlers, {
    url: `${ORIGIN}/issues/12`,
    mode: "navigate",
  });

  expect(await response?.text()).toBe("from network");
});

test("연결이 끊겼으면 화면 주소 대신 오프라인 안내를 준다", async () => {
  const { handlers } = loadWorker(offline);
  await install(handlers);

  const response = await dispatchFetch(handlers, {
    url: `${ORIGIN}/home`,
    mode: "navigate",
  });

  expect(await response?.text()).toBe("precached /offline.html");
});

test("/assets/ 는 한 번 받으면 다음부터 캐시에서 준다", async () => {
  const { handlers, fetchSpy } = loadWorker(() =>
    Promise.resolve(new Response("bundle")),
  );
  const asset = { url: `${ORIGIN}/assets/index-abc123.js` };

  const first = await dispatchFetch(handlers, asset);
  const second = await dispatchFetch(handlers, asset);

  expect(await first?.text()).toBe("bundle");
  expect(second).toBeDefined();
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("오프라인 안내가 쓰는 로고는 미리 받아 둔 것을 준다 — 연결이 없어도 그림이 깨지지 않게", async () => {
  const { handlers } = loadWorker(offline);
  await install(handlers);

  const response = await dispatchFetch(handlers, {
    url: `${ORIGIN}/favicon.svg`,
  });

  expect(await response?.text()).toBe("precached /favicon.svg");
});
