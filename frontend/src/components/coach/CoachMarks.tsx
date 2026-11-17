import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 화면 안내(코치마크) — 처음 들어온 화면에서 어두운 막 위에 주요 기능을 한꺼번에 가리킨다.
// 대상 둘레를 점선 알약으로 비우고, 옆 설명에서 휘어진 점선 화살표가 대상을 가리킨다.
// 대상은 화면이 붙인 data-coach 값으로 찾는다. 화면에 안 보이는 대상은 건너뛰고,
// 하나도 없으면 띄우지 않는다. 설명끼리 · 설명과 다른 대상이 겹치지 않게 자리를 고르고, 떠 있는 동안은 화면이 스크롤되지 않는다.
// 「다시 보지 않기」는 이 브라우저에 기억하고, 알겠어요 · Esc · 막 누르기는 이번만 닫는다

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
type Box = { left: number; top: number; right: number; bottom: number };
type Placed = CoachMark & {
  hole: DOMRect;
  side: Side;
  head: Point;
  tail: Point;
  /** 설명을 화살표 꼬리의 왼쪽으로 펼친다(오른쪽 맞춤) */
  toLeft: boolean;
  /** 설명이 차지할 자리 — 화면 끝을 넘지 않게 너비를 줄인다 */
  maxWidth: number;
};

const PAD = 6;
const GAP = 64;
const EDGE = 16;
const LABEL_MAX = 240;
/** 이보다 좁게 접히면 설명이 너무 길어져 다른 자리를 찾는다 */
const LABEL_MIN = 100;
/** 아래쪽 「다시 보지 않기 · 알겠어요」 줄이 차지하는 높이 — 설명이 덮지 않게 비운다 */
const BAR = 96;
/** 설명 · 화살표 · 대상끼리 띄울 간격 */
const SPACE = 10;
/** 겹치면 화살표를 이만큼씩 늘려 다시 본다 */
const STEP = 12;
const MAX_GAP = 260;

const keyOf = (id: string) => `newlearn.coach.${id}`;

function seen(id: string) {
  try {
    return window.localStorage.getItem(keyOf(id)) === "done";
  } catch {
    return false;
  }
}

