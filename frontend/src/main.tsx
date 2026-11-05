import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { createQueryClient } from "@/api/query-client";
import { AppProviders } from "@/providers";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";
import { routes } from "@/routes";
import "@/style.css";

// 가짜 API 는 `npm run dev:mock`(Vite mode "mock") 에서만 켠다. 켜질 때까지 기다린 뒤 화면을 그려야
// 첫 요청부터 가짜 API 가 받는다 (frontend/README.md 「가짜 API」)
async function enableMocking() {
  if (import.meta.env.MODE !== "mock") return;
  const { network } = await import("virtual:msw");
  const { handlers } = await import("@/mocks/handlers");
  // 로그인 상태를 기억하는 응답을 앞에 둔다. 페이지를 열 때마다 손님으로 랜딩부터 시작한다 (src/mocks/session.ts)
  const { createSessionHandlers, startFromLanding } =
    await import("@/mocks/session");
  // 용어사전(A19)만 가짜로 답하지 않고 Vite 프록시로 진짜 서버에 보낸다 — 사전 키는 서버에만 둔다.
  // 프록시 대상은 API_PROXY_TARGET (frontend/README.md 「가짜 API」). 테스트는 여전히 가짜 사전을 쓴다
  const { http, passthrough } = await import("msw");
  const realDictionary = http.get("/api/v1/dictionary", () => passthrough());
  startFromLanding();
  network.configure({
    handlers: [...createSessionHandlers(), realDictionary, ...handlers],
  });
  await network.enable();
}

const queryClient = createQueryClient();

void enableMocking().then(() => {
  // 가짜 API 가 주소를 바꾼 뒤에 만든다 — 라우터는 만들 때의 주소로 시작한다
  const router = createBrowserRouter(routes);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders queryClient={queryClient}>
        <RouterProvider router={router} />
        {/* 개발 때만 뜬다. 오른쪽 아래는 용어사전 버튼 자리라 왼쪽 아래에 둔다 */}
        <ReactQueryDevtools buttonPosition="bottom-left" />
      </AppProviders>
    </StrictMode>,
  );
});

// 폰 홈 화면에 설치한 앱이 쓰는 서비스 워커 — 운영 빌드에서만 (src/pwa/registerServiceWorker.ts)
registerServiceWorker();
