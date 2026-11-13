import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/api/members";
import { FaqSection } from "@/components/landing/FaqSection";
import { HeadlineMarquee } from "@/components/landing/HeadlineMarquee";
import { HowSection } from "@/components/landing/HowSection";
import { IssueChartSection } from "@/components/landing/IssueChartSection";
import {
  LandingClosing,
  LandingFooter,
} from "@/components/landing/LandingClosing";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { TrustSection } from "@/components/landing/TrustSection";
import { FollowCursor } from "@/components/motion/FollowCursor";

// 랜딩 — 셸 없이 전체 화면으로 뜬다 (EXPERIENCE.md Information Architecture).
// 프로토타입 v21 LandingScreen 을 옮긴다(2026-11-12 사용자, Jira 32 — 계획 docs/plans/nested-hugging-peacock.md).
// 예시 데이터는 운영 데이터로 만든 고정 예시다(components/landing/landingSample.ts). 랜딩은 API 를 새로 부르지 않는다
export function LandingPage() {
  // A17 — 회원이면 홈으로 바로 간다. 손님이거나 아직 모르면 로그인 화면으로 보내고,
  // 응답 전에 누른 회원은 로그인 화면이 홈으로 돌려보낸다 (EXPERIENCE.md 이동 규칙).
  // 돌아올 곳(next)을 붙이지 않는다 — 로그인 화면의 닫기가 랜딩으로 오고, 로그인 · 로그인 없이 시작하기는 홈이다 (Jira 205)
  const me = useQuery(meQuery);
  const start = me.data ? "/home" : "/login";

  return (
    <div className="min-h-dvh bg-bg-layer-default">
      <FollowCursor />
      <LandingHeader start={start} />
      <main>
        <LandingHero start={start} />
        <HeadlineMarquee />
        <IssueChartSection />
        <HowSection />
        <TrustSection />
        <FaqSection />
        <LandingClosing start={start} />
      </main>
      <LandingFooter />
    </div>
  );
}
