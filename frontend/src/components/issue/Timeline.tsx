import {
  IconMinusLine,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import {
  select,
  zoom,
  type ZoomBehavior,
  zoomIdentity,
  type ZoomTransform,
} from "d3";
import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionButton } from "seed-design/ui/action-button";
import type { TimelineEvent } from "@/api/timeline";
import {
  GUTTER,
  latestEventId,
  layoutTimeline,
  RIGHT_ROOM,
  type PlacedEvent,
  type StackFold,
} from "@/components/issue/timelineLayout";
import {
  LANE_MEANING,
  LANE_NAME,
  useTimelineTip,
} from "@/components/issue/TimelineTip";
import { useElementSize } from "@/components/issue/useElementSize";
import {
  isMeaningText,
  isTextDragClick,
  meaningProps,
} from "@/components/meaning/meaningProps";
import {
  DRAW,
  enterAt,
  FADE_IN,
  GROW_Y,
  HOVER_SPRING,
  RIPPLE_ONCE,
  RISE,
  SPRING_IN,
} from "@/components/motion/screenMotion";
import { MeaningGuide } from "@/components/meaning/MeaningGuide";
import { useKeyboardInput } from "@/components/useKeyboardInput";
import { track } from "@/lib/analytics";
import { prefersReducedMotion } from "@/lib/motion";

// 확대 · 축소 범위와 버튼 한 번의 배율 (프로토타입 v21). 줄이는 하한은 50% 지만, 사건이 많아 50% 로도 다 안 들어오면
// 다 들어오는 배율까지 줄인다 — 전체 보기로 시작부터 끝이 딱 보이게 (2026-11-16 사용자, Jira 223)
const SCALE_EXTENT: [number, number] = [0.5, 4];
// 다 들어오는 배율이 이보다 작아지지는 않게 — 아주 좁은 폭에서 0 이나 음수가 되지 않게
const MIN_FIT = 0.05;
const ZOOM_OUT = 0.8;
const ZOOM_IN = 1.25;
// 잴 수 없을 때(jsdom) 쓰는 타임라인 자리 크기
const FALLBACK_SIZE = { width: 1000, height: 520 };
// 오른쪽 끝에서 라벨이 들어갈 자리. 고른 · 포커스한 사건이 여기 걸치면 화면 안으로 옮긴다
const LABEL_ROOM = 210;

// 열 때 나오는 차례(ms) — 레인 이름이 먼저 나오고, 메인 흐름 선이 첫 메인 사건에서 마지막 메인 사건까지 같은 빠르기로
// 뻗으며 선 끝이 지나는 자리의 사건이 튀어나온다. 서브 흐름 사건은 그 자리를 선이 지나간 뒤 조금 늦게, 라벨은 사건 뒤에.
// 선이 뻗는 시간은 사건 수만큼 늘되 1초에서 멈춘다 — 다 나오기까지 2초가 안 걸리게 (프로토타입 v21 LaneTimeline 을 키웠다)
const SWEEP_START = 220;
const SWEEP_PER_EVENT = 140;
const SWEEP_MAX = 1000;
const SUB_AFTER = 100;
const LABEL_AFTER = 120;
// 레인 이름 막대 · 글자
const LANE_BAR_AT = 0;
const LANE_TEXT_AT = 80;

// 사건 이름 글자 크기(px) — 날짜 · 기사 수 줄은 13px. 읽기 어려워 13 · 12px 에서 키웠다 (2026-11-12 사용자 QA, Jira 197).
// 라벨 높이는 timelineLayout 의 쌓는 간격 · 라벨 아래 끝과 맞물린다
const NAME_SIZE = 15;

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

