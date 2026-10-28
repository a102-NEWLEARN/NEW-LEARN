import {
  IconMinusLine,
  IconPlusLine,
  IconQuestionmarkCircleLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import {
  select,
  zoom,
  type ZoomBehavior,
  zoomIdentity,
  type ZoomTransform,
} from "d3";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionButton } from "seed-design/ui/action-button";
import type { TimelineEvent, TimelineLane } from "@/api/timeline";
import {
  GUTTER,
  layoutTimeline,
  RIGHT_ROOM,
  type PlacedEvent,
} from "@/components/issue/timelineLayout";
import { useElementSize } from "@/components/issue/useElementSize";

// 확대 · 축소 범위와 버튼 한 번의 배율 (프로토타입 v21)
const SCALE_EXTENT: [number, number] = [0.5, 4];
const ZOOM_OUT = 0.8;
const ZOOM_IN = 1.25;
// 혼자 눌러도 키보드로 옮긴 것이 아닌 키
const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift", "AltGraph"]);
// 잴 수 없을 때(jsdom) 쓰는 타임라인 자리 크기
const FALLBACK_SIZE = { width: 1000, height: 520 };
// 오른쪽 끝에서 라벨이 들어갈 자리. 고른 · 포커스한 사건이 여기 걸치면 화면 안으로 옮긴다
const LABEL_ROOM = 210;

const LANE_NAME: Record<TimelineLane, string> = {
  MAIN: "메인 흐름",
  SUB: "서브 흐름",
};
const LANE_MEANING: Record<TimelineLane, string> = {
  MAIN: "상황을 바꾸는 행위(발생 · 결정 · 발표 · 결과 · 공식 조치)",
  SUB: "다른 사건에 대한 반응 · 평가 · 여론(논평 · 성명 · 여론조사)",
};

// 노드 반지름 — 메인 흐름이 한 단계 크다 (DESIGN.md 타임라인 노드)
const radiusOf = (event: PlacedEvent) => (event.lane === "MAIN" ? 10 : 8);

// 「08.21 추정」
const dateText = (event: PlacedEvent) =>
  event.estimated ? `${event.dateLabel} 추정` : event.dateLabel;

// 「기사 5건」 · 「언론사 3곳」 — 0이면 그 항목을 뺀다 (EXPERIENCE.md Voice and Tone)
const articlesText = (event: PlacedEvent) =>
  event.articleCount > 0 ? `기사 ${event.articleCount}건` : null;
const publishersText = (event: PlacedEvent) =>
  event.publisherCount > 0 ? `언론사 ${event.publisherCount}곳` : null;
const joined = (...parts: (string | null)[]) =>
  parts.filter(Boolean).join(" · ");

// 글자 폭 어림 — 한글은 글자 크기만큼, 그 밖은 0.6배
function textWidth(text: string, fontSize: number) {
  return [...text].reduce(
    (sum, char) => sum + (/[가-힣]/.test(char) ? fontSize : fontSize * 0.6),
    0,
  );
}

// 폭에 넘치면 뒤를 「…」로 줄인다
function fitText(text: string, width: number, fontSize: number) {
  if (textWidth(text, fontSize) <= width) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidth(`${chars.join("")}…`, fontSize) > width)
    chars.pop();
  return `${chars.join("")}…`;
}

