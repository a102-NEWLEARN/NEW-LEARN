// NEW:LEARN 서비스 워커 — 폰 홈 화면에 설치한 앱이 쓴다 (Jira S15P31A102-176, docs/plans/2026-11-05-pwa.md).
// 운영 빌드에서만 등록한다(src/main.tsx). dev:mock 은 같은 범위(/)에 MSW 워커를 쓰기 때문이다.
//
// - API(/api) · 다른 출처 · GET 이 아닌 요청은 건드리지 않는다 — 로그인 · 북마크 같은 회원별 응답을 캐시하지 않는다
// - 화면 주소(이동 요청)는 네트워크 먼저. 끊겼으면 오프라인 안내(/offline.html)
// - /assets/ 는 이름에 내용 해시가 붙어(Vite) 바뀌지 않는다 — 캐시 먼저, 없으면 받아 둔다
// - 오프라인 안내 · 그 로고는 설치할 때 받아 두고 캐시에서 준다
// CSP(default-src 'self', 인라인 스크립트 금지)를 지킨다 — 이 파일과 offline.html 모두 같은 출처 파일이다

const VERSION = "v1";
const SHELL_CACHE = `newlearn-shell-${VERSION}`;
const ASSET_CACHE = `newlearn-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
// 오프라인 안내가 쓰는 파일. 아이콘은 안내 화면의 로고다
const SHELL_FILES = [OFFLINE_URL, "/favicon.svg"];
// 해시 붙은 파일이 배포마다 쌓이지 않게 이 수만큼만 남긴다
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("newlearn-") &&
                key !== SHELL_CACHE &&
                key !== ASSET_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - MAX_ASSETS))
      .map((key) => cache.delete(key)),
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    void trimAssets();
  }
  return response;
}

async function networkFirstPage(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/actuator/"))
    return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // 오프라인 안내가 쓰는 파일(로고)은 미리 받아 둔 것을 준다 — 연결이 없어도 안내 화면 그림이 깨지지 않게
  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
  }
});
