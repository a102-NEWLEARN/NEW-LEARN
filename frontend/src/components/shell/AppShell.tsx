import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";

// 앱 셸 — 랜딩 · 로그인 · 가입을 뺀 화면이 이 안에 뜬다 (EXPERIENCE.md 앱 셸).
// 화면 높이에 맞추고 본문만 스크롤해서 헤더가 늘 위에 붙어 있다
export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  // 사이드바는 처음에 접혀 있다
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // ⌘/Ctrl+\ 로 사이드바를 접고 편다 (PRD FR-3)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarExpanded((expanded) => !expanded);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 로고를 누르면 홈으로 가면서 맨 위로 올린다. 이미 홈이면 스크롤만 올라간다
  const scrollToTop = () => mainRef.current?.scrollTo?.({ top: 0 });

  return (
    <div className="flex h-dvh flex-col">
      <Header onLogoClick={scrollToTop} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          expanded={sidebarExpanded}
          onExpandedChange={setSidebarExpanded}
        />
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
