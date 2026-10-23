import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/api/members";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { NewIssues } from "@/components/home/NewIssues";
import { RecommendedIssues } from "@/components/home/RecommendedIssues";
import { usePageTitle } from "@/components/usePageTitle";

// 홈 — 인사 · 「새로운 이슈」 · 추천 이슈 (EXPERIENCE.md Information Architecture, 프로토타입 v21).
// 최신 기사는 S15P31A102-45 에서 붙인다. 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function HomePage() {
  usePageTitle("홈");
  // A17 — 200 이면 회원, 401 이면 손님(null). 다른 오류로 실패해도 홈 전체를 막지 않고 손님 문구로 보인다
  const me = useQuery(meQuery);
  const member = me.data ?? null;

  return (
    <>
      <section
        aria-label="오늘의 이슈"
        className="border-b border-stroke-neutral-subtle"
      >
        <div className="mx-auto max-w-[780px] px-x4 pt-x12 pb-x10 text-center md:px-x6 md:pt-x16 md:pb-x12">
          <HomeGreeting member={member} pending={me.isPending} />
          <NewIssues />
        </div>
      </section>
      {/* 콘텐츠 화면 최대 너비 1040px (DESIGN.md Layout & Spacing) */}
      <div className="mx-auto max-w-[1040px] px-x4 pt-x7 pb-x14 md:px-x8">
        <RecommendedIssues member={member} pending={me.isPending} />
      </div>
    </>
  );
}