function prefersReducedMotion() {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

type TimelineProps = {
  /** A4 사건. 비어 있으면 화면이 대신 빈 상태를 둔다 */
  events: TimelineEvent[];
  selectedId: number | null;
  onSelect: (eventId: number) => void;
  onDeselect: () => void;
  /** 도구줄 「이슈 흐름」 옆 — 기간 · 사건 · 기사 수 */
  summary?: ReactNode;
};

// F07 사건 중심 이슈 에볼루션 맵 — 가로는 시간, 세로는 메인 흐름 · 서브 흐름 레인 (프로토타입 v21 LaneTimeline).
// 사건 사이 관계선은 그리지 않는다 (docs/api-screen.md A4). 배치는 timelineLayout 이 정하고 여기서는 그린다.
// 확대 · 축소는 d3-zoom 이 가로 방향만 맡는다 — 노드 크기는 그대로 두고 자리만 옮긴다
export function Timeline({
  events,
  selectedId,
  onSelect,
  onDeselect,
  summary,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const measured = useElementSize(wrapRef);
  const width = measured.width || FALLBACK_SIZE.width;
  const height = measured.height || FALLBACK_SIZE.height;
  const layout = useMemo(
    () => layoutTimeline(events, { width }),
    [events, width],
  );
  // d3-zoom 과 이벤트 처리가 그때그때 읽는 최신 크기 · 배치. 그린 뒤 옮겨 둔다
  const sizeRef = useRef({ width, height });
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    sizeRef.current = { width, height };
    layoutRef.current = layout;
  }, [width, height, layout]);

  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  // − · + 버튼이 노리는 배율. 움직임이 끝나면 비운다
  const targetScale = useRef<number | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hoverId, setHoverId] = useState<number | null>(null);
  // 키보드로 포커스한 노드 — 포커스 테두리와 툴팁을 띄운다
  const [focusId, setFocusId] = useState<number | null>(null);
  // 마지막 입력이 키보드였나 — 키보드로 받은 포커스에만 테두리 · 툴팁을 띄운다. 마우스 · 터치로 누른 노드가
  // 받은 포커스는 호버가 맡는다. 「누르는 중」으로는 못 가린다 — 터치는 손을 뗀 뒤에야 포커스가 온다
  const keyboardInput = useRef(true);
  useEffect(() => {
    // 수정키만 누른 것(Alt+Tab 으로 창을 오갈 때 등)은 치지 않는다 — 브라우저의 :focus-visible 과 같다
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (MODIFIER_KEYS.has(key.key)) return;
      keyboardInput.current = true;
    };
    const onPointer = () => {
      keyboardInput.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  const [tipOpen, setTipOpen] = useState(false);
  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const tipCloseRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // TIP 을 닫으면 포커스를 연 버튼으로 돌린다 (EXPERIENCE.md Accessibility Floor)
  const closeTip = () => {
    setTipOpen(false);
    tipButtonRef.current?.focus();
  };
  // 열면 포커스를 창 안으로. 열려 있는 동안 누른 Esc 는 이 창을 닫는다. 다만 서랍처럼 다른 창(dialog) 안에서 누른
  // Esc 는 그쪽 몫이다 — 맨 위에 열린 것 하나만 닫는다 (EXPERIENCE.md Interaction Primitives)
  useEffect(() => {
    if (!tipOpen) return;
    tipCloseRef.current?.focus();
    const onKeyDown = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing) return;
      const layer = (key.target as Element | null)?.closest?.(
        '[role="dialog"]',
      );
      if (layer && layer !== tipRef.current) return;
      key.preventDefault();
      setTipOpen(false);
      tipButtonRef.current?.focus();
    };
    // 캡처 단계 — 오른쪽 사건 패널(이슈 화면의 버블 단계 Esc)보다 먼저 TIP 을 닫고 preventDefault 로 알린다
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [tipOpen]);

  // 화면 가로 자리 — 레인 이름 칸 오른쪽에서 시작해 확대 · 축소를 따른다
  const screenX = (x: number) => transform.applyX(GUTTER + x);

  // d3-zoom 을 한 번 붙인다. 크기는 그때그때 읽는다 — jsdom 은 SVG 크기를 못 재서 extent 를 직접 준다
  useEffect(() => {
    const svg = svgRef.current!;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .extent(() => [
        [0, 0],
        [sizeRef.current.width, sizeRef.current.height],
      ])
      .on(
        "zoom",
        (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
          // 휠 · 끌기로 직접 움직이면 버튼이 노리던 배율은 버린다
          if (event.sourceEvent) targetScale.current = null;
          transformRef.current = event.transform;
          setTransform(event.transform);
        },
      );
    select(svg).call(behavior).on("dblclick.zoom", null);
    zoomRef.current = behavior;
    return () => {
      select(svg).interrupt().on(".zoom", null);
    };
  }, []);

  // 배율 k 로 레인 이름 칸이 제자리에 있게 — 가로로 x 만큼 옮긴다
  const apply = (next: ZoomTransform, duration = 300) => {
    targetScale.current = null;
    const selection = select(svgRef.current!);
    if (duration > 0 && !prefersReducedMotion())
      selection
        .transition()
        .duration(duration)
        .call(zoomRef.current!.transform, next);
    else selection.call(zoomRef.current!.transform, next);
  };
  const atScale = (k: number, x = GUTTER * (1 - k)) =>
    zoomIdentity.translate(x, 0).scale(k);
  // 버튼 배율은 움직이는 중의 배율이 아니라 앞 버튼이 노린 배율에서 잰다 — 빠르게 두 번 눌러도 두 번 다 먹게
  const scaleBy = (factor: number) => {
    const [min, max] = SCALE_EXTENT;
    const from = targetScale.current ?? transformRef.current.k;
    const next = Math.min(max, Math.max(min, from * factor));
    targetScale.current = next;
    const selection = select(svgRef.current!);
    if (prefersReducedMotion()) {
      selection.call(zoomRef.current!.scaleTo, next);
      targetScale.current = null;
    } else
      selection
        .transition()
        .duration(200)
        .call(zoomRef.current!.scaleTo, next)
        .on("end", () => {
          if (targetScale.current === next) targetScale.current = null;
        });
  };
  // 전체 보기 — 그리는 영역이 다 들어오게. 100% 보다 키우지 않고 50% 아래로 줄이지 않는다
  const fit = () => {
    const room = sizeRef.current.width - GUTTER - 60;
    apply(atScale(Math.max(0.5, Math.min(1, room / layoutRef.current.width))));
  };
  // 그 사건이 화면 가운데쯤 오게 가로로 옮긴다. 배율은 그대로
  const centerOn = (event: PlacedEvent, duration = 300) => {
    const { k } = transformRef.current;
    const target = GUTTER + (sizeRef.current.width - GUTTER) * 0.45;
    apply(atScale(k, target - (GUTTER + event.x) * k), duration);
  };
  // 화면 밖이거나 오른쪽 라벨 자리에 걸치면 옮긴다
  const keepInView = (event: PlacedEvent, duration?: number) => {
    const x = transformRef.current.applyX(GUTTER + event.x);
    if (x < GUTTER + 20 || x > sizeRef.current.width - LABEL_ROOM)
      centerOn(event, duration);
  };

  // 처음 — 다 들어오면 100%, 아니면 들어오게 줄이되 75% 아래로는 줄이지 않는다. 고른 사건이 있으면 보이게.
  // 처음 그릴 때는 자리 폭을 아직 못 재서 어림값(FALLBACK_SIZE)으로 맞춘다. 진짜 폭을 재면 한 번 더 맞춘다
  const startedWidth = useRef<number | null>(null);
  useEffect(() => {
    const first = startedWidth.current === null;
    const remeasured = startedWidth.current === 0 && measured.width > 0;
    if (!first && !remeasured) return;
    startedWidth.current = measured.width;
    // 배치가 넓은 화면에서 늘리는 폭과 같은 값으로 재야 늘어난 배치가 딱 100% 가 된다
    const room = sizeRef.current.width - GUTTER - RIGHT_ROOM;
    const fitting = room / layoutRef.current.width;
    apply(atScale(fitting >= 0.75 ? Math.min(1, fitting) : 0.75), 0);
    const selected = layoutRef.current.events.find(
      (event) => event.id === selectedId,
    );
    if (selected) keepInView(selected, 0);
    // 폭을 잰 때만 — 그 뒤 고르기는 아래 효과가 맡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured.width]);

  // 주소의 ?event= 로 고른 사건이 바뀌면 보이게 옮긴다
  useEffect(() => {
    const selected = layoutRef.current.events.find(
      (event) => event.id === selectedId,
    );
    if (startedWidth.current !== null && selected) keepInView(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const onNodeKeyDown = (event: KeyboardEvent, id: number) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(id);
  };

  // 라벨 — 같은 레인 오른쪽 이웃 노드까지 64px 이상 남으면 오른쪽, 아니면 노드 아래 (프로토타입).
  // 오른쪽 라벨은 노드 가운데보다 6px 아래에서 시작한다 — 메인 흐름 선이 글자를 지나가지 않게
  const labelOf = (event: PlacedEvent) => {
    const x = screenX(event.x);
    const r = radiusOf(event);
    const neighbors = layout.events
      .filter(
        (other) =>
          other.lane === event.lane &&
          Math.abs(other.y - event.y) < 34 &&
          screenX(other.x) > x + 1,
      )
      .map((other) => screenX(other.x) - radiusOf(other) - 18);
    const limit = Math.min(...neighbors, width - 16);
    const room = limit - (x + r + 8);
    if (room >= 64)
      return { dx: r + 8, dy: 6, width: Math.min(room, 190), below: false };
    const nextX = neighbors.length ? Math.min(...neighbors) + 18 : width - 16;
    return {
      dx: -r - 4,
      dy: r + 10,
      width: Math.max(40, Math.min(nextX - (x - r - 4), 170)),
      below: true,
    };
  };

  const selected = layout.events.find((event) => event.id === selectedId);
  const tipEvent = layout.events.find(
    (event) => event.id === (focusId ?? hoverId),
  );
  const svgHeight = Math.max(height, layout.height);
  const mainLane = layout.lanes.find((lane) => lane.key === "MAIN")!;
  const mainXs = layout.events
    .filter((event) => event.lane === "MAIN")
    .map((event) => screenX(event.x));

  return (
    <section
      aria-labelledby="timeline-title"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex flex-wrap items-center gap-x2 border-b border-stroke-neutral-subtle bg-bg-layer-default px-x4 py-x2_5">
        <div className="mr-auto flex flex-wrap items-baseline gap-x2_5">
          <h2 id="timeline-title" className="t6-bold text-fg-neutral">
            이슈 흐름
          </h2>
          {summary && (
            <span className="t4-regular text-fg-neutral-muted tabular-nums">
              {summary}
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="확대 · 축소"
          className="flex h-x9 items-center rounded-r2 border border-stroke-neutral-weak p-[2px]"
        >
          <button
            type="button"
            aria-label="축소"
            onClick={() => scaleBy(ZOOM_OUT)}
            className="flex size-x8 items-center justify-center rounded-r1_5 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
          >
            <IconMinusLine aria-hidden size={16} />
          </button>
          <span className="t4-regular w-[44px] text-center text-fg-neutral-muted tabular-nums">
            {`${Math.round(transform.k * 100)}%`}
          </span>
          <button
            type="button"
            aria-label="확대"
            onClick={() => scaleBy(ZOOM_IN)}
            className="flex size-x8 items-center justify-center rounded-r1_5 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
          >
            <IconPlusLine aria-hidden size={16} />
          </button>
        </div>
        <ActionButton
          variant="neutralOutline"
          size="small"
          className="border-stroke-neutral-weak"
          onClick={fit}
        >
          전체 보기
        </ActionButton>
        <ActionButton
          ref={tipButtonRef}
          variant="neutralOutline"
          size="small"
          className="border-stroke-neutral-weak"
          aria-expanded={tipOpen}
          onClick={() => (tipOpen ? closeTip() : setTipOpen(true))}
        >
          <IconQuestionmarkCircleLine aria-hidden size={16} />
          TIP
        </ActionButton>
      </div>
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-bg-layer-default"
      >
        <svg
          ref={svgRef}
          role="group"
          aria-label="사건 타임라인"
          width="100%"
          height={svgHeight}
          className="block cursor-grab touch-none select-none"
          onClick={onDeselect}
        >
          <defs>
            <clipPath id="timeline-plot">
              <rect
                x={GUTTER}
                y={0}
                width={Math.max(0, width - GUTTER)}
                height={svgHeight}
              />
            </clipPath>
          </defs>
          {/* 레인 바탕 — 번갈아 옅은 회색 */}
          {layout.lanes.map((lane, index) => (
            <g key={lane.key}>
              <rect
                x={0}
                y={lane.top}
                width={width}
                height={lane.height}
                className={
                  index % 2 ? "fill-bg-layer-basement" : "fill-bg-layer-default"
                }
              />
              <line
                x1={0}
                x2={width}
                y1={lane.top + lane.height - 0.5}
                y2={lane.top + lane.height - 0.5}
                className="stroke-stroke-neutral-subtle"
              />
            </g>
          ))}
          <g clipPath="url(#timeline-plot)">
            {layout.months
              .filter((month) => month.line)
              .map((month) => (
                <line
                  key={month.key}
                  x1={screenX(month.x)}
                  x2={screenX(month.x)}
                  y1={0}
                  y2={layout.axisY}
                  strokeDasharray="2 5"
                  className="pointer-events-none stroke-stroke-neutral-weak"
                />
              ))}
            {/* 메인 흐름 레인 선 — 사건 사이 관계가 아니라 레인 자리다 (DESIGN.md timeline-rail) */}
            {mainXs.length > 1 && (
              <line
                x1={Math.min(...mainXs)}
                x2={Math.max(...mainXs)}
                y1={mainLane.top + mainLane.nodeY}
                y2={mainLane.top + mainLane.nodeY}
                strokeWidth={2}
                className="pointer-events-none stroke-stroke-brand-weak"
              />
            )}
            {layout.events.map((event) => {
              const x = screenX(event.x);
              const r = radiusOf(event);
              const main = event.lane === "MAIN";
              const isSelected = event.id === selectedId;
              const isHovered = event.id === hoverId;
              const isFocused = event.id === focusId;
              const label = labelOf(event);
              const meta = joined(dateText(event), articlesText(event));
              return (
                <g
                  key={event.id}
                  transform={`translate(${x},${event.y})`}
                  role="button"
                  tabIndex={0}
                  data-event-id={event.id}
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={[
                    `${dateText(event)} ${event.title}`,
                    LANE_NAME[event.lane],
                    articlesText(event),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  className="cursor-pointer outline-none"
                  onClick={(mouse) => {
                    mouse.stopPropagation();
                    onSelect(event.id);
                  }}
                  onKeyDown={(key) => onNodeKeyDown(key, event.id)}
                  onMouseEnter={() => setHoverId(event.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => {
                    if (!keyboardInput.current) return;
                    setFocusId(event.id);
                    keepInView(event);
                  }}
                  onBlur={() => setFocusId(null)}
                >
                  {/* 누르는 영역을 노드보다 넓게 */}
                  <circle r={r + 14} className="fill-transparent" />
                  {isSelected && (
                    <rect
                      x={-r - 5}
                      y={-r - 5}
                      width={2 * r + 10}
                      height={2 * r + 10}
                      rx={5}
                      className="fill-bg-brand-weak"
                    />
                  )}
                  {isHovered && !isSelected && (
                    <rect
                      x={-r - 5}
                      y={-r - 5}
                      width={2 * r + 10}
                      height={2 * r + 10}
                      rx={5}
                      strokeWidth={1.5}
                      className="fill-none stroke-stroke-brand-weak"
                    />
                  )}
                  <rect
                    x={-r}
                    y={-r}
                    width={2 * r}
                    height={2 * r}
                    rx={3}
                    strokeWidth={main ? 3 : 2}
                    className={
                      isSelected
                        ? "fill-bg-brand-solid stroke-palette-static-white"
                        : main
                          ? "fill-bg-brand-accent stroke-palette-static-white"
                          : "fill-palette-static-white stroke-palette-gray-600"
                    }
                  />
                  {isFocused && (
                    <rect
                      x={-r - 7}
                      y={-r - 7}
                      width={2 * r + 14}
                      height={2 * r + 14}
                      rx={6}
                      strokeWidth={2}
                      className="fill-none stroke-stroke-focus-ring"
                    />
                  )}
                  <g
                    transform={`translate(${label.dx},${label.dy})`}
                    className="pointer-events-none"
                  >
                    {label.below && (
                      <rect
                        x={-4}
                        y={-3}
                        width={label.width + 8}
                        height={36}
                        rx={6}
                        className="fill-bg-layer-default opacity-95"
                      />
                    )}
                    <text
                      dominantBaseline="hanging"
                      className={`stroke-bg-layer-default text-[0.8125rem] ${isSelected ? "fill-fg-brand font-bold" : main ? "fill-fg-neutral font-bold" : "fill-fg-neutral font-semibold"}`}
                      paintOrder="stroke"
                      strokeWidth={4}
                      strokeLinejoin="round"
                    >
                      {fitText(event.label, label.width, 13)}
                    </text>
                    <text
                      y={17}
                      dominantBaseline="hanging"
                      className="fill-fg-neutral-muted stroke-bg-layer-default text-[0.75rem] tabular-nums"
                      paintOrder="stroke"
                      strokeWidth={4}
                      strokeLinejoin="round"
                    >
                      {label.width >= 100 ? meta : dateText(event)}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
          {/* 시간축 — 달 첫날 눈금과 고른 사건 날짜 */}
          <g>
            <rect
              x={0}
              y={layout.axisY}
              width={width}
              height={svgHeight - layout.axisY}
              className="fill-bg-layer-default"
            />
            <line
              x1={GUTTER}
              x2={width}
              y1={layout.axisY + 0.5}
              y2={layout.axisY + 0.5}
              className="stroke-stroke-neutral-weak"
            />
            <g clipPath="url(#timeline-plot)">
              {layout.months.map((month) => (
                <g
                  key={month.key}
                  transform={`translate(${screenX(month.x)},${layout.axisY})`}
                >
                  {month.line && (
                    <line y1={0} y2={8} className="stroke-fg-neutral-muted" />
                  )}
                  <text
                    x={5}
                    y={18}
                    className="fill-fg-neutral-muted text-[0.75rem] font-bold"
                  >
                    {month.label}
                  </text>
                </g>
              ))}
              {selected && (
                <g
                  transform={`translate(${screenX(selected.x)},${layout.axisY + 2})`}
                >
                  <line
                    y1={-layout.axisY}
                    y2={0}
                    strokeDasharray="2 3"
                    className="stroke-bg-brand-solid opacity-50"
                  />
                  <rect
                    x={-24}
                    y={4}
                    width={48}
                    height={20}
                    rx={10}
                    className="fill-bg-brand-solid"
                  />
                  <text
                    data-testid="selected-date"
                    y={18}
                    textAnchor="middle"
                    className="fill-palette-static-white text-[0.6875rem] font-bold tabular-nums"
                  >
                    {selected.dateLabel}
                  </text>
                </g>
              )}
            </g>
          </g>
          {/* 왼쪽 레인 이름 칸 — 확대 · 축소해도 제자리 */}
          <g role="list" aria-label="레인">
            <rect
              x={0}
              y={0}
              width={GUTTER}
              height={layout.axisY}
              className="fill-bg-layer-default"
            />
            <line
              x1={GUTTER - 0.5}
              x2={GUTTER - 0.5}
              y1={0}
              y2={layout.axisY}
              className="stroke-stroke-neutral-subtle"
            />
            {layout.lanes.map((lane) => {
              const y = lane.top + lane.nodeY;
              const main = lane.key === "MAIN";
              return (
                <g key={lane.key} role="listitem">
                  <title>{LANE_MEANING[lane.key]}</title>
                  <rect
                    x={16}
                    y={y - 13}
                    width={4}
                    height={26}
                    rx={2}
                    className={
                      main ? "fill-bg-brand-accent" : "fill-palette-gray-500"
                    }
                  />
                  <text
                    x={28}
                    y={y - 2}
                    className={`text-[0.8125rem] font-extrabold ${main ? "fill-fg-neutral" : "fill-fg-neutral-muted"}`}
                  >
                    {lane.name}
                  </text>
                  <text
                    x={28}
                    y={y + 15}
                    className="fill-fg-neutral-subtle text-[0.75rem] tabular-nums"
                  >
                    {`사건 ${lane.count}`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {tipEvent && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-r3 border border-stroke-neutral-weak bg-bg-layer-floating px-x3 py-x2 shadow-s2"
            style={{
              left: Math.min(screenX(tipEvent.x) + 16, width - 272),
              top: tipEvent.y + 18,
            }}
          >
            <p className="t4-bold text-fg-neutral">{tipEvent.title}</p>
            <p className="t3-regular mt-x0_5 text-fg-neutral-muted tabular-nums">
              {joined(
                dateText(tipEvent),
                articlesText(tipEvent),
                publishersText(tipEvent),
                LANE_NAME[tipEvent.lane],
              )}
            </p>
          </div>
        )}
        {tipOpen && (
          <div
            ref={tipRef}
            role="dialog"
            aria-label="타임라인 TIP"
            className="absolute top-x3 right-x3 z-20 w-[300px] rounded-r4 border border-stroke-neutral-weak bg-bg-layer-floating p-x4 shadow-s3"
          >
            <div className="flex items-center">
              <p className="t5-bold flex items-center gap-x1_5 text-fg-neutral">
                <IconQuestionmarkCircleLine
                  aria-hidden
                  size={16}
                  className="text-fg-brand"
                />
                타임라인 TIP
              </p>
              <button
                type="button"
                ref={tipCloseRef}
                aria-label="TIP 닫기"
                onClick={closeTip}
                className="ml-auto flex size-x7 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
              >
                <IconXmarkLine aria-hidden size={16} />
              </button>
            </div>
            <p className="t3-bold mt-x3 text-fg-neutral">레인 뜻</p>
            <ul className="t3-regular mt-x1_5 flex flex-col gap-x1_5 text-fg-neutral-muted">
              {(["MAIN", "SUB"] as const).map((key) => (
                <li key={key}>
                  <b className="font-semibold text-fg-neutral">
                    {LANE_NAME[key]}
                  </b>{" "}
                  — {LANE_MEANING[key]}
                </li>
              ))}
            </ul>
            <p className="t3-bold mt-x3 text-fg-neutral">사건 표시</p>
            <ul className="t3-regular mt-x1_5 flex flex-col gap-x1_5 text-fg-neutral-muted">
              <li>
                날짜 뒤 「추정」은 발생 시점을 첫 기사가 나온 때로 채운
                사건이에요.
              </li>
              <li>
                기사 수는 숫자로만 보여 줘요. 위치나 크기로 중요도를 나타내지
                않아요.
              </li>
              <li>휠이나 끌기로 옮기고, 사건을 누르면 그 사건을 골라요.</li>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
