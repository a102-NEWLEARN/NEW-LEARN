import { useEffect, useRef } from "react";
import { enterAt } from "@/components/motion/screenMotion";
import { prefersReducedMotion } from "@/lib/motion";

// 랜딩 첫 화면 뒤에 까는 노드 그물 — 프로토타입 v21 LandingHeroMap (2026-11-12, Jira 32).
// 1440 × 720 판에 5줄 × 9칸 격자를 흩뜨려 노드를 놓고 가까운 것끼리 잇는다. 가운데는 흐리게 가려 글을 가리지 않는다.
// 열면 선이 900ms 로 그려지고 노드가 520ms 로 튀어나온다(차례로). 노드는 몇 px 씩 떠다니고, 1.6초부터 민트 점 셋이
// 2.4초마다 다른 선을 따라 달리며 그 선과 끝 노드를 밝힌다. 동작 줄이기를 켜면 다 그린 멈춘 그림이다.
// 장식이라 화면 읽기에서 빼고 누를 수 없다. 움직이는 방식은 홈 배경(HomeHeroBackground)과 같다

type Point = readonly [number, number];

/** 노드 자리 — 프로토타입과 같은 씨앗(7)의 난수로 격자를 흩뜨린다. 몇 칸은 비운다 */
const NODES: readonly Point[] = (() => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const points: Point[] = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 9; col++) {
      if (random() < 0.18) continue;
      points.push([
        40 + col * 170 + (random() - 0.5) * 110 + (row % 2) * 60,
        60 + row * 150 + (random() - 0.5) * 90,
      ]);
    }
  return points;
})();

/** 노드마다 뒤 번호 노드 가운데 가장 가까운 둘을, 250 안쪽일 때만 잇는다 */
const LINKS = NODES.flatMap(([ax, ay], i) =>
  NODES.map(([bx, by], j) => [j, Math.hypot(ax - bx, ay - by)] as const)
    .filter(([j]) => j > i)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .filter(([, distance]) => distance < 250)
    .map(([j]) => [i, j] as const),
);

/** 민트로 칠하는 노드 — 여섯에 하나 */
const isAccent = (i: number) => i % 6 === 2;
const nodeSize = (i: number) => (isAccent(i) ? 11 : 8);

/** 가운데(글 자리)는 거의 투명하게, 가장자리로 갈수록 보이게 가린다 */
const MASK =
  "radial-gradient(ellipse 52% 60% at 50% 50%, rgba(0,0,0,.08) 0%, rgba(0,0,0,.08) 40%, rgba(0,0,0,.85) 95%)";

/** 노드가 떠다니는 자리 — 가로 9 · 세로 8 안에서, 노드마다 다른 주기(14 ~ 33초)로 */
function drift(i: number, seconds: number): Point {
  const [x, y] = NODES[i];
  const turn = seconds * 2 * Math.PI;
  return [
    x + 9 * Math.sin(turn / (14 + (i % 5) * 3) + i),
    y + 8 * Math.cos(turn / (17 + (i % 4) * 4) + i * 1.7),
  ];
}

// 달리는 점 — 1.6초부터 2.4초에 한 선씩, 세 점이 서로 엇갈려 달린다
const PULSE_START = 1.6;
const PULSE_SPAN = 2.4;
const PULSE_OFFSETS = [0, 0.37, 0.71];

/** 그 시각의 점마다 달리는 선과 그 선의 몇 % 자리인지 */
function pulsesAt(seconds: number) {
  if (seconds < PULSE_START || LINKS.length === 0) return [];
  return PULSE_OFFSETS.map((offset, n) => {
    const u = (seconds - PULSE_START) / PULSE_SPAN + offset;
    const lap = Math.floor(u);
    return { link: LINKS[(lap * 7 + n * 11) % LINKS.length], at: u - lap };
  });
}

/** 한 장에 30번(33ms)만 고친다 — 프로토타입과 같다 */
const FRAME_MS = 33;

