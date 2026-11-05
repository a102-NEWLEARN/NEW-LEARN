import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { meQuery } from "@/api/members";
import { Logo } from "@/components/Logo";
import { FollowCursor } from "@/components/motion/FollowCursor";
import { GreetingIntro } from "@/components/motion/GreetingIntro";
import { loginPath } from "@/lib/login-path";
import { prefersReducedMotion } from "@/lib/motion";

/** 첫 화면 글이 떠오르는 모양. 몇 번째인지에 따라 animationDelay 를 늦춘다 */
const RISE =
  "motion-safe:animate-[newlearn-rise_600ms_var(--seed-timing-function-enter)_both]";

// 랜딩 — 셸 없이 전체 화면으로 뜬다 (EXPERIENCE.md Information Architecture).
// 프로토타입 v21 의 상단과 첫 화면만 둔다. 소개 메뉴(주요 기능 · 근거와 신뢰 · 자주 묻는 질문)는 아직 없다.
// 열면 인사 문구가 지나간 뒤 첫 화면 글이 차례로 떠오른다 (does.kr 채용 화면 참고)
export function LandingPage() {
  // A17 — 회원이면 홈으로 바로 간다. 손님이거나 아직 모르면 로그인 화면으로 보내고,
  // 응답 전에 누른 회원은 로그인 화면이 홈으로 돌려보낸다 (EXPERIENCE.md 이동 규칙)
  const me = useQuery(meQuery);
  const start = me.data ? "/home" : loginPath("/home");
  const [intro, setIntro] = useState(() => !prefersReducedMotion());
  const [revealed, setRevealed] = useState(false);
  // 인사 막이 걷히기 시작하면 첫 화면 글을 띄운다. i 번째는 i × 120ms 늦게
  const rise = (i: number) =>
    revealed
      ? { className: RISE, style: { animationDelay: `${i * 120}ms` } }
      : {};

  return (
    <div className="flex min-h-dvh flex-col bg-bg-layer-default">
      {intro && (
        <GreetingIntro
          eyebrow="NEW:LEARN"
          title="안녕하세요!"
          onLift={() => setRevealed(true)}
          onDone={() => setIntro(false)}
        />
      )}
      <FollowCursor />
      <header className="flex h-[60px] shrink-0 items-center gap-x2 border-b border-stroke-neutral-weak px-x4 md:px-x8">
        {/* 셸 로고처럼 누르면 맨 위로 올린다. 같은 주소라 방문 기록은 쌓이지 않는다 */}
        <Link
          to="/"
          aria-label="NEW:LEARN 처음 화면으로"
          onClick={() => window.scrollTo({ top: 0 })}
          className="rounded-r2 p-x1 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <Logo height={26} />
        </Link>
        <div className="ml-auto flex items-center gap-x1">
          <ActionButton asChild variant="ghost" size="small">
            <Link to={start}>로그인</Link>
          </ActionButton>
          {/* 좁은 화면에서는 상단에 다 들어가지 않는다. 바로 아래 첫 화면에 같은 버튼이 있다 */}
          <ActionButton
            asChild
            variant="brandSolid"
            size="small"
            className="max-sm:hidden"
          >
            <Link to={start}>서비스 시작하기</Link>
          </ActionButton>
        </div>
      </header>
      <main className="flex flex-1 items-center">
        {/* 콘텐츠 화면 최대 너비 1040px (DESIGN.md Layout & Spacing) */}
        <div className="mx-auto grid w-full max-w-[1040px] items-center gap-x10 px-x4 py-x12 md:grid-cols-2 md:px-x8 md:py-x16">
          <div>
            <div {...rise(0)}>
              <p className="t4-bold text-fg-brand">뉴스를 넘어, 흐름을 읽다.</p>
            </div>
            <div {...rise(1)}>
              <h1 className="t11-bold md:t14-bold mt-x3 text-fg-neutral">
                기사는 많아도, <br />
                이슈는 한 흐름으로.
              </h1>
            </div>
            <div {...rise(2)}>
              <p className="t5-regular mt-x4 text-fg-neutral-muted">
                같은 사건을 다룬 기사는 하나로 묶고,{" "}
                <br className="max-sm:hidden" />
                시간에 따라 달라진 내용은 원문 근거와 함께 보여줘요.
              </p>
            </div>
            <div {...rise(3)}>
              <ActionButton
                asChild
                variant="brandSolid"
                size="large"
                className="mt-x8"
              >
                <Link to={start}>서비스 시작하기</Link>
              </ActionButton>
            </div>
          </div>
          <div {...rise(4)}>
            <HeroTimeline />
          </div>
        </div>
      </main>
    </div>
  );
}

// 첫 화면 그림 — 이슈 에볼루션 맵의 타임라인을 줄인 장식이다. 선 · 노드 모양은 Timeline.tsx 와 같다.
// 라임은 랜딩의 아주 작은 포인트에만 쓴다 (DESIGN.md Colors)
const NODES = [
  { x: 48, r: 6, main: false },
  { x: 112, r: 9, main: true },
  { x: 176, r: 6, main: false },
  { x: 240, r: 11, main: true },
  { x: 300, r: 6, main: false },
  { x: 352, r: 9, main: true },
];
const RAIL_Y = 150;
// 사건 카드 — 위 · 아래로 번갈아 단다
const CARDS = [
  { x: 60, y: 40, nodeX: 112 },
  { x: 188, y: 196, nodeX: 240 },
  { x: 272, y: 40, nodeX: 352 },
];

function HeroTimeline() {
  return (
    <svg
      viewBox="0 0 400 260"
      aria-hidden
      className="mx-auto block w-full max-w-[440px]"
    >
      <line
        x1={24}
        y1={RAIL_Y}
        x2={376}
        y2={RAIL_Y}
        strokeWidth={2}
        className="stroke-stroke-brand-weak"
      />
      {CARDS.map(({ x, y, nodeX }) => {
        const above = y < RAIL_Y;
        return (
          <g key={nodeX}>
            <line
              x1={nodeX}
              y1={above ? y + 44 : RAIL_Y}
              x2={nodeX}
              y2={above ? RAIL_Y : y}
              className="stroke-stroke-neutral-weak"
            />
            <rect
              x={x}
              y={y}
              width={104}
              height={44}
              rx={12}
              className="fill-bg-layer-default stroke-stroke-neutral-weak"
            />
            <rect
              x={x + 12}
              y={y + 12}
              width={64}
              height={8}
              rx={4}
              className="fill-bg-neutral-weak"
            />
            <rect
              x={x + 12}
              y={y + 26}
              width={40}
              height={6}
              rx={3}
              className="fill-bg-neutral-weak"
            />
          </g>
        );
      })}
      {NODES.map(({ x, r, main }) => (
        <rect
          key={x}
          x={x - r}
          y={RAIL_Y - r}
          width={2 * r}
          height={2 * r}
          rx={3}
          strokeWidth={main ? 3 : 2}
          className={
            main
              ? "fill-bg-brand-accent stroke-palette-static-white"
              : "fill-palette-static-white stroke-palette-gray-600"
          }
        />
      ))}
      {/* 가장 최근 사건 카드의 새 소식 점 */}
      <circle cx={368} cy={48} r={5} className="fill-bg-accent-lime" />
    </svg>
  );
}
