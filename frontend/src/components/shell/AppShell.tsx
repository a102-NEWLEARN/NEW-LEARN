import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { MeaningBubble } from "@/components/meaning/MeaningBubble";
import { SCREEN_RISE } from "@/components/motion/appMotion";
import { Header } from "@/components/shell/Header";
import { SessionExpiredRedirect } from "@/components/shell/SessionExpiredRedirect";
import {
  focusSearchRequest,
  useQuickSearch,
} from "@/components/shell/useQuickSearch";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";

// 기사 · 이슈 화면은 본문 높이를 채운다(h-full · min-h-full) — 본문 칸도 본문 높이로 둔다.
// 이 두 화면은 화면 떠오름에서 뺀다. 본문 높이 칸을 10px 옮기면 그만큼 본문이 넘쳐 스크롤바가 잠깐 생겼다 사라지고,
// 두 화면에는 181 의 등장(머리 · 지도 · 마인드맵)이 따로 있다. 나머지 화면은 칸이 내용 높이라 짧아도 넘치지 않는다
const fillsMain = (pathname: string) => /^\/(articles|issues)\//.test(pathname);

// 앱 셸 — 랜딩 · 로그인 · 가입을 뺀 화면이 이 안에 뜬다 (EXPERIENCE.md 앱 셸).
// 화면 높이에 맞추고 본문만 스크롤해서 헤더가 늘 위에 붙어 있다.
// 왼쪽 사이드바는 두지 않는다 — 좁은 화면 서랍은 Jira 195, 넓은 화면 레일 · 이슈 탐색은 Jira 196 에서 뺐다 (2026-11-12 사용자).
// 분야별 이슈는 홈 추천 이슈의 *전체보기*(/issues), 이슈 · 사건 · 기사는 검색으로 찾는다.
// 본문의 글을 드래그하면 용어사전 말풍선이 뜬다(MeaningBubble).
// 손님도 셸 안 화면을 쓴다 — 회원 화면(나의 뉴스함 · 마이페이지)만 RequireMember 가 막고(routes.tsx),
// 쓰다 세션이 끝난 회원은 SessionExpiredRedirect 가 로그인 화면으로 보낸다 (2026-11-13 Jira 205)
export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  const narrow = useMediaQuery(NARROW_SCREEN);
  const quickSearch = useQuickSearch();

  // ⌘/Ctrl+K 는 빠른 이동 — 홈 검색창으로 간다 (EXPERIENCE.md IA 통합 검색).
  // 한글 입력기는 그 키를 「ㅏ」로 내기도 해서 글자 대신 키 자리(KeyK)로도 본다
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // K 는 Shift · Alt 없이만. 라틴 글자가 왔으면 그 글자로만 본다 — Dvorak 의 Ctrl+T(K 자리)가 걸리지 않게
      const latin = /^[a-z]$/i.test(event.key);
      const k =
        !event.shiftKey &&
        !event.altKey &&
        (event.key.toLowerCase() === "k" || (!latin && event.code === "KeyK"));
      if (!k) return;
      event.preventDefault();
      quickSearch();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [quickSearch]);

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
      <SessionExpiredRedirect />
      <Header narrow={narrow} onLogoClick={scrollToTop} />
      <div className="flex min-h-0 flex-1">
        {/* isolate — 본문 안의 z-index(검색 목록 · TIP)가 본문 밖에 뜨는 것(용어사전 말풍선 · 시트) 위로 새지 않게 */}
        <main ref={mainRef} className="isolate min-w-0 flex-1 overflow-y-auto">
          {/* 다른 화면으로 가면 새 칸을 그려 본문이 떠오른다(appMotion.ts). 쿼리만 바뀌면 그대로 둔다 */}
          <div
            key={pathname}
            className={fillsMain(pathname) ? "h-full" : SCREEN_RISE}
          >
            <Outlet />
          </div>
        </main>
      </div>
      <MeaningBubble />
    </div>
  );
}
