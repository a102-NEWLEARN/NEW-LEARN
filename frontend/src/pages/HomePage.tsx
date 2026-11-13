import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { meQuery } from "@/api/members";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { HomeHeroBackground } from "@/components/home/HomeHeroBackground";
import { type HomeView, HomeViewTabs } from "@/components/home/HomeViewTabs";
import { LatestArticles } from "@/components/home/LatestArticles";
import {
  ONBOARDING_KEY,
  OnboardingTour,
} from "@/components/home/OnboardingTour";
import { type CoachMark, CoachMarks } from "@/components/coach/CoachMarks";
import { NewIssues } from "@/components/home/NewIssues";
import { RecommendedIssues } from "@/components/home/RecommendedIssues";
import { SearchBox } from "@/components/home/SearchBox";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";
import { focusSearchRequest } from "@/components/shell/useQuickSearch";
import { usePageTitle } from "@/components/usePageTitle";

// 홈 화면 안내 — 처음 들어오면 한 번 띄운다. 대상은 data-coach · data-tour 로 찾는다
const HOME_COACH: CoachMark[] = [
  {
    target: "bookmarks",
    title: "나의 뉴스함",
    body: "저장한 기사와 이슈를 모아 봐요",
    side: "bottom",
  },
  {
    target: "search",
    title: "궁금한 건 검색!",
    body: "이슈 · 사건 · 기사를 한 번에 찾아요",
    side: "bottom",
    at: 0.08,
  },
  {
    target: "recommended",
    title: "나를 위한 추천 이슈",
    body: "같은 사건 기사를 묶어 흐름으로 보여줘요",
    side: "right",
  },
  {
    target: "interests",
    title: "관심 분야 고르기",
    body: "고른 분야로 추천이 바뀌어요",
    side: "top",
  },
];

// 가입 직후 단계식 가이드(OnboardingTour)가 뜨는 날은 화면 안내를 띄우지 않는다 — 막이 두 겹 뜨지 않게
function touring() {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "pending";
  } catch {
    return false;
  }
}

// 홈 — 인사 · 검색창 · 「새로운 이슈」 · 추천 이슈 · 최신 기사 (EXPERIENCE.md Information Architecture, 프로토타입 v21).
// 좁은 화면은 추천 이슈 · 최신 기사를 탭으로 하나씩 보인다 (모바일 프로토타입 v1).
// 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function HomePage() {
  const [tour] = useState(touring);
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

  // 좁은 화면에서 고른 보기는 ?view= 에 남긴다 `[가정]`. 같은 화면에서 고르는 것이라 기록을 쌓지 않는다 (EXPERIENCE.md 이동 규칙)
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [searchParams, setSearchParams] = useSearchParams();
  const view: HomeView =
    searchParams.get("view") === "latest" ? "latest" : "recommended";
  const setView = (next: HomeView) =>
    setSearchParams(
      (params) => {
        if (next === "latest") params.set("view", "latest");
        else params.delete("view");
        return params;
      },
      { replace: true },
    );
  const recommended = (
    <div data-tour="issues">
      <RecommendedIssues member={member} pending={me.isPending} />
    </div>
  );
  const latest = (
    <div data-tour="articles">
      <LatestArticles />
    </div>
  );

  return (
    <>
      <section
        aria-label="오늘의 이슈"
        className="relative border-b border-stroke-neutral-subtle"
      >
        {/* 뒤에 까는 마인드맵 모양 배경. 섹션은 자르지 않는다 — 검색 목록이 섹션 밖으로 내려온다 */}
        <HomeHeroBackground />
        <div className="relative mx-auto max-w-[780px] px-x5 pt-x12 pb-x10 text-center md:px-x6 md:pt-x16 md:pb-x12">
          <HomeGreeting member={member} pending={me.isPending} />
          {/* 처음 가입한 사람 가이드가 비추는 자리(data-tour) — OnboardingTour */}
          <div data-tour="search">
            <SearchBox focusRequest={focusRequest} />
          </div>
          <NewIssues />
        </div>
      </section>
      {/* 콘텐츠 화면 최대 너비 1040px (DESIGN.md Layout & Spacing) */}
      <div
        className={`mx-auto max-w-[1040px] px-x5 pb-[96px] md:px-x8 md:pb-x14 ${narrow ? "" : "pt-x7"}`}
      >
        {narrow ? (
          <HomeViewTabs
            value={view}
            onValueChange={setView}
            recommended={recommended}
            latest={latest}
          />
        ) : (
          <>
            {recommended}
            {latest}
          </>
        )}
      </div>
      <OnboardingTour />
      {!tour && <CoachMarks id="home" marks={HOME_COACH} />}
    </>
  );
}
