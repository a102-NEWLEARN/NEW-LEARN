import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { SidebarDrawer } from "@/components/shell/SidebarDrawer";
import {
  focusSearchRequest,
  useQuickSearch,
} from "@/components/shell/useQuickSearch";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";

// 앱 셸 — 랜딩 · 로그인 · 가입을 뺀 화면이 이 안에 뜬다 (EXPERIENCE.md 앱 셸).
// 화면 높이에 맞추고 본문만 스크롤해서 헤더가 늘 위에 붙어 있다.
// 767px 이하에서는 사이드바가 서랍이 되고 헤더의 메뉴 버튼으로 연다
export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  const narrow = useMediaQuery(NARROW_SCREEN);
  // 사이드바는 처음에 접혀 있다
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 넓은 화면이 되면 서랍은 사라진다. 열림 상태를 남기면 다시 좁아질 때 저절로 열려서 닫아 둔다
  if (!narrow && drawerOpen) setDrawerOpen(false);
  // 이슈 탐색에서 펼친 분야 — 사이드바를 접거나 서랍을 닫았다 열어도 그대로 둔다
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const explorer = {
    openCode: openCategory,
    onOpenCodeChange: setOpenCategory,
  };

  const quickSearch = useQuickSearch();

  // ⌘/Ctrl+\ 로 사이드바를 접고 편다 (PRD FR-3). 좁은 화면에서는 서랍을 열고 닫는다.
  // ⌘/Ctrl+K 는 빠른 이동 — 홈 검색창으로 간다. 열린 서랍은 닫는다 (EXPERIENCE.md IA 통합 검색).
  // 한글 입력기는 그 키를 「₩」 · 「ㅏ」로 내기도 해서 글자 대신 키 자리(Backslash · KeyK)로도 본다
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const backslash = event.key === "\\" || event.code === "Backslash";
      const k = event.key.toLowerCase() === "k" || event.code === "KeyK";
      if (backslash) {
        event.preventDefault();
        if (narrow) setDrawerOpen((open) => !open);
        else setSidebarExpanded((expanded) => !expanded);
      } else if (k) {
        event.preventDefault();
        setDrawerOpen(false);
        quickSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [narrow, quickSearch]);

  // 다른 화면으로 가면 포커스를 본문 맨 위 제목(h1)으로 옮긴다 (EXPERIENCE.md Accessibility Floor).
  // 처음 열 때와 같은 화면에서 쿼리(?category= 등)만 바뀔 때는 옮기지 않는다.
  // 화면의 h1 에는 tabIndex={-1} 을 줘야 포커스를 받는다. 또 h1 은 데이터를 기다리지 않고 첫 렌더에 그려야 한다 —
  // 데이터를 받은 뒤에야 h1 을 그리면 그때는 이미 이 효과가 지나가서 포커스가 body 에 남는다
  const { pathname, state } = useLocation();
  const shownPath = useRef(pathname);
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    // 빠른 이동으로 왔으면 검색창이 포커스를 가져갔다 (useQuickSearch)
    if (focusSearchRequest(state) !== undefined) return;
    mainRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [pathname, state]);

  // 로고를 누르면 홈으로 가면서 맨 위로 올린다. 이미 홈이면 스크롤만 올라간다
  const scrollToTop = () => mainRef.current?.scrollTo?.({ top: 0 });

  return (
    <div className="flex h-dvh flex-col">
      <Header
        narrow={narrow}
        onLogoClick={scrollToTop}
        onMenuClick={() => setDrawerOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        {narrow ? (
          <SidebarDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            {...explorer}
          />
        ) : (
          <Sidebar
            expanded={sidebarExpanded}
            onExpandedChange={setSidebarExpanded}
            {...explorer}
          />
        )}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