/** 가입을 마쳤다 — 「다시 보지 않기」로 닫은 화면 안내도 새 회원에게 처음부터 다시 띄운다 (SignupPage, Jira 204) */
export function resetCoachMarks() {
  try {
    const keys = Object.keys(window.localStorage).filter((key) =>
      key.startsWith(keyOf("")),
    );
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // 지우지 못하면 전처럼 닫힌 채로 둔다
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
  return [...document.querySelectorAll(`[data-coach="${target}"]`)]
    .map((el) => el.getBoundingClientRect())
    .find((b) => b.width > 0 && b.bottom > 0 && b.top < vh);
}

// 설명을 실제 글꼴로 한 번 그려 크기를 잰다 — 몇 줄로 접히는지 알아야 겹침을 볼 수 있다
function measure(m: CoachMark, maxWidth: number) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;max-width:${maxWidth}px`;
  const title = document.createElement("p");
  title.className = "t5-bold";
  title.textContent = m.title;
  const body = document.createElement("p");
  body.className = "t3-regular mt-x0_5";
  body.textContent = m.body;
  el.append(title, body);
  document.body.append(el);
  const { width, height } = el.getBoundingClientRect();
  el.remove();
  return { w: width, h: height };
}

const grow = (b: Box, by: number): Box => ({
  left: b.left - by,
  top: b.top - by,
  right: b.right + by,
  bottom: b.bottom + by,
});
const hits = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = ([x, y]: Point, b: Box) =>
  x > b.left && x < b.right && y > b.top && y < b.bottom;

// 화살표가 휘는 자리 — 위 · 아래 설명은 세로로, 옆 설명은 가로로 들어간다
const bendOf = (side: Side, head: Point, tail: Point): Point =>
  side === "top" || side === "bottom" ? [head[0], tail[1]] : [tail[0], head[1]];

// 화살표 곡선 위의 점들 — 겹침은 곡선이 지나는 자리로 본다(곡선을 감싼 네모로 보면 옆 대상에 걸려 빈자리를 놓친다)
function curve(side: Side, head: Point, tail: Point): Point[] {
  const c = bendOf(side, head, tail);
  return Array.from({ length: 13 }, (_, k) => {
    const t = k / 12;
    const u = 1 - t;
    return [
      u * u * tail[0] + 2 * u * t * c[0] + t * t * head[0],
      u * u * tail[1] + 2 * u * t * c[1] + t * t * head[1],
    ];
  });
}

// 한 자리 후보 — 화살표 머리 · 꼬리와 설명이 차지할 상자
function candidate(
  m: CoachMark,
  r: DOMRect,
  side: Side,
  toLeft: boolean,
  gap: number,
  size: (maxWidth: number) => { w: number; h: number },
) {
  const vw = window.innerWidth;
  const x = r.left + r.width * (m.at ?? 0.5);
  const cy = r.top + r.height / 2;
  const bend = toLeft ? -28 : 28;
  const out = PAD + 6;
  const [head, tail]: [Point, Point] =
    side === "bottom"
      ? [
          [x, r.bottom + out],
          [x + bend, r.bottom + gap],
        ]
      : side === "top"
        ? [
            [x, r.top - out],
            [x + bend, r.top - gap],
          ]
        : side === "right"
          ? [
              [r.right + out, cy],
              [r.right + gap, cy + 22],
            ]
          : [
              [r.left - out, cy],
              [r.left - gap, cy + 22],
            ];
  // 설명이 붙는 가로 자리(오른쪽 맞춤이면 오른쪽 끝, 아니면 왼쪽 끝)
  const anchor = toLeft
    ? Math.min(vw - EDGE, tail[0] + (side === "left" ? 10 : 14))
    : Math.max(EDGE, tail[0] + (side === "right" ? 10 : -14));
  const maxWidth = Math.min(
    LABEL_MAX,
    toLeft ? anchor - EDGE : vw - EDGE - anchor,
  );
  const { w, h } = size(maxWidth);
  const left = toLeft ? anchor - w : anchor;
  const top =
    side === "bottom"
      ? tail[1] + 8
      : side === "top"
        ? tail[1] - 8 - h
        : tail[1] - h / 2;
  const box: Box = { left, top, right: left + w, bottom: top + h };
  return { head, tail, maxWidth, box };
}

// 설명마다 자리를 정한다. 원하는 쪽 → 화살표를 늘려서 → 맞춤을 뒤집어서 → 반대쪽 순으로 보고,
// 화면 밖 · 아래 버튼 줄 · 다른 대상 · 앞서 놓은 설명과 화살표에 닿지 않는 첫 자리를 쓴다
function place(marks: CoachMark[]): Placed[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const found = marks.flatMap((m) => {
    const r = find(m.target);
    return r ? [{ m, r }] : [];
  });
  const holes = found.map(({ r }) => grow(r, PAD));

  const first = found.map(({ m, r }) => {
    let side: Side =
      m.side ?? (r.top + r.height / 2 < vh / 2 ? "bottom" : "top");
    // 자리가 모자라면 위 · 아래로 돌린다(좁은 화면)
    if (side === "right" && r.right + GAP + 180 > vw) side = "bottom";
    if (side === "left" && r.left - GAP - 180 < 0) side = "bottom";
    if (side === "bottom" && r.bottom + GAP + 90 > vh) side = "top";
    if (side === "top" && r.top - GAP - 90 < 0) side = "bottom";
    const x = r.left + r.width * (m.at ?? 0.5);
    // 오른쪽에 설명 하나가 다 들어가지 않고 왼쪽이 더 넓으면 왼쪽으로 펼친다
    const roomRight = vw - EDGE - (x + 14);
    const roomLeft = x - 14 - EDGE;
    const toLeft =
      side === "left" ||
      (side !== "right" && roomRight < LABEL_MAX && roomLeft > roomRight);
    return { m, r, side, toLeft, x };
  });

  // 위 · 아래 설명은 펼치는 쪽 끝에 가까운 것부터 놓는다 — 뒤에 놓는 설명의 화살표가 앞 설명을 가로지르지 않게
  const order = first
    .map((f, i) => ({ ...f, i, key: f.toLeft ? f.x : vw - f.x }))
    .sort((a, b) => a.key - b.key);

  const labels: Box[] = [];
  const arrows: Point[][] = [];
  const out: (Placed | undefined)[] = [];
  for (const { m, r, side, toLeft, i } of order) {
    const cache = new Map<number, { w: number; h: number }>();
    const size = (mw: number) => {
      const key = Math.round(mw);
      if (!cache.has(key)) cache.set(key, measure(m, key));
      return cache.get(key)!;
    };
    const own = holes[i];
    const others = holes.filter((_, j) => j !== i);
    const ok = (
      { head, tail, maxWidth, box }: ReturnType<typeof candidate>,
      s: Side,
    ) => {
      if (maxWidth < LABEL_MIN) return false;
      if (box.top < EDGE || box.bottom > vh - BAR) return false;
      if (box.left < EDGE - 1 || box.right > vw - EDGE + 1) return false;
      const near = grow(box, SPACE);
      const line = curve(s, head, tail);
      if ([own, ...others].some((h) => hits(near, h))) return false;
      if (labels.some((l) => hits(near, l))) return false;
      if (arrows.some((a) => a.some((pt) => inside(pt, near)))) return false;
      const blocked = [...others, ...labels.map((l) => grow(l, SPACE))];
      return !line.some((pt) => blocked.some((b) => inside(pt, b)));
    };

    const sides: Side[] =
      side === "top"
        ? ["top", "bottom"]
        : side === "bottom"
          ? ["bottom", "top"]
          : [side, "bottom", "top"];
    let chosen:
      | (ReturnType<typeof candidate> & { side: Side; toLeft: boolean })
      | undefined;
    search: for (const s of sides) {
      const flips =
        s === "top" || s === "bottom" ? [toLeft, !toLeft] : [s === "left"];
      for (let gap = GAP; gap <= MAX_GAP; gap += STEP) {
        for (const tl of flips) {
          const c = candidate(m, r, s, tl, gap, size);
          if (ok(c, s)) {
            chosen = { ...c, side: s, toLeft: tl };
            break search;
          }
        }
      }
    }
    // 빈자리가 없으면 원래 쪽에 둔다 — 안 보이는 것보다 겹쳐도 보이는 편이 낫다
    chosen ??= { ...candidate(m, r, side, toLeft, GAP, size), side, toLeft };
    labels.push(chosen.box);
    arrows.push(curve(chosen.side, chosen.head, chosen.tail));
    out[i] = {
      ...m,
      hole: r,
      side: chosen.side,
      head: chosen.head,
      tail: chosen.tail,
      toLeft: chosen.toLeft,
      maxWidth: chosen.maxWidth,
    };
  }
  return out.filter((p): p is Placed => p !== undefined);
}

// 꼬리에서 대상 쪽으로 휘어 들어가는 점선과 화살촉
function arrow({ side, head, tail }: Placed) {
  const c = bendOf(side, head, tail);
  const angle = Math.atan2(head[1] - c[1], head[0] - c[0]);
  const tip = (turn: number): string =>
    `${head[0] - 9 * Math.cos(angle + turn)} ${head[1] - 9 * Math.sin(angle + turn)}`;
  return {
    line: `M${tail[0]} ${tail[1]} Q${c[0]} ${c[1]} ${head[0]} ${head[1]}`,
    tip: `M${tip(0.5)} L${head[0]} ${head[1]} L${tip(-0.5)}`,
  };
}

function labelStyle(
  { side, tail, toLeft, maxWidth }: Placed,
  i: number,
): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const horizontal = toLeft
    ? {
        right: Math.max(EDGE, vw - tail[0] - (side === "left" ? 10 : 14)),
      }
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
    maxWidth,
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
  const rootRef = useRef<HTMLDivElement>(null);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) setOpen(false);
      // 창(aria-modal)이라 포커스는 두 버튼 안에서만 돈다 — 막 아래 화면의 링크로 빠져 Enter 가 안 보이는 것을 누르지 않게
      if (e.key !== "Tab") return;
      const buttons = [...(rootRef.current?.querySelectorAll("button") ?? [])];
      if (buttons.length === 0) return;
      e.preventDefault();
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.shiftKey ? -1 : 1;
      const next =
        at < 0
          ? e.shiftKey
            ? buttons.length - 1
            : 0
          : (at + step + buttons.length) % buttons.length;
      buttons[next].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  // 안내가 떠 있는 동안 화면이 움직이지 않게 한다 — 밑의 화면이 스크롤되면 비운 자리와 화살표가 대상에서 어긋난다
  useEffect(() => {
    if (!shown) return;
    const root = rootRef.current;
    const stop = (e: Event) => e.preventDefault();
    root?.addEventListener("wheel", stop, { passive: false });
    root?.addEventListener("touchmove", stop, { passive: false });
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      root?.removeEventListener("wheel", stop);
      root?.removeEventListener("touchmove", stop);
      html.style.overflow = before;
    };
  }, [shown]);

  if (!shown) return null;

  const close = () => setOpen(false);
  const never = () => {
    remember(id);
    setOpen(false);
  };

  return createPortal(
    <div
      ref={rootRef}
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
