import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 화면 안내(코치마크) — 처음 들어온 화면에서 어두운 막 위에 주요 기능을 한꺼번에 가리킨다.
// 대상 둘레를 점선 알약으로 비우고, 옆 설명에서 휘어진 점선 화살표가 대상을 가리킨다.
// 대상은 화면이 붙인 data-coach(또는 가입 가이드의 data-tour) 값으로 찾는다. 화면에 안 보이는 대상은 건너뛰고,
// 하나도 없으면 띄우지 않는다. 「다시 보지 않기」는 이 브라우저에 기억하고, 알겠어요 · Esc · 막 누르기는 이번만 닫는다

type Side = "top" | "bottom" | "left" | "right";

export type CoachMark = {
  target: string;
  title: string;
  body: string;
  /** 설명을 둘 쪽. 없으면 대상이 화면 위쪽이면 아래, 아래쪽이면 위 */
  side?: Side;
  /** 위 · 아래 설명일 때 화살표가 가리킬 가로 자리(대상 왼쪽 0 ~ 오른쪽 1). 넓은 대상의 한쪽을 가리킬 때 쓴다 */
  at?: number;
};

type Point = [number, number];
type Placed = CoachMark & {
  hole: DOMRect;
  side: Side;
  head: Point;
  tail: Point;
  /** 설명을 화살표 꼬리의 왼쪽으로 펼친다(오른쪽 맞춤) */
  toLeft: boolean;
};

const PAD = 6;
const GAP = 64;
const EDGE = 16;
const LABEL_MAX = 240;

const keyOf = (id: string) => `newlearn.coach.${id}`;

function seen(id: string) {
  try {
    return window.localStorage.getItem(keyOf(id)) === "done";
  } catch {
    return false;
  }
}

function remember(id: string) {
  try {
    window.localStorage.setItem(keyOf(id), "done");
  } catch {
    // 기억하지 못해도 이번에는 닫힌다
  }
}

// 같은 값이 여럿이면(탭마다 · 넓은/좁은 화면마다) 화면에 보이는 첫 것
function find(target: string) {
  const vh = window.innerHeight;
  return [
    ...document.querySelectorAll(
      `[data-coach="${target}"], [data-tour="${target}"]`,
    ),
  ]
    .map((el) => el.getBoundingClientRect())
    .find((b) => b.width > 0 && b.bottom > 0 && b.top < vh);
}

function place(marks: CoachMark[]): Placed[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return marks.flatMap((m) => {
    const r = find(m.target);
    if (!r) return [];
    let side: Side =
      m.side ?? (r.top + r.height / 2 < vh / 2 ? "bottom" : "top");
    // 자리가 모자라면 위 · 아래로 돌린다(좁은 화면)
    if (side === "right" && r.right + GAP + 180 > vw) side = "bottom";
    if (side === "left" && r.left - GAP - 180 < 0) side = "bottom";
    if (side === "bottom" && r.bottom + GAP + 90 > vh) side = "top";
    if (side === "top" && r.top - GAP - 90 < 0) side = "bottom";

    const x = r.left + r.width * (m.at ?? 0.5);
    const cy = r.top + r.height / 2;
    const toLeft =
      side === "left" || (side !== "right" && x + LABEL_MAX > vw - EDGE);
    const bend = toLeft ? -28 : 28;
    const out = PAD + 6;
    const [head, tail]: [Point, Point] =
      side === "bottom"
        ? [
            [x, r.bottom + out],
            [x + bend, r.bottom + GAP],
          ]
        : side === "top"
          ? [
              [x, r.top - out],
              [x + bend, r.top - GAP],
            ]
          : side === "right"
            ? [
                [r.right + out, cy],
                [r.right + GAP, cy + 22],
              ]
            : [
                [r.left - out, cy],
                [r.left - GAP, cy + 22],
              ];
    return [{ ...m, hole: r, side, head, tail, toLeft }];
  });
}

// 꼬리에서 대상 쪽으로 휘어 들어가는 점선과 화살촉
function arrow({ side, head, tail }: Placed) {
  const vertical = side === "top" || side === "bottom";
  const c: Point = vertical ? [head[0], tail[1]] : [tail[0], head[1]];
  const angle = Math.atan2(head[1] - c[1], head[0] - c[0]);
  const tip = (turn: number): string =>
    `${head[0] - 9 * Math.cos(angle + turn)} ${head[1] - 9 * Math.sin(angle + turn)}`;
  return {
    line: `M${tail[0]} ${tail[1]} Q${c[0]} ${c[1]} ${head[0]} ${head[1]}`,
    tip: `M${tip(0.5)} L${head[0]} ${head[1]} L${tip(-0.5)}`,
  };
}

