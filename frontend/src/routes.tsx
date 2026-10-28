import { Navigate, type RouteObject } from "react-router";
import { AppShell } from "@/components/shell/AppShell";
import { HomePage } from "@/pages/HomePage";
import { IssuePage } from "@/pages/IssuePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RouteErrorPage } from "@/pages/RouteErrorPage";

// 셸 안에 뜨는 화면들을 감싼다. 화면이 렌더 중 터지면 셸은 남기고 본문 자리에만 오류 화면을 둔다.
// 셸 자체가 터지면 바깥 errorElement 가 화면 전체에 뜬다
export function shellRoute(pages: RouteObject[]): RouteObject {
  return {
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [{ errorElement: <RouteErrorPage />, children: pages }],
  };
}

// 주소 → 화면. main.tsx 와 테스트 도우미(src/test/render.tsx 의 renderRoute)가 같은 목록을 쓴다.
// 화면 목록과 주소는 EXPERIENCE.md Information Architecture 에 있다
export const routes: RouteObject[] = [
  // 랜딩(`/`)은 S15P31A102-44 에서 넣는다. 그전에는 홈으로 보낸다
  { path: "/", element: <Navigate to="/home" replace /> },
  shellRoute([
    { path: "/home", element: <HomePage /> },
    { path: "/issues/:issueId", element: <IssuePage /> },
    // 그 밖의 주소
    { path: "*", element: <NotFoundPage /> },
  ]),
];
