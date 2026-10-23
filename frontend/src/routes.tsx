import type { RouteObject } from "react-router";
import { App } from "@/App";
import { NotFoundPage } from "@/pages/NotFoundPage";

// 주소 → 화면. main.tsx 와 테스트 도우미(src/test/render.tsx 의 renderRoute)가 같은 목록을 쓴다.
// 화면 목록과 주소는 EXPERIENCE.md Information Architecture 에 있다.
// 지금 `/` 는 개발 확인 화면이다 — IA 의 랜딩(`/`) · 홈(`/home`)은 S15P31A102-44 에서 넣는다
export const routes: RouteObject[] = [
  { path: "/", element: <App /> },
  // 그 밖의 주소
  { path: "*", element: <NotFoundPage /> },
];
