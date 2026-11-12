import { useEffect, useRef } from "react";
import type { BranchType } from "@/api/mindmap";
import { BRANCHES } from "@/components/article/branches";
import {
  SAMPLE_ARTICLE,
  SAMPLE_BRANCHES,
} from "@/components/landing/landingSample";
import { PreviewDetail } from "@/components/landing/PreviewDetail";
import { useCycle } from "@/components/landing/useCycle";
import { enterAt } from "@/components/motion/screenMotion";
import { prefersReducedMotion } from "@/lib/motion";

// 판 720 × 400, 가운데 (360, 190) — 프로토타입 v21 LandingMindmapHero
const W = 720;
const H = 400;
const CX = 360;
const CY = 190;
/** 강조한 잎이 바뀌는 간격 */
const CYCLE_MS = 2800;
/** 가지 방향(도) — 앱 마인드맵과 같은 자리: 핵심 오른쪽 위 · 원인 왼쪽 위 · 반응 오른쪽 아래 · 전망 왼쪽 아래 */
const ANGLE: Record<BranchType, number> = {
  CORE: -32,
  CAUSE: -148,
  REACTION: 32,
  OUTLOOK: 148,
};

type Spot = { x: number; y: number };

const BRANCH_SPOTS = SAMPLE_BRANCHES.map((branch) => {
  const a = (ANGLE[branch.type] * Math.PI) / 180;
  return { a, x: CX + Math.cos(a) * 150, y: CY + Math.sin(a) * 100 };
});
const LEAVES = SAMPLE_BRANCHES.flatMap((branch, b) =>
  branch.items.map((text, j) => {
    const a = BRANCH_SPOTS[b].a + (j - (branch.items.length - 1) / 2) * 0.36;
    return {
      branch: branch.type,
      text,
      b,
      x: CX + Math.cos(a) * 230,
      y: CY + Math.sin(a) * 158,
    };
  }),
);

/** 잎 글은 11자에서 줄인다 (프로토타입) */
const cut = (text: string, n = 11) =>
  [...text].length > n ? `${[...text].slice(0, n - 1).join("")}…` : text;

/** 노드가 떠다니는 자리 — 가운데 2 · 가지 4 · 잎 6 안에서 */
function drift({ x, y }: Spot, i: number, amp: number, seconds: number) {
  const turn = seconds * 2 * Math.PI;
  return {
    x: x + amp * Math.sin(turn / (9 + (i % 4) * 2) + i),
    y: y + amp * Math.cos(turn / (11 + (i % 3) * 3) + i * 1.3),
  };
}

/** 글 둘레 흰 테 — 선 위에 놓여도 읽히게 */
const HALO = {
  paintOrder: "stroke",
  stroke: "var(--color-bg-layer-default)",
  strokeWidth: 5,
  strokeLinejoin: "round",
} as const;

const DRAW =
  "motion-safe:animate-[newlearn-draw_900ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
const POP =
  "origin-center [transform-box:fill-box] motion-safe:animate-[newlearn-spring-in_520ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]";
const FADE =
  "motion-safe:animate-[newlearn-fade-in_400ms_var(--seed-timing-function-enter)_backwards]";