type TimelineProps = {
  /** A4 사건. 비어 있으면 화면이 대신 빈 상태를 둔다 */
  events: TimelineEvent[];
  selectedId: number | null;
  onSelect: (eventId: number) => void;
  onDeselect: () => void;
  /** 도구줄 「이슈 흐름」 옆 — 기간 · 사건 · 기사 수 */
  summary?: ReactNode;
  /** 도구줄의 「지도 | 세로」 — 이슈 화면이 넣는다 (Jira 221) */
  viewSwitch?: ReactNode;
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
  viewSwitch,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const measured = useElementSize(wrapRef);
  const width = measured.width || FALLBACK_SIZE.width;
  const height = measured.height || FALLBACK_SIZE.height;
  // 최신 사건 — 노드를 짙은 청록으로 칠한다 (2026-11-16 디자인 피드백, Jira 216)
  const latestId = useMemo(() => latestEventId(events), [events]);
  // 펼친 칸 — 같은 날 쌓인 사건이 많으면 3건만 보이고 「+N건」 칩으로 접는다. 칩을 누르면 그 칸만 펼친다.
  // 고른 사건 · 최신 사건은 접어도 늘 보인다 (2026-11-17 사용자, 스마트안경 이슈)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const layout = useMemo(
    () =>
      layoutTimeline(events, {
        width,
        expanded,
        pinned: [selectedId, latestId],
      }),
    [events, width, expanded, selectedId, latestId],
  );
  // 처음 열 때 그린 사건 — 펼치거나 골라서 나중에 나온 사건은 여는 차례를 기다리지 않고 바로 튀어나온다
  const [openedIds] = useState(
    () => new Set(layout.events.map((event) => event.id)),
  );
  const toggleFold = (fold: StackFold) =>
    setExpanded((before) => {
      const next = new Set(before);
      if (fold.expanded) next.delete(fold.key);
      else next.add(fold.key);
      return next;
    });
  // 다 들어오는 배율 — 첫 사건부터 마지막 사건의 이름표 자리(LABEL_ROOM)까지 화면에 들어온다. 100% 보다 키우지 않는다.
  // 줄이는 하한은 50% 와 이 배율 중 작은 것이다 (Jira 223)
  const fitScale = useMemo(() => {
    const last = Math.max(0, ...layout.events.map((event) => event.x));
    if (last === 0) return 1;
    return Math.min(1, Math.max(MIN_FIT, (width - GUTTER - LABEL_ROOM) / last));
  }, [layout, width]);
  const minScale = Math.min(SCALE_EXTENT[0], fitScale);
  // d3-zoom 과 이벤트 처리가 그때그때 읽는 최신 크기 · 배치 · 배율. 그린 뒤 옮겨 둔다
  const sizeRef = useRef({ width, height });
  const layoutRef = useRef(layout);
  const fitScaleRef = useRef(fitScale);
  const minScaleRef = useRef(minScale);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  useLayoutEffect(() => {
    sizeRef.current = { width, height };
    layoutRef.current = layout;
    fitScaleRef.current = fitScale;
    minScaleRef.current = minScale;
    // 처음에는 아래 d3-zoom 을 붙일 때 하한을 읽는다. 그 뒤 배치 · 폭이 바뀌면 여기서 고친다
    zoomRef.current?.scaleExtent([minScale, SCALE_EXTENT[1]]);
  }, [width, height, layout, fitScale, minScale]);

  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  // − · + 버튼이 노리는 배율. 움직임이 끝나면 비운다
  const targetScale = useRef<number | null>(null);
  // 지금 보이는 고른 사건 · 패널을 닫은 뒤 넓어질 폭으로 처음 보기를 한 번 더 맞출지. 직접 옮기거나 확대하면 맞추지 않는다
  const shownId = useRef(selectedId);
  const reopening = useRef(false);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hoverId, setHoverId] = useState<number | null>(null);
  // 키보드로 포커스한 노드 — 포커스 테두리와 툴팁을 띄운다
  const [focusId, setFocusId] = useState<number | null>(null);
  // 키보드로 포커스한 「+N건」 · 「접기」 칩
  const [focusFold, setFocusFold] = useState<string | null>(null);
  // 키보드로 받은 포커스에만 테두리 · 툴팁을 띄운다
  const keyboardInput = useKeyboardInput();
  // TIP — 레인 뜻 · 「추정」 뜻. 창은 타임라인 오른쪽 위에 띄운다
  const tip = useTimelineTip({
    panelClassName: "absolute top-[12px] right-[12px] z-20 w-[300px]",
    howTo:
      "휠로 위아래, Shift+휠이나 끌기로 옆으로 옮겨요. Ctrl+휠(맥은 ⌘+휠)이나 두 손가락 벌리기로 확대해요. 사건을 누르면 그 사건을 골라요.",
  });

  // 그냥 휠을 처음 굴렸을 때 한 번 — 확대는 Ctrl/⌘+휠로 옮겨 갔다고 알린다 (Jira 229)
  const [wheelHint, setWheelHint] = useState(false);
  const wheelHinted = useRef(false);

  // 화면 가로 자리 — 레인 이름 칸 오른쪽에서 시작해 확대 · 축소를 따른다
  const screenX = (x: number) => transform.applyX(GUTTER + x);

  // d3-zoom 을 한 번 붙인다. 크기는 그때그때 읽는다 — jsdom 은 SVG 크기를 못 재서 extent 를 직접 준다
  useEffect(() => {
    const svg = svgRef.current!;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minScaleRef.current, SCALE_EXTENT[1]])
      // 휠은 Ctrl · ⌘ 를 누른 것만 확대 · 축소한다 — 트랙패드 핀치도 브라우저가 Ctrl+휠로 보낸다. 그냥 휠은 아래 onWheel 이
      // 세로 스크롤 · 옆으로 옮기기로 쓴다. 휠이 늘 확대라 아래 서브 흐름으로 내려갈 수 없었다 (2026-11-17 사용자, Jira 229).
      // 그 밖은 d3 기본 조건(Ctrl 없이 · 왼쪽 버튼만)에 하나를 더한다 — 사건 이름 위에서 마우스를 누르면 지도를 끌지 않고
      // 글을 고른다(F13 용어사전). 빈 곳 · 노드에서는 지금처럼 끈다. 터치 이동 · 확대는 그대로다
      .filter((event: MouseEvent) =>
        event.type === "wheel"
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey &&
            !event.button &&
            !(event.type === "mousedown" && isMeaningText(event.target)),
      )
      // d3 기본값은 Ctrl 이면 10배로 키운다(작게 움직이는 핀치용). 마우스 Ctrl+휠 한 칸(100 안팎)까지 10배가 되면
      // 한 칸에 4배씩 뛰어서, 크게 움직인 것은 핀치가 아니라 휠 한 칸으로 본다
      .wheelDelta((event: WheelEvent) => {
        const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
        const pinch = event.ctrlKey && Math.abs(event.deltaY) < 50;
        return -event.deltaY * unit * (pinch ? 10 : 1);
      })
      .extent(() => [
        [0, 0],
        [sizeRef.current.width, sizeRef.current.height],
      ])
      .on(
        "zoom",
        (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
          // 휠 · 끌기로 직접 움직이면 버튼이 노리던 배율과 닫은 뒤 처음 보기 맞추기는 버린다
          if (event.sourceEvent) {
            targetScale.current = null;
            reopening.current = false;
          }
          transformRef.current = event.transform;
          setTransform(event.transform);
        },
      );
    select(svg).call(behavior).on("dblclick.zoom", null);
    zoomRef.current = behavior;

    // Ctrl · ⌘ 없는 휠 — Shift+휠 · 가로로 더 큰 휠(트랙패드 좌우)은 시간축을 따라 옆으로 옮기고, 세로 휠은 막지 않아
    // 브라우저가 지도 칸을 스크롤한다. 처음 세로로 굴리면 확대하는 법을 잠깐 알린다
    let hintTimer = 0;
    const onWheel = (wheel: WheelEvent) => {
      if (wheel.ctrlKey || wheel.metaKey) return;
      const dx = wheel.shiftKey ? wheel.deltaX || wheel.deltaY : wheel.deltaX;
      const sideways =
        wheel.shiftKey || Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY);
      if (sideways && dx !== 0) {
        wheel.preventDefault();
        const unit =
          wheel.deltaMode === 1
            ? 16
            : wheel.deltaMode
              ? sizeRef.current.width
              : 1;
        targetScale.current = null;
        reopening.current = false;
        select(svg).call(
          behavior.translateBy,
          -(dx * unit) / transformRef.current.k,
          0,
        );
        return;
      }
      if (wheel.deltaY === 0 || wheelHinted.current) return;
      wheelHinted.current = true;
      setWheelHint(true);
      hintTimer = window.setTimeout(() => setWheelHint(false), 2500);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      window.clearTimeout(hintTimer);
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
    reopening.current = false;
    const min = minScaleRef.current;
    const max = SCALE_EXTENT[1];
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
  // 전체 보기 — 첫 사건부터 마지막 사건의 이름표까지 다 들어오는 배율로 맞춘다. 100% 보다 키우지 않는다.
  // 전에는 50% 아래로 줄이지 않아 사건이 많은 이슈는 오른쪽이 잘렸다 (2026-11-16 사용자, Jira 223)
  const fit = () => {
    reopening.current = false;
    apply(atScale(fitScaleRef.current));
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

  // 처음 보기 — 다 들어오면 100%, 아니면 들어오게 줄이되 75% 아래로는 줄이지 않는다.
  // 배치가 넓은 화면에서 늘리는 폭과 같은 값으로 재야 늘어난 배치가 딱 100% 가 된다
  const opening = () => {
    const room = sizeRef.current.width - GUTTER - RIGHT_ROOM;
    const fitting = room / layoutRef.current.width;
    return atScale(fitting >= 0.75 ? Math.min(1, fitting) : 0.75);
  };

  // 처음 보기인데 키보드 포커스가 간 사건이 화면 밖이면 가로로만 옮겨 보이게 한다 — 키보드 포커스는 늘 보인다
  // (EXPERIENCE.md Accessibility Floor). 키보드로 패널을 닫으면 화면이 닫은 사건 노드에 포커스를 준다(IssuePage)
  const openingShowing = (event: PlacedEvent | undefined) => {
    const start = opening();
    if (!event) return start;
    const x = start.applyX(GUTTER + event.x);
    if (x >= GUTTER + 20 && x <= sizeRef.current.width - LABEL_ROOM)
      return start;
    const target = GUTTER + (sizeRef.current.width - GUTTER) * 0.45;
    return atScale(start.k, target - (GUTTER + event.x) * start.k);
  };

  // 처음 — 처음 보기에 두고, 고른 사건이 있으면 보이게.
  // 처음 그릴 때는 자리 폭을 아직 못 재서 어림값(FALLBACK_SIZE)으로 맞춘다. 진짜 폭을 재면 한 번 더 맞춘다
  const startedWidth = useRef<number | null>(null);
  useEffect(() => {
    const first = startedWidth.current === null;
    const remeasured = startedWidth.current === 0 && measured.width > 0;
    if (!first && !remeasured) return;
    startedWidth.current = measured.width;
    apply(opening(), 0);
    const selected = layoutRef.current.events.find(
      (event) => event.id === selectedId,
    );
    if (selected) keepInView(selected, 0);
    // 폭을 잰 때만 — 그 뒤 고르기는 아래 효과가 맡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured.width]);

  // 주소의 ?event= 로 고른 사건이 바뀌거나 타임라인 폭이 바뀌면(옆에 사건 패널이 열려 좁아지는 등) 보이게 옮긴다.
  // 사건 패널을 닫으면(고른 사건이 없어지면) 처음 보기로 돌아간다 — 사건을 보이려고 옮긴 자리에 멈추지 않게.
  // 닫은 바로 뒤 패널이 빠져 폭이 넓어지면 그 폭으로 한 번 더 맞춘다 (2026-11-12 사용자 QA, Jira 197)
  useEffect(() => {
    if (startedWidth.current === null) return;
    const closed = shownId.current !== null && selectedId === null;
    shownId.current = selectedId;
    if (selectedId === null) {
      const focused = layoutRef.current.events.find(
        (event) => event.id === focusId,
      );
      if (closed || reopening.current) apply(openingShowing(focused));
      reopening.current = closed;
      return;
    }
    reopening.current = false;
    const selected = layoutRef.current.events.find(
      (event) => event.id === selectedId,
    );
    if (selected) keepInView(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, measured.width]);

  // 사건 고르기 — 어느 레인의 몇째 사건을 마우스 · 키보드로 골랐는지 GA 로 보낸다.
  // 몇째는 시간순(왼쪽부터) 자리다. 이슈는 주소(/issues/:id)로 GA 가 따로 안다
  const selectEvent = (placed: PlacedEvent, via: "click" | "keyboard") => {
    track("timeline_node_click", {
      lane: placed.lane,
      position: layout.events.filter((other) => other.x < placed.x).length + 1,
      total: events.length,
      via,
    });
    onSelect(placed.id);
  };

  const onNodeKeyDown = (event: KeyboardEvent, placed: PlacedEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectEvent(placed, "keyboard");
  };

  // 라벨 — 같은 레인 오른쪽 이웃 노드까지 64px 이상 남으면 오른쪽, 아니면 노드 아래 (프로토타입).
  // 오른쪽 라벨은 노드 가운데보다 6px 아래에서 시작한다 — 메인 흐름 선이 글자를 지나가지 않게
  const mainLaneBox = layout.lanes.find((lane) => lane.key === "MAIN");
  const railY = mainLaneBox ? mainLaneBox.top + mainLaneBox.nodeY : null;
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
    // 메인 흐름 레인 선 위 사건은 라벨을 선 밑에 둔다. 선에서 벗어난 사건(쌓인 사건 · 서브 흐름)은 이름 줄을 사건 가운데에 맞춘다 —
    // 쌓였을 때 라벨이 자기 사건 옆에 오게 (Jira 188, 쌓는 간격은 timelineLayout 의 stackOffset)
    const onRail = event.lane === "MAIN" && event.y === railY;
    if (room >= 72)
      return {
        dx: r + 8,
        dy: onRail ? 6 : -8,
        width: Math.min(room, 210),
        below: false,
      };
    const nextX = neighbors.length ? Math.min(...neighbors) + 18 : width - 16;
    return {
      dx: -r - 4,
      dy: r + 10,
      width: Math.max(40, Math.min(nextX - (x - r - 4), 190)),
      below: true,
    };
  };

  // 사건이 나오는 때 — 메인 흐름 처음 ~ 끝 사이에서 몇째 자리인지로 정한다. 배치가 폭에 맞춰 늘어나도 그 비율은 같아서
  // 차례가 바뀌지 않는다. 확대 · 이동은 배치를 바꾸지 않는다
  const sweep = useMemo(() => {
    const mains = layout.events.filter((event) => event.lane === "MAIN");
    const span = mains.length > 1 ? mains : layout.events;
    const x0 = Math.min(...span.map((event) => event.x));
    const x1 = Math.max(...span.map((event) => event.x));
    const duration = Math.min(
      SWEEP_MAX,
      SWEEP_PER_EVENT * layout.events.length,
    );
    const at = (x: number) =>
      SWEEP_START +
      (x1 > x0 ? Math.min(1, Math.max(0, (x - x0) / (x1 - x0))) : 0) * duration;
    return { at, duration };
  }, [layout]);
  const enterOf = (event: PlacedEvent) =>
    openedIds.has(event.id)
      ? Math.round(sweep.at(event.x) + (event.lane === "SUB" ? SUB_AFTER : 0))
      : 0;
  // 칩은 그 칸의 마지막 사건 바로 뒤에 그린다 — Tab 차례가 그 칸 사건 다음이 되게
  const foldAfter = new Map(
    layout.folds.map((fold) => {
      const stacked = layout.events.filter(
        (event) => event.lane === fold.lane && event.x === fold.x,
      );
      return [stacked[stacked.length - 1]?.id, fold] as const;
    }),
  );
  const onFoldKeyDown = (event: KeyboardEvent, fold: StackFold) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleFold(fold);
  };
  // 「+7건」 · 「접기」 칩 — 그 칸 사건 노드의 왼쪽 끝에 맞춰 알약으로 그린다
  const foldChip = (fold: StackFold) => {
    const text = fold.expanded ? "접기" : `+${fold.hidden}건`;
    const chipWidth = Math.round(textWidth(text, 13) + 20);
    const left = screenX(fold.x) - (fold.lane === "MAIN" ? 10 : 8);
    const where = `${fold.dateLabel} ${LANE_NAME[fold.lane]} 사건`;
    return (
      <g
        key={`fold-${fold.key}`}
        transform={`translate(${left},${fold.y})`}
        role="button"
        tabIndex={0}
        data-fold={fold.key}
        aria-expanded={fold.expanded}
        aria-label={
          fold.expanded ? `${where} 접기` : `${where} ${fold.hidden}건 더 보기`
        }
        className="group/fold cursor-pointer outline-none"
        onClick={(mouse) => {
          mouse.stopPropagation();
          toggleFold(fold);
        }}
        onKeyDown={(key) => onFoldKeyDown(key, fold)}
        onFocus={() => {
          if (keyboardInput.current) setFocusFold(fold.key);
        }}
        onBlur={() => setFocusFold(null)}
      >
        <rect
          x={0}
          y={-12}
          width={chipWidth}
          height={24}
          rx={12}
          strokeWidth={1}
          className="fill-bg-layer-default stroke-stroke-neutral-weak transition-[fill] duration-[var(--seed-duration-color-transition)] group-hover/fold:fill-bg-neutral-weak"
        />
        <text
          x={chipWidth / 2}
          y={1}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-fg-neutral-muted text-[0.8125rem] font-bold tabular-nums"
        >
          {text}
        </text>
        {focusFold === fold.key && (
          <rect
            x={-3}
            y={-15}
            width={chipWidth + 6}
            height={30}
            rx={15}
            strokeWidth={2}
            className="fill-none stroke-stroke-focus-ring"
          />
        )}
      </g>
    );
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
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-r3 border border-stroke-neutral-subtle"
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
        {viewSwitch}
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
        {/* 용어사전 안내 — TIP 왼쪽 (2026-11-12 사용자 QA, Jira 197) */}
        <MeaningGuide />
        {tip.button}
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
          onClick={(mouse) => {
            if (!isTextDragClick(mouse)) onDeselect();
          }}
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
                  style={enterAt(Math.round(sweep.at(month.x)))}
                  className={`pointer-events-none stroke-stroke-neutral-weak ${FADE_IN}`}
                />
              ))}
            {/* 메인 흐름 레인 선 — 사건 사이 관계가 아니라 레인 자리다 (DESIGN.md timeline-rail) */}
            {mainXs.length > 1 && (
              <line
                data-rail
                x1={Math.min(...mainXs)}
                x2={Math.max(...mainXs)}
                y1={mainLane.top + mainLane.nodeY}
                y2={mainLane.top + mainLane.nodeY}
                pathLength={1}
                strokeWidth={2}
                style={{
                  animationDelay: `${SWEEP_START}ms`,
                  animationDuration: `${sweep.duration}ms`,
                  animationTimingFunction: "linear",
                }}
                className={`pointer-events-none stroke-stroke-brand-weak ${DRAW}`}
              />
            )}
            {layout.events.map((event) => {
              const x = screenX(event.x);
              const r = radiusOf(event);
              const main = event.lane === "MAIN";
              const isSelected = event.id === selectedId;
              const isHovered = event.id === hoverId;
              const isFocused = event.id === focusId;
              const isLatest = event.id === latestId;
              const label = labelOf(event);
              const shown = fitText(event.label, label.width, NAME_SIZE);
              const meta = joined(dateText(event), articlesText(event));
              const enter = enterOf(event);
              const fold = foldAfter.get(event.id);
              return (
                <Fragment key={event.id}>
                  <g
                    transform={`translate(${x},${event.y})`}
                    role="button"
                    data-coach="event"
                    tabIndex={0}
                    data-event-id={event.id}
                    data-latest={isLatest || undefined}
                    aria-current={isSelected ? "true" : undefined}
                    aria-label={[
                      `${dateText(event)} ${event.title}`,
                      LANE_NAME[event.lane],
                      articlesText(event),
                      isLatest ? "최신 사건" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    className="cursor-pointer outline-none"
                    onClick={(mouse) => {
                      mouse.stopPropagation();
                      // 사건 이름을 드래그한 끝의 클릭(용어사전)은 사건 고르기가 아니다
                      if (!isTextDragClick(mouse)) selectEvent(event, "click");
                    }}
                    onKeyDown={(key) => onNodeKeyDown(key, event)}
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
                    {/* 선 끝이 지나갈 때 튀어나온다 */}
                    <g className={SPRING_IN} style={enterAt(enter)}>
                      {/* 고르면 채움은 그대로 두고 옅은 민트 바탕 · 짙은 청록 고리가 튀어나오며 둘레에 파문이 번진다.
                        전에는 노드를 짙은 청록으로 채워 최신 사건과 헷갈렸다 (2026-11-16 디자인 피드백, Jira 216) */}
                      {isSelected && (
                        <>
                          <rect
                            x={-r}
                            y={-r}
                            width={2 * r}
                            height={2 * r}
                            rx={3}
                            fill="none"
                            strokeWidth={2}
                            className={`stroke-bg-brand-solid ${RIPPLE_ONCE}`}
                          />
                          <rect
                            data-selected-ring
                            x={-r - 5}
                            y={-r - 5}
                            width={2 * r + 10}
                            height={2 * r + 10}
                            rx={5}
                            strokeWidth={2}
                            className={`fill-bg-brand-weak stroke-bg-brand-solid ${SPRING_IN}`}
                          />
                        </>
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
                      {/* 마우스를 올리면 넘치며 커진다 (프로토타입 v21 1.15배) */}
                      <g
                        className={`${HOVER_SPRING} ${isHovered && !isSelected ? "motion-safe:scale-[1.15]" : ""}`}
                      >
                        <rect
                          data-node
                          x={-r}
                          y={-r}
                          width={2 * r}
                          height={2 * r}
                          rx={3}
                          strokeWidth={main ? 3 : 2}
                          className={`transition-[fill,stroke] duration-[var(--seed-duration-color-transition)] ${
                            isLatest
                              ? "fill-bg-brand-solid stroke-palette-static-white"
                              : main
                                ? "fill-bg-brand-accent stroke-palette-static-white"
                                : "fill-palette-static-white stroke-palette-gray-600"
                          }`}
                        />
                      </g>
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
                    </g>
                    {/* 라벨은 사건이 나온 뒤 떠오른다 — 자리를 잡는 transform 과 움직임을 다른 묶음에 둔다.
                      라벨도 누르는 영역이다 — 전에는 노드 둘레만 눌려 제목 · 날짜를 눌러도 사건이 안 열렸다 (2026-11-05 UI 점검) */}
                    <g transform={`translate(${label.dx},${label.dy})`}>
                      <g className={RISE} style={enterAt(enter + LABEL_AFTER)}>
                        {/* 글자 사이 빈 곳도 받게 라벨 칸 전체를 투명하게 덮는다 */}
                        <rect
                          x={-4}
                          y={-3}
                          width={label.width + 8}
                          height={40}
                          className="fill-transparent"
                        />
                        {label.below && (
                          <rect
                            x={-4}
                            y={-3}
                            width={label.width + 8}
                            height={40}
                            rx={6}
                            className="fill-bg-layer-default opacity-95"
                          />
                        )}
                        {/* 사건 이름은 드래그 대상이다(용어사전). 칸에 맞춰 「…」로 줄였으면 그 표시를 준다 */}
                        <text
                          dominantBaseline="hanging"
                          className={`cursor-text stroke-bg-layer-default text-[0.9375rem] select-text ${isSelected ? "fill-fg-brand font-bold" : main ? "fill-fg-neutral font-bold" : "fill-fg-neutral font-semibold"}`}
                          paintOrder="stroke"
                          strokeWidth={4}
                          strokeLinejoin="round"
                          {...meaningProps(
                            "EVENT",
                            event.id,
                            shown !== event.label,
                          )}
                        >
                          {shown}
                        </text>
                        <text
                          y={19}
                          dominantBaseline="hanging"
                          className="fill-fg-neutral-muted stroke-bg-layer-default text-[0.8125rem] tabular-nums"
                          paintOrder="stroke"
                          strokeWidth={4}
                          strokeLinejoin="round"
                        >
                          {label.width >= 110 ? meta : dateText(event)}
                        </text>
                      </g>
                    </g>
                  </g>
                  {fold && foldChip(fold)}
                </Fragment>
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
                    style={enterAt(Math.round(sweep.at(month.x)))}
                    className={`fill-fg-neutral-muted text-[0.75rem] font-bold ${FADE_IN}`}
                  >
                    {month.label}
                  </text>
                </g>
              ))}
              {selected && (
                <g
                  key={selected.id}
                  transform={`translate(${screenX(selected.x)},${layout.axisY + 2})`}
                >
                  <g className={SPRING_IN}>
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
                    style={enterAt(LANE_BAR_AT)}
                    className={`[transform-box:fill-box] ${GROW_Y} ${
                      main ? "fill-bg-brand-accent" : "fill-palette-gray-500"
                    }`}
                  />
                  <text
                    x={28}
                    y={y - 2}
                    style={enterAt(LANE_TEXT_AT)}
                    className={`${FADE_IN} font-extrabold text-[0.8125rem] ${main ? "fill-fg-neutral" : "fill-fg-neutral-muted"}`}
                  >
                    {lane.name}
                  </text>
                  <text
                    x={28}
                    y={y + 15}
                    style={enterAt(LANE_TEXT_AT)}
                    className={`${FADE_IN} fill-fg-neutral-subtle tabular-nums text-[0.75rem]`}
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
            key={tipEvent.id}
            role="tooltip"
            className={`pointer-events-none absolute z-10 max-w-[260px] rounded-r3 border border-stroke-neutral-weak bg-bg-layer-floating px-x3 py-x2 shadow-s2 ${FADE_IN}`}
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
        {tip.panel}
      </div>
      {/* 그냥 휠을 처음 굴렸을 때 — 지도 칸 아래 가운데. 스크롤해도 제자리에 있게 스크롤 칸 밖에 둔다 */}
      <p
        role="status"
        className="pointer-events-none absolute inset-x-0 bottom-[16px] z-20 flex justify-center"
      >
        {wheelHint && (
          <span
            className={`t4-medium block whitespace-nowrap rounded-full border border-stroke-neutral-weak bg-bg-layer-floating px-x4 py-x2 text-fg-neutral shadow-s2 ${FADE_IN}`}
          >
            Ctrl+휠(맥은 ⌘+휠)로 확대 · 축소해요
          </span>
        )}
      </p>
    </section>
  );
}
