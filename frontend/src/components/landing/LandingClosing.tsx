import { IconArrowRightLine } from "@karrotmarket/react-monochrome-icon";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { scrollBehavior } from "@/components/landing/LandingHeader";
import { Reveal } from "@/components/landing/Reveal";
import { Logo } from "@/components/Logo";

type LandingClosingProps = {
  /** *서비스 시작하기* 가 갈 곳 */
  start: string;
};

// 마지막 권유 (프로토타입 v21). 프로토타입의 「대표 이슈 n개의 사건 흐름과 달라진 내용」은
// 숫자가 금방 낡고 「달라진 내용」(F10)은 MVP 밖이라 말을 바꿨다
export function LandingClosing({ start }: LandingClosingProps) {
  return (
    <section aria-labelledby="landing-closing" className="bg-bg-brand-weak">
      <div className="mx-auto max-w-[1120px] px-[clamp(24px,3vw,32px)] py-[clamp(96px,11vw,144px)] text-center">
        <Reveal>
          <h2
            id="landing-closing"
            className="text-[clamp(28px,5.6vw,72px)] leading-[1.18] max-md:leading-[1.25] font-extrabold tracking-[-0.045em] text-fg-neutral"
          >
            뉴스를 읽는 서비스를 넘어, <br />
            <span className="text-fg-brand">뉴스를 이해하는 경험</span>
            으로.
          </h2>
          <p className="mx-auto mt-[24px] max-w-[520px] text-[18px] max-md:text-balance max-md:text-[15px] leading-[1.7] text-fg-neutral-muted">
            이슈마다 사건의 흐름을, 기사마다 네 갈래 정리를 바로 볼 수 있어요.
          </p>
          <div className="mt-x10 flex justify-center">
            <ActionButton asChild variant="brandSolid" size="large">
              <Link to={start}>
                서비스 시작하기
                <IconArrowRightLine aria-hidden className="size-[18px]" />
              </Link>
            </ActionButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// 바닥글 — 로고(누르면 맨 위로) · 한 줄 · 약관(준비 중) · 안내 (프로토타입 v21)
export function LandingFooter() {
  return (
    <footer className="border-t border-stroke-neutral-weak bg-bg-layer-default">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-start gap-x8 px-[clamp(24px,3vw,32px)] pt-x8 pb-x10 text-[13px] text-fg-neutral-muted">
        <div className="mr-auto">
          <button
            type="button"
            aria-label="NEW:LEARN 맨 위로"
            onClick={() =>
              window.scrollTo({ top: 0, behavior: scrollBehavior() })
            }
            className="inline-flex rounded-r2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
          >
            <Logo height={22} />
          </button>
          <p className="mt-x3">뉴스를 넘어, 흐름을 읽다.</p>
        </div>
        <div className="flex flex-col gap-[6px]">
          <span className="font-bold text-fg-neutral">약관</span>
          <span>이용약관 (준비 중)</span>
          <span>개인정보처리방침 (준비 중)</span>
        </div>
        <div className="flex flex-col gap-[6px]">
          <span className="font-bold text-fg-neutral">안내</span>
          <span>AI 생성 요약은 언론사 원문과 함께 확인하세요.</span>
          <span>SSAFY 15기 자율 프로젝트 · A102</span>
          <span>© 2026 NEW:LEARN</span>
        </div>
      </div>
    </footer>
  );
}
