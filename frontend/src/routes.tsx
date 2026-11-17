import type { RouteObject } from "react-router";
import { RequireMember } from "@/components/RequireMember";
import { AppShell } from "@/components/shell/AppShell";
import { ArticlePage } from "@/pages/ArticlePage";
import { BookmarksPage } from "@/pages/BookmarksPage";
import { HomePage } from "@/pages/HomePage";
import { IssuePage } from "@/pages/IssuePage";
import { IssuesPage } from "@/pages/IssuesPage";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { MyPage } from "@/pages/MyPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RouteErrorPage } from "@/pages/RouteErrorPage";
import { SignupPage } from "@/pages/SignupPage";

// 셸 안에 뜨는 화면들을 감싼다. 손님도 연다 — 회원 화면은 아래 목록에서 RequireMember 로 따로 감싼다.
// 화면이 렌더 중 터지면 셸은 남기고 본문 자리에만 오류 화면을 둔다. 셸 자체가 터지면 바깥 errorElement 가 화면 전체에 뜬다
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
  // 랜딩 · 로그인 · 가입은 셸 없이 전체 화면으로 뜨고 손님도 연다
  { path: "/", element: <LandingPage />, errorElement: <RouteErrorPage /> },
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    path: "/signup",
    element: <SignupPage />,
    errorElement: <RouteErrorPage />,
  },
  shellRoute([
    { path: "/home", element: <HomePage /> },
    { path: "/issues", element: <IssuesPage /> },
    { path: "/issues/:issueId", element: <IssuePage /> },
    { path: "/articles/:articleId", element: <ArticlePage /> },
    // 회원 화면 — 손님은 로그인 화면으로 보낸다 (EXPERIENCE.md 이동 규칙, 2026-11-13 Jira 205)
    {
      element: <RequireMember />,
      children: [
        { path: "/me", element: <MyPage /> },
        { path: "/bookmarks", element: <BookmarksPage /> },
      ],
    },
    // 그 밖의 주소
    { path: "*", element: <NotFoundPage /> },
  ]),
];
