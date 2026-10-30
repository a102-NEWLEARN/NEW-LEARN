import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { createQueryClient } from "@/api/query-client";
import { AppProviders } from "@/providers";
import { routes } from "@/routes";
import "@/style.css";

// 가짜 API 는 `npm run dev:mock`(Vite mode "mock") 에서만 켠다. 켜질 때까지 기다린 뒤 화면을 그려야
// 첫 요청부터 가짜 API 가 받는다 (frontend/README.md 「가짜 API」)
async function enableMocking() {
  if (import.meta.env.MODE !== "mock") return;
  const { network } = await import("virtual:msw");
  const { handlers } = await import("@/mocks/handlers");
  // 로그인 상태를 기억하는 응답을 앞에 둔다 — 손님으로 시작한다 (src/mocks/session.ts)
  const { sessionHandlers } = await import("@/mocks/session");
  network.configure({ handlers: [...sessionHandlers, ...handlers] });
  await network.enable();
}

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

void enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders queryClient={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools />
      </AppProviders>
    </StrictMode>,
  );
});
