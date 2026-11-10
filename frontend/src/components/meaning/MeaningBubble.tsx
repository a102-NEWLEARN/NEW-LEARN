import { useQueryClient } from "@tanstack/react-query";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import {
  type MeaningResult,
  type MeaningTarget,
  meaningQuery,
} from "@/api/dictionary";
import { ApiError } from "@/api/error";
import { AiBadge } from "@/components/AiBadge";
import {
  MEANING_ATTR,
  MEANING_CUT_ATTR,
} from "@/components/meaning/meaningProps";
import { type Picked, pickTerm } from "@/components/meaning/pickTerm";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";
import { errorDescription } from "@/components/state/ErrorState";

// 선택 영역과 말풍선 사이 · 화면 가장자리와의 거리(px)
const GAP = 8;
const EDGE = 8;
// 뜻 카드가 다 커졌을 때의 어림 높이(px) — 「의미」를 띄울 때부터 카드가 들어갈 쪽에 두어, 커지는 동안 선택 영역을 넘어가지 않게
const CARD_RESERVE = 120;
// 터치 · Shift+화살표로 고를 때는 손을 뗀 신호가 없어 선택이 이만큼 멈추면 끝난 것으로 본다
const SETTLE_MS = 300;

// 고른 말이 있는 자리 — 어느 화면의 어느 대상인지, 선택 영역의 화면 위치, 말풍선을 그릴 곳
type Found = {
  picked: Picked;
  type: MeaningTarget;
  id: number;
  rect: DOMRect;
  // 좁은 화면의 사건 시트 안이면 시트 안에 그린다 — 바깥에 그리면 누르는 순간 시트가 「바깥 누르기」로 닫힌다
  container: HTMLElement;
};
type Phase =
  | { kind: "offer" }
  | { kind: "loading" }
  | { kind: "done"; result: MeaningResult }
  | { kind: "failed"; message: string };
type Bubble = Found & { phase: Phase };

const TARGETS: readonly string[] = ["ARTICLE", "ISSUE", "EVENT"];
const isTarget = (value: string): value is MeaningTarget =>
  TARGETS.includes(value);

function hostOf(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(`[${MEANING_ATTR}]`) ?? null;
}

// 지금 선택이 드래그 대상 글 하나 안에 있고 규칙(pickTerm)에 맞으면 그 자리를 준다
function readSelection(): Found | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return null;
  const range = selection.getRangeAt(0);
  const host = hostOf(range.startContainer);
  if (!host || host !== hostOf(range.endContainer)) return null;
  const [type, rawId] = (host.getAttribute(MEANING_ATTR) ?? "").split(":");
  const id = Number(rawId);
  if (!isTarget(type) || !Number.isInteger(id)) return null;
  // 글 안의 몇째 칸부터인가 — 마인드맵 잎처럼 줄(tspan)로 나뉜 글도 이어 붙인 글로 센다
  const before = document.createRange();
  before.selectNodeContents(host);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const picked = pickTerm(
    host.textContent ?? "",
    start,
    start + range.toString().length,
    host.hasAttribute(MEANING_CUT_ATTR),
  );
  if (!picked) return null;
  const sheet = host.closest<HTMLElement>("[data-drawer]");
  return {
    picked,
    type,
    id,
    rect: range.getBoundingClientRect(),
    container: sheet ?? document.body,
  };
}

const sameSpot = (a: Found, b: Found) =>
  a.type === b.type &&
  a.id === b.id &&
  a.picked.term === b.picked.term &&
  a.picked.around === b.picked.around;

// 실패 문구 — docs/api.md 2절. RATE_LIMITED 는 입구(Envoy)가 만들어서 코드가 없어도 429 면 같은 문구다
function failureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "DICTIONARY_UNAVAILABLE") return "지금은 찾을 수 없어요";
    if (error.code === "RATE_LIMITED" || error.status === 429)
      return "요청이 많아요. 잠시 뒤 다시 시도해 주세요";
  }
  return errorDescription(error);
}

// 선택 영역 위 가운데에 둔다. 위에 자리가 없거나 좁은 화면이면 아래 — 폰은 선택 위에 OS 메뉴(복사 · 붙여넣기)가 뜬다
function place(
  { rect, container }: Found,
  size: { width: number; height: number },
  narrow: boolean,
): CSSProperties {
  const { innerWidth: vw, innerHeight: vh } = window;
  const left = Math.min(
    Math.max(EDGE, rect.left + rect.width / 2 - size.width / 2),
    vw - size.width - EDGE,
  );
  const above = rect.top - GAP - size.height;
  const below = rect.bottom + GAP;
  // 쪽은 카드가 다 커진 크기로 정한다 — 위면 아래 끝을, 아래면 위 끝을 선택 영역 옆에 붙인 채 커진다
  const reserve = Math.max(size.height, CARD_RESERVE);
  const roomAbove = rect.top - GAP - reserve >= EDGE;
  const roomBelow = below + reserve <= vh - EDGE;
  const top =
    roomAbove && (!narrow || !roomBelow) ? above : Math.max(EDGE, below);
  if (container === document.body) return { position: "fixed", left, top };
  const box = container.getBoundingClientRect();
  return { position: "absolute", left: left - box.left, top: top - box.top };
}

