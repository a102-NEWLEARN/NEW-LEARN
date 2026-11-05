import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

// 홈 첫 화면(인사 · 검색창) 뒤에 까는 마인드맵 모양 배경 — 프로토타입 v21 HomeHeroBg (S15P31A102-168).
// 1200 × 360 판 위의 작은 네모 노드 22개를 가까운 것끼리 잇고, 가운데는 비워 글을 가리지 않는다.
// 노드는 몇 px 씩 천천히 떠다닌다. 동작 줄이기를 켜면 멈춘다 (EXPERIENCE.md Interaction Primitives 「모션」).
// 장식이라 화면 읽기에서 빼고 누를 수 없다

/** 노드 자리 — 프로토타입 값 그대로 */
const NODES: readonly (readonly [number, number])[] = [
  [60, 70],
  [150, 140],
  [90, 250],
  [210, 300],
  [260, 80],
  [330, 190],
  [120, 330],
  [400, 40],
  [380, 300],
  [560, 20],
  [520, 330],
  [640, 340],
  [700, 30],
  [860, 60],
  [930, 170],
  [820, 290],
  [1010, 90],
  [1080, 220],
  [1150, 120],
  [1120, 320],
  [980, 320],
  [1180, 40],
];

/** 브랜드 민트로 칠하는 노드 */
const MINT = new Set([1, 14, 17]);

/** 노드마다 뒤 번호 노드 가운데 가장 가까운 둘을, 220 안쪽일 때만 잇는다 — 같은 선을 두 번 긋지 않게 */
const LINKS = NODES.flatMap(([ax, ay], i) =>
  NODES.map(([bx, by], j) => [j, Math.hypot(ax - bx, ay - by)] as const)
    .filter(([j]) => j > i)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .filter(([, distance]) => distance < 220)
    .map(([j]) => [i, j] as const),
);

/** 가운데(글 자리)는 투명하게, 가장자리로 갈수록 보이게 가린다 */
const MASK =
  "radial-gradient(ellipse 40% 64% at 50% 50%, transparent 0%, transparent 62%, #000 100%)";

/** 노드가 떠다니는 자리 — 가로 7 · 세로 6 안에서, 노드마다 다른 주기(16 ~ 31초)로 */
function drift(i: number, seconds: number): [number, number] {
  const [x, y] = NODES[i];
  const turn = seconds * 2 * Math.PI;
  return [
    x + 7 * Math.sin(turn / (16 + (i % 5) * 3) + i),
    y + 6 * Math.cos(turn / (19 + (i % 4) * 4) + i * 1.7),
  ];
}

const nodeSize = (i: number) => (MINT.has(i) ? 8 : 6);

/** 한 장에 25번(40ms)만 고친다 — 느린 움직임이라 이보다 자주 그릴 까닭이 없다 */
const FRAME_MS = 40;

export function HomeHeroBackground() {
  const svgRef = useRef<SVGSVGElement>(null);

  // 노드 · 선의 좌표를 React 를 거치지 않고 바로 고친다 — 1초에 25번 다시 그리지 않게.
  // 배경이 화면에 보일 때만 움직인다 — 홈을 아래로 내리면 멈춰 쓸데없이 그리지 않는다.
  // 보이는지 알 수 없는 곳(IntersectionObserver 가 없는 오래된 브라우저 · 테스트의 jsdom)에서는 멈춘 그림으로 둔다
  useEffect(() => {
    const svg = svgRef.current;
    if (
      !svg ||
      prefersReducedMotion() ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const rects = svg.querySelectorAll("rect");
    const lines = svg.querySelectorAll("line");
    let frame: number | null = null;
    let start: number | null = null;
    let last = -Infinity;

    const tick = (now: number) => {
      start ??= now;
      if (now - last >= FRAME_MS) {
        last = now;
        const seconds = (now - start) / 1000;
        const points = NODES.map((_, i) => drift(i, seconds));
        points.forEach(([x, y], i) => {
          const half = nodeSize(i) / 2;
          rects[i]?.setAttribute("x", String(x - half));
          rects[i]?.setAttribute("y", String(y - half));
        });
        LINKS.forEach(([a, b], k) => {
          lines[k]?.setAttribute("x1", String(points[a][0]));
          lines[k]?.setAttribute("y1", String(points[a][1]));
          lines[k]?.setAttribute("x2", String(points[b][0]));
          lines[k]?.setAttribute("y2", String(points[b][1]));
        });
      }
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) stop();
      else if (frame === null) frame = requestAnimationFrame(tick);
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
      stop();
    };
  }, []);

  const points = NODES.map((_, i) => drift(i, 0));

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      viewBox="0 0 1200 360"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
      style={{ maskImage: MASK, WebkitMaskImage: MASK }}
    >
      {LINKS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={points[a][0]}
          y1={points[a][1]}
          x2={points[b][0]}
          y2={points[b][1]}
          strokeWidth={1}
          className="stroke-stroke-neutral-subtle"
        />
      ))}
      {points.map(([x, y], i) => {
        const size = nodeSize(i);
        return (
          <rect
            key={i}
            x={x - size / 2}
            y={y - size / 2}
            width={size}
            height={size}
            rx={2}
            strokeWidth={1}
            className={
              MINT.has(i)
                ? "fill-bg-brand-weak stroke-stroke-brand-weak"
                : "fill-bg-layer-default stroke-stroke-neutral-weak"
            }
          />
        );
      })}
    </svg>
  );
}