function labelStyle({ side, tail, toLeft }: Placed, i: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const horizontal = toLeft
    ? { right: Math.max(EDGE, vw - tail[0] - (side === "left" ? 10 : 14)) }
    : { left: Math.max(EDGE, tail[0] + (side === "right" ? 10 : -14)) };
  const vertical =
    side === "bottom"
      ? { top: tail[1] + 8 }
      : side === "top"
        ? { bottom: vh - tail[1] + 8 }
        : { top: tail[1], transform: "translateY(-50%)" };
  return {
    ...horizontal,
    ...vertical,
    maxWidth: LABEL_MAX,
    textAlign: toLeft ? "right" : "left",
    animationDelay: `${120 + i * 90}ms`,
  };
}

const MOTION = `
@keyframes coach-fade { from { opacity: 0 } }
@keyframes coach-pop { from { opacity: 0; scale: .85 } }
.coach-fade { animation: coach-fade .25s ease-out both }
.coach-pop { animation: coach-pop .35s cubic-bezier(.34,1.56,.64,1) both }
@media (prefers-reduced-motion: reduce) { .coach-fade, .coach-pop { animation: none } }
`;

type Props = {
  /** 화면 이름 — 다시 보지 않기를 화면마다 따로 기억한다 */
  id: string;
  marks: CoachMark[];
  /** 화면이 그려진 뒤 띄우기까지 기다리는 시간(ms) */
  delay?: number;
};

export function CoachMarks({ id, marks, delay = 900 }: Props) {
  const [open, setOpen] = useState(() => !seen(id));
  const [placed, setPlaced] = useState<Placed[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);

  // 대상이 늦게 그려질 수 있어(데이터를 받은 뒤) 찾을 때까지 몇 번 더 본다
  useEffect(() => {
    if (!open) return;
    let tries = 0;
    let timer = 0;
    const look = () => {
      const p = place(marks);
      if (p.length > 0 || ++tries > 10) setPlaced(p);
      else timer = window.setTimeout(look, 500);
    };
    timer = window.setTimeout(look, delay);
    const again = () => setPlaced(place(marks));
    window.addEventListener("resize", again);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", again);
    };
  }, [open, marks, delay]);

  const shown = open && placed.length > 0;

  useEffect(() => {
    if (!shown) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown) return null;

  const close = () => setOpen(false);
  const never = () => {
    remember(id);
    setOpen(false);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="화면 안내"
      className="coach-fade fixed inset-0 z-[100]"
    >
      <style>{MOTION}</style>
      <svg aria-hidden className="absolute inset-0 size-full" onClick={close}>
        <defs>
          <mask id={`coach-${id}`}>
            <rect width="100%" height="100%" fill="white" />
            {placed.map(({ target, hole: r }) => (
              <rect
                key={target}
                x={r.left - PAD}
                y={r.top - PAD}
                width={r.width + PAD * 2}
                height={r.height + PAD * 2}
                rx={Math.min(r.height / 2 + PAD, 22)}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(20,22,24,0.74)"
          mask={`url(#coach-${id})`}
        />
        {placed.map((p, i) => {
          const r = p.hole;
          const { line, tip } = arrow(p);
          const box = {
            x: r.left - PAD,
            y: r.top - PAD,
            width: r.width + PAD * 2,
            height: r.height + PAD * 2,
            rx: Math.min(r.height / 2 + PAD, 22),
          };
          return (
            <g
              key={p.target}
              className="coach-pop"
              style={{
                animationDelay: `${i * 90}ms`,
                transformOrigin: `${p.head[0]}px ${p.head[1]}px`,
              }}
              fill="none"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect {...box} strokeOpacity={0.22} strokeWidth={8} />
              <rect {...box} strokeWidth={2} strokeDasharray="5 6" />
              <path d={line} strokeWidth={2} strokeDasharray="2 7" />
              <path d={tip} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      {placed.map((p, i) => (
        <div
          key={p.target}
          className="coach-pop pointer-events-none absolute text-white"
          style={labelStyle(p, i)}
        >
          <p className="t5-bold">{p.title}</p>
          <p className="t3-regular mt-x0_5 text-white/80">{p.body}</p>
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-[max(32px,env(safe-area-inset-bottom))] flex items-center justify-center gap-x3">
        <button
          type="button"
          onClick={never}
          className="t4-medium flex h-x10 items-center gap-x1_5 rounded-full px-x4 text-white/85 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          <span
            aria-hidden
            className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-white/70 text-[11px] leading-none"
          >
            ✓
          </span>
          다시 보지 않기
        </button>
        <button
          ref={okRef}
          type="button"
          onClick={close}
          className="t4-bold h-x10 rounded-full bg-white px-x6 text-fg-neutral shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          알겠어요
        </button>
      </div>
    </div>,
    document.body,
  );
}
