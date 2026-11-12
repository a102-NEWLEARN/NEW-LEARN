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

/** 같은 페이지 안의 그 섹션으로 내린다 — 머리에 가리지 않게 머리 높이만큼 덜 */
export function scrollToSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  window.scrollTo({
    top:
      section.getBoundingClientRect().top +
      window.scrollY -
      LANDING_HEADER_HEIGHT,
    behavior: scrollBehavior(),
  });
}

/** 머리 메뉴 — 누르면 그 섹션으로 내린다 (EXPERIENCE.md IA 랜딩) */
const MENU: readonly [id: string, label: string][] = [
  ["how", "어떻게 정리하나요"],
  ["trust", "근거와 신뢰"],
  ["faq", "자주 묻는 질문"],
];

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
      {/* 좁은 화면에서는 숨긴다 — 머리에 다 들어가지 않는다 (프로토타입 v21) */}
      <nav
        aria-label="랜딩 메뉴"
        className="flex items-center gap-x1 max-md:hidden"
      >
        {MENU.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToSection(id)}
            className="h-[36px] rounded-r2 px-x3 text-[14px] font-medium text-fg-neutral-muted transition-colors hover:bg-bg-neutral-weak hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center">
        <ActionButton asChild variant="ghost" size="small">
          <Link to={start}>로그인</Link>
        </ActionButton>
      </div>
    </header>
  );
}
