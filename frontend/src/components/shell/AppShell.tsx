import { useRef } from "react";
import { Outlet } from "react-router";
import { Header } from "@/components/shell/Header";

// 앱 셸 — 랜딩 · 로그인 · 가입을 뺀 화면이 이 안에 뜬다 (EXPERIENCE.md 앱 셸).
// 화면 높이에 맞추고 본문만 스크롤해서 헤더가 늘 위에 붙어 있다
export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);

  // 로고를 누르면 홈으로 가면서 맨 위로 올린다. 이미 홈이면 스크롤만 올라간다
  const scrollToTop = () => mainRef.current?.scrollTo?.({ top: 0 });

  return (
    <div className="flex h-dvh flex-col">
      <Header onLogoClick={scrollToTop} />
      <div className="flex min-h-0 flex-1">
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
