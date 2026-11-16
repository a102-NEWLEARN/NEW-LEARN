// navigator.serviceWorker 에서 쓰는 것만 — 등록 결과는 쓰지 않는다
type ServiceWorkerRegistrar = {
  register: (url: string, options?: RegistrationOptions) => Promise<unknown>;
};

type Options = {
  /** 가짜 API 없는 운영 빌드인가. 개발 · dev:mock · 목 빌드(mode mock · demo)면 false */
  production?: boolean;
  /** 서비스 워커를 못 쓰는 브라우저면 undefined */
  container?: ServiceWorkerRegistrar;
};

// 폰 홈 화면에 설치한 앱이 쓰는 서비스 워커(public/sw.js)를 등록한다 (Jira S15P31A102-176, docs/plans/2026-11-05-pwa.md).
// 운영 빌드에서만 등록한다 — dev:mock 은 같은 범위(/)에 MSW 워커(mockServiceWorker.js)를 써서, 우리 워커가 그 자리를
// 빼앗으면 가짜 API 가 멈춘다. 목 빌드(`--mode mock`, 실제 기사 스냅샷을 쓰는 Vercel 데모 `--mode demo` — Jira 220)도
// 운영 빌드지만 같은 까닭으로 뺀다. 가짜 API 를 켜는 mode 목록은 src/main.tsx 와 같아야 한다
// (운영 빌드에서 목 코드가 빠지려면 상수 비교여야 해서 함수로 묶지 않았다).
// 첫 화면을 그리는 데 방해되지 않게 페이지가 다 뜬 뒤 등록하고, 실패해도 화면은 그대로 쓴다
export function registerServiceWorker({
  production = import.meta.env.PROD &&
    import.meta.env.MODE !== "mock" &&
    import.meta.env.MODE !== "demo",
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
