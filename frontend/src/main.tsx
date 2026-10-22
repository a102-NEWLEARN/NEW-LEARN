import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { createQueryClient } from "@/api/query-client";
import { App } from "@/App";
import "@/style.css";

// 가짜 API 는 `npm run dev:mock`(Vite mode "mock") 에서만 켠다. 켜질 때까지 기다린 뒤 화면을 그려야
// 첫 요청부터 가짜 API 가 받는다 (frontend/README.md 「가짜 API」)
async function enableMocking() {
  if (import.meta.env.MODE !== "mock") return;
  const { network } = await import("virtual:msw");
  const { handlers } = await import("@/mocks/handlers");
  network.configure({ handlers });
  await network.enable();
}

const queryClient = createQueryClient();
const router = createBrowserRouter([{ path: "/", element: <App /> }]);

void enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools />
      </QueryClientProvider>
    </StrictMode>,
  );
});
