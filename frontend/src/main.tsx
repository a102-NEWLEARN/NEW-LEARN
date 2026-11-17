import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { createQueryClient } from "@/api/query-client";
import { answerOtherTabs } from "@/lib/tabLogin";
import { AppProviders } from "@/providers";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";
import { routes } from "@/routes";
import "@/style.css";

// 가짜 API 는 `npm run dev:mock`(Vite mode "mock") · `npm run dev:demo`(mode "demo", Vercel 데모)에서만 켠다.
// 켜질 때까지 기다린 뒤 화면을 그려야 첫 요청부터 가짜 API 가 받는다 (frontend/README.md 「가짜 API」).
// mode 는 상수와 직접 비교한다 — 운영 빌드에서 목 코드가 통째로 빠진다. 목록은 src/pwa/registerServiceWorker.ts 와 같아야 한다
async function enableMocking() {
  if (import.meta.env.MODE !== "mock" && import.meta.env.MODE !== "demo")
    return;
  const { network } = await import("virtual:msw");
  const { handlers } = await import("@/mocks/handlers");
  // 로그인 상태를 기억하는 응답을 앞에 둔다. 페이지를 열 때마다 손님으로 랜딩부터 시작한다 (src/mocks/session.ts)
  const { createSessionHandlers, startFromLanding } =
    await import("@/mocks/session");
  // demo 는 실제 기사 스냅샷이 콘텐츠를 다 답하고, 회원 · 로그인 · 용어사전만 아래 가짜 API 로 넘어간다 (src/mocks/snapshot/)
  const snapshotHandlers =
    import.meta.env.MODE === "demo"
      ? (await import("@/mocks/snapshot/handlers")).createSnapshotHandlers()
      : [];
  // 용어사전 문맥 뜻(A26)도 가짜로 답한다 — 진짜는 로그인 세션과 GMS 키가 있어야 해서 가짜 API 와 섞을 수 없다
  startFromLanding();
  network.configure({
    handlers: [...createSessionHandlers(), ...snapshotHandlers, ...handlers],
  });
  await network.enable();
}

const queryClient = createQueryClient();

// 링크를 새 탭으로 열면 새 탭이 「로그인한 탭 있나」 묻는다 — 이 탭에서 로그인했으면 답해 새 탭도 로그인을 이어 간다 (lib/tabLogin)
answerOtherTabs();

void enableMocking().then(() => {
  // 가짜 API 가 주소를 바꾼 뒤에 만든다 — 라우터는 만들 때의 주소로 시작한다
  const router = createBrowserRouter(routes);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders queryClient={queryClient}>
        <RouterProvider router={router} />
        {/* 개발 때만 뜬다. 오른쪽 아래는 스낵바 · 화면 버튼과 겹쳐 왼쪽 아래에 둔다 */}
        <ReactQueryDevtools buttonPosition="bottom-left" />
      </AppProviders>
    </StrictMode>,
  );
});

// 폰 홈 화면에 설치한 앱이 쓰는 서비스 워커 — 운영 빌드에서만 (src/pwa/registerServiceWorker.ts)
registerServiceWorker();
