// navigator.serviceWorker 에서 쓰는 것만 — 등록 결과는 쓰지 않는다
type ServiceWorkerRegistrar = {
  register: (url: string, options?: RegistrationOptions) => Promise<unknown>;
};

type Options = {
  /** 운영 빌드인가. 개발 · dev:mock 이면 false */
  production?: boolean;
  /** 서비스 워커를 못 쓰는 브라우저면 undefined */
  container?: ServiceWorkerRegistrar;
};

// 폰 홈 화면에 설치한 앱이 쓰는 서비스 워커(public/sw.js)를 등록한다 (Jira S15P31A102-176, docs/plans/2026-11-05-pwa.md).
// 운영 빌드에서만 등록한다 — dev:mock 은 같은 범위(/)에 MSW 워커(mockServiceWorker.js)를 써서, 우리 워커가 그 자리를
// 빼앗으면 가짜 API 가 멈춘다. 첫 화면을 그리는 데 방해되지 않게 페이지가 다 뜬 뒤 등록하고, 실패해도 화면은 그대로 쓴다
export function registerServiceWorker({
  production = import.meta.env.PROD,
  container = typeof navigator === "undefined"
    ? undefined
    : navigator.serviceWorker,
}: Options = {}) {
  if (!production || !container) return;
  window.addEventListener(
    "load",
    () => {
      container.register("/sw.js", { scope: "/" }).catch(() => {
        // 설치 기능만 없어진다. 알릴 것이 없다
      });
    },
    { once: true },
  );
}