export function LandingHeroMap() {
  const svgRef = useRef<SVGSVGElement>(null);

  // 노드 · 선 · 점의 좌표를 React 를 거치지 않고 바로 고친다. 화면에 보일 때만 움직인다.
  // 보이는지 알 수 없는 곳(오래된 브라우저 · 시험의 jsdom)과 동작 줄이기에서는 멈춘 그림이다
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
    const dots = svg.querySelectorAll<SVGGElement>("[data-pulse]");
    let frame: number | null = null;
    let start: number | null = null;
    let last = -Infinity;

    const tick = (now: number) => {
      start ??= now;
      if (now - last >= FRAME_MS) {
        last = now;
        const seconds = (now - start) / 1000;
        const points = NODES.map((_, i) => drift(i, seconds));
        const running = pulsesAt(seconds);
        const hot = new Set<number>();
        running.forEach(({ link, at }) => {
          if (at > 0.8) hot.add(link[1]);
          if (at < 0.15) hot.add(link[0]);
        });
        points.forEach(([x, y], i) => {
          const half = nodeSize(i) / 2;
          rects[i]?.setAttribute("x", String(x - half));
          rects[i]?.setAttribute("y", String(y - half));
          rects[i]?.setAttribute("data-hot", String(hot.has(i)));
        });
        LINKS.forEach(([a, b], k) => {
          const line = lines[k];
          if (!line) return;
          line.setAttribute("x1", String(points[a][0]));
          line.setAttribute("y1", String(points[a][1]));
          line.setAttribute("x2", String(points[b][0]));
          line.setAttribute("y2", String(points[b][1]));
          line.dataset.on = String(
            running.some(({ link }) => link[0] === a && link[1] === b),
          );
        });
        dots.forEach((dot, n) => {
          const pulse = running[n];
          if (!pulse) return;
          const [a, b] = pulse.link;
          const x = points[a][0] + (points[b][0] - points[a][0]) * pulse.at;
          const y = points[a][1] + (points[b][1] - points[a][1]) * pulse.at;
          dot.setAttribute("opacity", String(Math.sin(Math.PI * pulse.at)));
          dot.querySelectorAll("circle").forEach((circle) => {
            circle.setAttribute("cx", String(x));
            circle.setAttribute("cy", String(y));
          });
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
      viewBox="0 0 1440 720"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
      style={{ maskImage: MASK, WebkitMaskImage: MASK }}
    >
      {LINKS.map(([a, b], n) => (
        <line
          key={`${a}-${b}`}
          x1={points[a][0]}
          y1={points[a][1]}
          x2={points[b][0]}
          y2={points[b][1]}
          pathLength={1}
          data-on="false"
          className="stroke-stroke-neutral-weak [stroke-width:1.2] transition-[stroke] duration-300 data-[on=true]:stroke-stroke-brand-weak data-[on=true]:[stroke-width:1.6] motion-safe:animate-[newlearn-draw_900ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]"
          style={enterAt(200 + n * 22)}
        />
      ))}
      {PULSE_OFFSETS.map((offset) => (
        <g key={offset} data-pulse opacity={0}>
          <circle r={9} className="fill-bg-brand-accent" opacity={0.18} />
          <circle r={3.6} className="fill-bg-brand-accent" />
        </g>
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
            rx={3}
            data-hot="false"
            className={`origin-center [stroke-width:1.3] [transform-box:fill-box] transition-[fill,stroke] duration-300 data-[hot=true]:fill-bg-brand-accent data-[hot=true]:stroke-bg-brand-accent data-[hot=true]:[fill-opacity:0.55] motion-safe:animate-[newlearn-spring-in_520ms_cubic-bezier(0.2,0.8,0.2,1)_backwards] ${
              isAccent(i)
                ? "fill-bg-brand-weak stroke-stroke-brand-weak"
                : "fill-bg-layer-default stroke-stroke-neutral-weak"
            }`}
            style={enterAt(120 + i * 28)}
          />
        );
      })}
    </svg>
  );
}