// 마인드맵 미리보기 — 가운데 기사 제목에서 가지 넷 · 잎이 차례로 그려지고, 노드는 몇 px 씩 떠다닌다.
// 2.8초마다 강조한 잎이 바뀌고 아래에 그 잎을 보인다. 잎에 마우스를 올리면 멈춘다 (프로토타입 v21 LandingMindmapHero).
// 떠다니는 좌표는 React 밖에서 바로 고친다(랜딩 노드 그물과 같은 방식). 동작 줄이기면 멈춘 그림이고 저절로 바뀌지 않는다
export function MindmapPreview() {
  const { active, hold, release } = useCycle(LEAVES.length, CYCLE_MS);
  const current = LEAVES[active];
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || prefersReducedMotion()) return;
    const root = svg.querySelector<SVGGElement>("[data-root]");
    const branches = svg.querySelectorAll<SVGGElement>("[data-branch]");
    const leaves = svg.querySelectorAll<SVGGElement>("[data-leaf]");
    const rootLines = svg.querySelectorAll<SVGLineElement>("[data-root-line]");
    const leafLines = svg.querySelectorAll<SVGLineElement>("[data-leaf-line]");
    let frame: number | null = null;
    let start: number | null = null;
    let last = -Infinity;

    const place = (node: Element | null, { x, y }: Spot) =>
      node?.setAttribute("transform", `translate(${x},${y})`);
    const tick = (now: number) => {
      start ??= now;
      if (now - last >= 33) {
        last = now;
        const seconds = (now - start) / 1000;
        const r = drift({ x: CX, y: CY }, 0, 2, seconds);
        const b = BRANCH_SPOTS.map((spot, i) => drift(spot, i + 1, 4, seconds));
        const l = LEAVES.map((leaf, i) => drift(leaf, i + 7, 6, seconds));
        place(root, r);
        b.forEach((spot, i) => place(branches[i], spot));
        l.forEach((spot, i) => place(leaves[i], spot));
        b.forEach((spot, i) => {
          rootLines[i]?.setAttribute("x1", String(r.x));
          rootLines[i]?.setAttribute("y1", String(r.y));
          rootLines[i]?.setAttribute("x2", String(spot.x));
          rootLines[i]?.setAttribute("y2", String(spot.y));
        });
        l.forEach((spot, i) => {
          const from = b[LEAVES[i].b];
          leafLines[i]?.setAttribute("x1", String(from.x));
          leafLines[i]?.setAttribute("y1", String(from.y));
          leafLines[i]?.setAttribute("x2", String(spot.x));
          leafLines[i]?.setAttribute("y2", String(spot.y));
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="pt-x1">
      <div className="flex items-center gap-x2 text-[13px]">
        <span className="font-bold text-fg-neutral">기사 마인드맵</span>
        <span className="min-w-0 truncate text-fg-neutral-muted">
          {SAMPLE_ARTICLE.publisher} · {SAMPLE_ARTICLE.title}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${SAMPLE_ARTICLE.title} 기사를 네 갈래로 나눈 마인드맵 미리보기`}
        className="mt-x1 block w-full"
        onMouseLeave={release}
      >
        {BRANCH_SPOTS.map((spot, i) => {
          const tone = BRANCHES[SAMPLE_BRANCHES[i].type].tone;
          const on = current.b === i;
          return (
            <line
              key={`r${i}`}
              data-root-line
              x1={CX}
              y1={CY}
              x2={spot.x}
              y2={spot.y}
              pathLength={1}
              strokeWidth={on ? 3 : 2.4}
              className={`transition-[stroke] duration-300 ${on ? tone.stroke : tone.line} ${DRAW}`}
              style={enterAt(260 + i * 140)}
            />
          );
        })}
        {LEAVES.map((leaf, i) => {
          const tone = BRANCHES[leaf.branch].tone;
          const on = i === active;
          return (
            <line
              key={`l${i}`}
              data-leaf-line
              x1={BRANCH_SPOTS[leaf.b].x}
              y1={BRANCH_SPOTS[leaf.b].y}
              x2={leaf.x}
              y2={leaf.y}
              pathLength={1}
              strokeWidth={on ? 2.4 : 1.6}
              className={`transition-[stroke] duration-300 ${on ? tone.stroke : tone.line} ${DRAW}`}
              style={enterAt(860 + i * 80)}
            />
          );
        })}
        <g data-root transform={`translate(${CX},${CY})`}>
          <g className={POP} style={enterAt(80)}>
            <circle
              r={31}
              strokeWidth={1.5}
              className="fill-bg-layer-default stroke-stroke-neutral-weak"
            />
            <circle r={24} className="fill-bg-brand-accent" />
          </g>
          <text
            y={50}
            textAnchor="middle"
            className={`fill-fg-neutral text-[18px] font-extrabold tracking-[-0.02em] ${FADE}`}
            style={{ ...HALO, ...enterAt(300) }}
          >
            {cut(SAMPLE_ARTICLE.title, 18)}
          </text>
        </g>
        {BRANCH_SPOTS.map((spot, i) => {
          const { name, question, tone } = BRANCHES[SAMPLE_BRANCHES[i].type];
          const on = current.b === i;
          const above = spot.y < CY;
          return (
            <g
              key={`b${i}`}
              data-branch
              transform={`translate(${spot.x},${spot.y})`}
            >
              <g className={POP} style={enterAt(380 + i * 140)}>
                <circle
                  r={on ? 21 : 18}
                  className={`transition-opacity duration-300 ${tone.fill} ${on ? "opacity-100" : "opacity-0"}`}
                />
                <circle
                  r={14}
                  strokeWidth={2.5}
                  className={`${tone.fill} ${tone.stroke}`}
                />
              </g>
              <g className={FADE} style={enterAt(520 + i * 140)}>
                <text
                  y={above ? -38 : 40}
                  textAnchor="middle"
                  className="fill-fg-neutral text-[17px] font-extrabold"
                  style={HALO}
                >
                  {name}
                </text>
                <text
                  y={above ? -21 : 57}
                  textAnchor="middle"
                  className={`text-[13.5px] font-semibold ${tone.text}`}
                  style={HALO}
                >
                  {question}
                </text>
              </g>
            </g>
          );
        })}
        {LEAVES.map((leaf, i) => {
          const tone = BRANCHES[leaf.branch].tone;
          const on = i === active;
          const left = leaf.x < CX;
          return (
            <g
              key={`f${i}`}
              data-leaf
              transform={`translate(${leaf.x},${leaf.y})`}
              className="cursor-pointer"
              onMouseEnter={() => hold(i)}
            >
              <g className={POP} style={enterAt(960 + i * 80)}>
                <circle r={16} className="fill-transparent" />
                <circle
                  r={13}
                  className={`transition-opacity duration-300 ${tone.fill} ${on ? "opacity-95" : "opacity-0"}`}
                />
                <circle
                  r={7}
                  strokeWidth={2.2}
                  strokeDasharray={
                    leaf.branch === "OUTLOOK" ? "3 2.4" : undefined
                  }
                  className={`transition-[fill] duration-300 ${tone.stroke} ${on ? tone.solid : "fill-bg-layer-default"}`}
                />
              </g>
              <text
                x={left ? -14 : 14}
                y={5}
                textAnchor={left ? "end" : "start"}
                className={`text-[14.5px] transition-[fill] duration-300 ${
                  on
                    ? "fill-fg-neutral font-bold"
                    : "fill-fg-neutral-muted font-medium"
                } ${FADE}`}
                style={{ ...HALO, ...enterAt(1080 + i * 80) }}
              >
                {cut(leaf.text)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-x1 min-h-[72px]">
        <PreviewDetail
          key={active}
          branch={current.branch}
          text={current.text}
        />
      </div>
    </div>
  );
}
