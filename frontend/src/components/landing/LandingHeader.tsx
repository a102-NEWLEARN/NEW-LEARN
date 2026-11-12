import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { Logo } from "@/components/Logo";
import { prefersReducedMotion } from "@/lib/motion";

/** 머리 높이 — 섹션으로 내릴 때 이만큼 덜 내린다 */
export const LANDING_HEADER_HEIGHT = 64;

/** 랜딩 안에서 부드럽게 옮긴다. 동작 줄이기면 바로 */
export const scrollBehavior = (): ScrollBehavior =>
  prefersReducedMotion() ? "auto" : "smooth";

type LandingHeaderProps = {
  /** *로그인* 이 갈 곳 — 회원이면 홈, 손님이면 로그인 화면 (LandingPage) */
  start: string;
};

// 랜딩 머리 — 위에 붙어 있고, 처음에는 투명하다가 조금이라도 내리면 흰 바탕 · 흐림 · 밑줄이 생긴다 (프로토타입 v21).
// 로고는 셸 로고처럼 누르면 맨 위로 올린다. 같은 주소라 방문 기록은 쌓이지 않는다
export function LandingHeader({ start }: LandingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className={`sticky top-0 z-[5] flex shrink-0 items-center gap-x7 border-b px-[clamp(16px,3vw,32px)] transition-[background-color,border-color] duration-200 ${
        scrolled
          ? "border-stroke-neutral-weak bg-bg-layer-default/90 backdrop-blur-[10px]"
          : "border-transparent bg-transparent"
      }`}
      style={{ height: LANDING_HEADER_HEIGHT }}
    >
      <Link
        to="/"
        aria-label="NEW:LEARN 처음 화면으로"
        onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
        className="rounded-r2 p-x1 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
      >
        <Logo height={26} />
      </Link>
      <div className="ml-auto flex items-center">
        <ActionButton asChild variant="ghost" size="small">
          <Link to={start}>로그인</Link>
        </ActionButton>
      </div>
    </header>
  );
}
