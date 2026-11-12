import {
  IconArrowRightLine,
  IconChevronDownLine,
} from "@karrotmarket/react-monochrome-icon";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import {
  LANDING_HEADER_HEIGHT,
  scrollToSection,
} from "@/components/landing/LandingHeader";
import { LandingHeroMap } from "@/components/landing/LandingHeroMap";
import { enterAt } from "@/components/motion/screenMotion";

// 첫 화면 글이 떠오르는 모양 — 10px 아래에서. 길이는 프로토타입 값(im-rise 460 · 560ms)
const RISE_460 =
  "motion-safe:animate-[newlearn-rise-in_460ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
const RISE_560 =
  "motion-safe:animate-[newlearn-rise-in_560ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
/** NEW:LEARN 글자가 줄 아래에서 올라온다 (프로토타입 im-lx-line 760ms) */
const LINE_UP =
  "motion-safe:animate-[newlearn-line-up_760ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";

type LandingHeroProps = {
  /** *서비스 시작하기* 가 갈 곳 */
  start: string;
};

// 랜딩 첫 화면 — 노드 그물 위에 한 줄 소개 · 큰 NEW:LEARN · 설명 · 버튼 (프로토타입 v21, 2026-11-12 Jira 32).
// 머리 밑까지 올라가 그물이 머리 뒤에도 깔린다. 글은 0 · 180 · 400 · 520ms 차례로 떠오르고, 900ms 에 「어떻게 정리하나요」가 나타난다
export function LandingHero({ start }: LandingHeroProps) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        marginTop: -LANDING_HEADER_HEIGHT,
        paddingTop: LANDING_HEADER_HEIGHT,
      }}
    >
      <LandingHeroMap />
      <div
        className="relative z-[1] mx-auto flex max-w-[960px] flex-col items-center justify-center px-[clamp(16px,3vw,32px)] py-[clamp(48px,8vh,96px)] text-center"
        style={{
          minHeight: `min(820px, calc(100svh - ${LANDING_HEADER_HEIGHT}px))`,
        }}
      >
        <p
          className={`text-[clamp(22px,2.6vw,34px)] leading-[1.3] font-bold tracking-[-0.03em] text-fg-neutral ${RISE_460}`}
        >
          뉴스를 넘어, <span className="text-fg-brand">흐름</span>을 읽다
        </p>
        {/* 글자를 한 번에 읽게 이름을 따로 준다 — 안의 글자 조각은 화면 읽기에서 뺀다 */}
        <h1
          aria-label="NEW:LEARN"
          className="mt-[14px] text-[clamp(56px,9vw,128px)] leading-[1.08] font-extrabold tracking-[-0.05em] text-fg-neutral"
        >
          <span className="block overflow-hidden pb-[0.06em]">
            <span
              aria-hidden
              className={`inline-block ${LINE_UP}`}
              style={enterAt(180)}
            >
              NEW<span className="text-fg-brand-accent">:</span>LEARN
            </span>
          </span>
        </h1>
        <p
          className={`mt-[22px] max-w-[560px] text-[clamp(15px,1.3vw,18px)] leading-[1.7] text-fg-neutral-muted ${RISE_560}`}
          style={enterAt(400)}
        >
          흩어진 뉴스를 연결해, 새로운 맥락을 배울 수 있는 뉴스 플랫폼
        </p>
        <div className={`mt-x10 ${RISE_560}`} style={enterAt(520)}>
          <ActionButton asChild variant="brandSolid" size="large">
            <Link to={start}>
              서비스 시작하기
              <IconArrowRightLine aria-hidden className="size-[17px]" />
            </Link>
          </ActionButton>
        </div>
        {/* 아래 「어떻게 정리하나요」로 내린다. 화살표는 1.8초 주기로 까딱인다 (프로토타입 v21 im-hm-bob) */}
        <button
          type="button"
          onClick={() => scrollToSection("how")}
          className="mt-[clamp(40px,8vh,88px)] inline-flex h-[40px] items-center gap-[6px] rounded-r2 px-x3 text-[14px] text-fg-neutral-muted transition-colors hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring motion-safe:animate-[newlearn-fade-in_600ms_var(--seed-timing-function-enter)_backwards]"
          style={enterAt(900)}
        >
          어떻게 정리하나요
          <IconChevronDownLine
            aria-hidden
            className="size-[16px] motion-safe:animate-[newlearn-bob_1.8s_ease-in-out_infinite]"
          />
        </button>
      </div>
    </section>
  );
}
