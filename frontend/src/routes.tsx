import type { RouteObject } from "react-router";
import { App } from "@/App";
import { NotFoundPage } from "@/pages/NotFoundPage";

// 주소 → 화면. main.tsx 와 라우트 테스트가 같은 목록을 쓴다.
// 화면 목록과 주소는 EXPERIENCE.md Information Architecture 에 있다
export const routes: RouteObject[] = [
  { path: "/", element: <App /> },
  // 그 밖의 주소
  { path: "*", element: <NotFoundPage /> },
];
