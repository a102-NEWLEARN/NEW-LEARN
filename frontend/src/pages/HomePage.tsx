import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { meQuery } from "@/api/members";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { HomeHeroBackground } from "@/components/home/HomeHeroBackground";
import { LatestArticles } from "@/components/home/LatestArticles";
import { NewIssues } from "@/components/home/NewIssues";
import { RecommendedIssues } from "@/components/home/RecommendedIssues";
import { SearchBox } from "@/components/home/SearchBox";
import { focusSearchRequest } from "@/components/shell/useQuickSearch";
import { usePageTitle } from "@/components/usePageTitle";

// 홈 — 인사 · 검색창 · 「새로운 이슈」 · 추천 이슈 · 최신 기사 (EXPERIENCE.md Information Architecture, 프로토타입 v21).
// 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function HomePage() {
  usePageTitle("홈");
  // A17 — 200 이면 회원, 401 이면 손님(null). 다른 오류로 실패해도 홈 전체를 막지 않고 손님 문구로 보인다
  const me = useQuery(meQuery);
  const member = me.data ?? null;
  // ⌘/Ctrl+K · 빠른 이동으로 왔으면 검색창에 포커스 (useQuickSearch)
  const navigate = useNavigate();
  const { pathname, search, state } = useLocation();
  const focusRequest = focusSearchRequest(state);
  // 검색창이 포커스한 뒤(자식 효과가 먼저 돈다) 부탁을 기록에서 지운다 —
  // 뒤로 · 앞으로 가기나 새로 고침으로 이 기록에 돌아와도 검색창을 다시 열지 않고 제목에 포커스하게
  useEffect(() => {
    if (focusRequest !== undefined)
      navigate({ pathname, search }, { replace: true, state: null });
  }, [focusRequest, navigate, pathname, search]);

  return (
    <>
      <section
        aria-label="오늘의 이슈"
        className="relative border-b border-stroke-neutral-subtle"
      >
        {/* 뒤에 까는 마인드맵 모양 배경. 섹션은 자르지 않는다 — 검색 목록이 섹션 밖으로 내려온다 */}
        <HomeHeroBackground />
        <div className="relative mx-auto max-w-[780px] px-x4 pt-x12 pb-x10 text-center md:px-x6 md:pt-x16 md:pb-x12">
          <HomeGreeting member={member} pending={me.isPending} />
          <SearchBox focusRequest={focusRequest} />
          <NewIssues />
        </div>
      </section>
      {/* 콘텐츠 화면 최대 너비 1040px (DESIGN.md Layout & Spacing) */}
      <div className="mx-auto max-w-[1040px] px-x4 pt-x7 pb-x14 md:px-x8">
        <RecommendedIssues member={member} pending={me.isPending} />
        <LatestArticles />
      </div>
    </>
  );
}