// F13 용어사전 — 기사 · 이슈 · 사건 화면에서 드래그한 말에 「의미」 말풍선을 띄우고, 누르면 그 글의 문맥에 맞는 뜻 하나를
// 사전처럼 보인다(A26, GMS). 셸에 하나 둔다. 드래그 대상은 meaningProps 를 붙인 글이고 띄울지는 pickTerm 이 정한다.
// 「의미」를 누르기 전에는 서버를 부르지 않는다. 누르면 메인 컬러 점 셋이 하나씩 튀고, 뜻이 오면 말풍선이 커지며 보인다.
// 닫기: 바깥 누르기 · Esc(맨 위 하나만 닫는 순서의 첫 자리) · 휠 · 스크롤 · 화면 크기 바뀜 · 다른 화면으로 이동.
// 기다리는 중 다른 말을 고르면 앞 답은 버린다. 무엇을 찾았는지는 어디에도 저장하지 않는다
export function MeaningBubble() {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const bubbleRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const current = useRef<Bubble | null>(null);
  // 앞서 보낸 요청의 답이 늦게 와도 지금 말풍선에 덮어쓰지 않게 번호를 올린다
  const asked = useRef(0);
  const pointerDown = useRef(false);
  const narrow = useMediaQuery(NARROW_SCREEN);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  const show = useCallback((next: Bubble | null) => {
    current.current = next;
    setBubble(next);
  }, []);

  const close = useCallback(() => {
    asked.current++;
    show(null);
  }, [show]);

  // 선택이 바뀌었다 — 맞는 말이면 「의미」를 띄우고, 선택이 사라지면 「의미」 단계만 닫는다
  // (기다리는 중 · 뜻은 바깥 누르기 · Esc 로 닫는다 — 「의미」를 누르는 사이 선택이 풀려도 남게)
  const check = useCallback(() => {
    const anchor = window.getSelection()?.anchorNode;
    if (anchor && bubbleRef.current?.contains(anchor)) return;
    const found = readSelection();
    const open = current.current;
    if (!found) {
      if (open?.phase.kind === "offer") close();
      return;
    }
    if (open && sameSpot(open, found)) return;
    asked.current++;
    setSize(null);
    show({ ...found, phase: { kind: "offer" } });
  }, [close, show]);

  useEffect(() => {
    let settle: number | undefined;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && bubbleRef.current?.contains(target) === true;
    // 왼쪽 버튼만 본다 — 우클릭은 선택을 그대로 둬야 메뉴에서 「복사」를 고를 수 있다
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || inside(event.target)) return;
      pointerDown.current = true;
      if (current.current) close();
      // 드래그 대상 글에 남은 선택은 지운다 — 지도(SVG)는 select-none 이라 눌러도 브라우저가 선택을 지우지 않아,
      // 남은 선택 때문에 다음 클릭이 「드래그 끝의 클릭」으로 읽혀 빈 곳 풀기 · 강조가 먹히지 않는다
      const anchor = window.getSelection()?.anchorNode;
      if (anchor && hostOf(anchor)) window.getSelection()?.removeAllRanges();
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerDown.current = false;
      if (inside(event.target)) return;
      // 클릭으로 선택이 풀린 뒤 · 드래그 끝의 선택이 자리 잡은 뒤에 본다
      window.setTimeout(check, 0);
    };
    const onPointerCancel = () => {
      pointerDown.current = false;
    };
    const onSelectionChange = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (!pointerDown.current) check();
      }, SETTLE_MS);
    };
    // 캡처 단계에서 먼저 닫고 preventDefault 로 알린다 — 사건 패널 · 강조 풀기는 defaultPrevented 면 건너뛴다
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing || !current.current) return;
      key.preventDefault();
      close();
    };
    // 선택 영역이 움직이면 말풍선 자리가 어긋난다 — 따라가지 않고 닫는다
    const onMove = (event: Event) => {
      if (current.current && !inside(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("wheel", onMove, { capture: true, passive: true });
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", close);
    return () => {
      window.clearTimeout(settle);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("wheel", onMove, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", close);
    };
  }, [check, close]);

  // 다른 화면으로 가면 닫는다 — 앞 화면이 떠나며(정리 단계) 닫아 새 화면에 옛 말풍선이 남지 않게
  useEffect(() => close, [pathname, close]);

  // 내용의 크기를 재서 겉 상자에 준다 — 크기가 바뀌면 겉 상자가 그 크기로 자연스럽게 커진다(동작 줄이기면 바로)
  const phaseKind = bubble?.phase.kind;
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () =>
      setSize({ width: inner.offsetWidth, height: inner.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [phaseKind, bubble?.picked]);

  const ask = () => {
    const open = current.current;
    if (!open) return;
    const mine = ++asked.current;
    show({ ...open, phase: { kind: "loading" } });
    const settled = (phase: Phase) => {
      if (asked.current !== mine || !current.current) return;
      show({ ...current.current, phase });
    };
    queryClient
      .fetchQuery(
        meaningQuery({
          term: open.picked.term,
          around: open.picked.around,
          contextType: open.type,
          contextId: open.id,
        }),
      )
      .then(
        (result) => settled({ kind: "done", result }),
        (error: unknown) =>
          settled({ kind: "failed", message: failureMessage(error) }),
      );
  };

  if (!bubble) return null;
  const { term } = bubble.picked;
  const style: CSSProperties = {
    ...place(bubble, size ?? { width: 0, height: 0 }, narrow),
    width: size?.width,
    height: size?.height,
    // 처음 잰 크기를 받기 전에는 자리를 못 정해서 숨겨 둔다
    visibility: size ? undefined : "hidden",
  };

  return createPortal(
    <div
      ref={bubbleRef}
      data-meaning-bubble
      style={style}
      className="z-[30] overflow-hidden rounded-[18px] border border-stroke-neutral-weak bg-bg-layer-floating shadow-s3 motion-safe:animate-[newlearn-meaning-in_160ms_var(--seed-timing-function-enter)] motion-safe:transition-[width,height,top,left] motion-safe:duration-200 motion-safe:ease-[var(--seed-timing-function-enter)]"
    >
      {/* 새로 온 뜻 · 실패 안내를 읽어 준다 (EXPERIENCE.md Accessibility Floor) */}
      <div ref={innerRef} aria-live="polite" className="w-max">
        {bubble.phase.kind === "offer" ? (
          <button
            type="button"
            aria-label={`의미 — '${term}'의 뜻 보기`}
            // 누르는 순간 선택이 풀리지 않게 — 풀리면 「의미」 단계가 닫힌다
            onMouseDown={(event) => event.preventDefault()}
            onClick={ask}
            className="t4-bold flex h-[36px] items-center rounded-full px-x4 text-fg-neutral transition-colors hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus-ring"
          >
            의미
          </button>
        ) : bubble.phase.kind === "loading" ? (
          <div className="flex h-[36px] items-center gap-[5px] px-x4">
            <span className="sr-only">{`'${term}'의 뜻을 찾는 중`}</span>
            {/* 점 셋이 하나씩 차례로 튄다 — 0 · 300 · 600ms 늦춰 한 번에 한 점만 떠 있다 */}
            {[0, 300, 600].map((delay) => (
              <span
                key={delay}
                aria-hidden
                data-meaning-dot
                style={{ animationDelay: `${delay}ms` }}
                className="size-[7px] rounded-full bg-bg-brand-solid motion-safe:animate-[newlearn-meaning-dot_900ms_ease-in-out_infinite]"
              />
            ))}
          </div>
        ) : bubble.phase.kind === "done" ? (
          <MeaningCard term={term} result={bubble.phase.result} />
        ) : (
          <p className="t4-regular max-w-[min(280px,calc(100vw-32px))] px-x4 py-x2_5 text-fg-neutral">
            {bubble.phase.message}
          </p>
        )}
      </div>
    </div>,
    bubble.container,
  );
}

// 뜻 — 사전처럼 표제어 · 품사, 그 아래 뜻풀이. AI 가 만든 풀이라 AI 생성 표시를 붙인다 (EXPERIENCE.md Voice and Tone)
function MeaningCard({
  term,
  result,
}: {
  term: string;
  result: MeaningResult;
}) {
  if (!result.word || !result.definition)
    return (
      <p className="t4-regular max-w-[min(280px,calc(100vw-32px))] px-x4 py-x2_5 text-fg-neutral">
        뜻을 풀이하기 어려워요. 낱말 전체를 골라 보세요.
      </p>
    );
  return (
    <section
      aria-label={`'${term}'의 뜻`}
      className="max-w-[min(320px,calc(100vw-32px))] min-w-[220px] px-x4 py-x3"
    >
      <div className="flex items-center gap-x1_5">
        <strong className="t5-bold text-fg-neutral">{result.word}</strong>
        {result.pos && (
          <span className="t2-regular text-fg-neutral-subtle">
            {result.pos}
          </span>
        )}
        <span className="ml-auto pl-x2">
          <AiBadge />
        </span>
      </div>
      <p className="t4-regular mt-x1_5 text-fg-neutral">{result.definition}</p>
    </section>
  );
}
