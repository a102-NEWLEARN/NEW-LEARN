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
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionButton } from "seed-design/ui/action-button";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { BRANCHES } from "@/components/article/branches";
import {
  BRANCH_LABEL_GAP,
  BRANCH_NAME_FONT,
  BRANCH_QUESTION_FONT,
  BRANCH_RADIUS,
  boundsOf,
  branchLabelWidth,
  type Box,
  LEAF_FONT,
  LEAF_LINE,
  LEAF_RADIUS,
  LEAF_TEXT_GAP,
  layoutMindmap,
  type PlacedBranch,
  ROOT_FONT,
  ROOT_LINE,
  ROOT_RADIUS,
  ROOT_RING,
} from "@/components/article/mindmapLayout";
import {
  DRAW,
  enterAt,
  FLOAT,
  floatPhase,
  FLOW,
  FLY_OUT,
  flyFrom,
  HOVER_SPRING,
  POP_ONCE,
  RIPPLE_LOOP,
  RIPPLE_ONCE,
  SPRING_IN,
} from "@/components/motion/screenMotion";
import { useElementSize } from "@/components/issue/useElementSize";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";
import { useKeyboardInput } from "@/components/useKeyboardInput";
import { prefersReducedMotion } from "@/lib/motion";

// 확대 · 축소 범위와 버튼 한 번의 배율 (프로토타입 v21 useZoom · ZoomControls)
const SCALE_EXTENT: [number, number] = [0.25, 3];
const ZOOM_OUT = 0.8;
const ZOOM_IN = 1.25;
// 화면에 맞추기는 여백 24 · 1.15배까지, 가지 포커스는 여백 64 · 1.7배까지 (프로토타입 v21)
const FIT_ALL = { padding: 24, max: 1.15 };
const FIT_BRANCH = { padding: 64, max: 1.7 };
// 좁은 화면에서 전체에 맞출 때의 배율 범위 — 다 넣으려고 줄이면 글자를 못 읽는다 (모바일 프로토타입 v1)
const NARROW_FIT = { min: 0.72, max: 1 };
// 잴 수 없을 때(jsdom) 쓰는 그래프 자리 크기
const FALLBACK_SIZE = { width: 960, height: 560 };
// 키보드로 옮긴 노드가 가장자리에서 이만큼 안쪽에 있어야 보인다고 친다
const VIEW_MARGIN = 48;
// 포커스한 가지 밖은 흐리게 + 살짝 번지게 (프로토타입 v21)
const DIMMED_OPACITY = 0.22;
// 마우스를 올린 노드와 이어지지 않은 것은 흐리게 — 포커스 흐림보다 옅게 둬서 글이 비친다 (프로토타입 v21 은 0.16)
const HOVER_FADED_OPACITY = 0.25;
// 열 때 나오는 차례(ms) — 가운데가 튀어나오고, 가지가 가운데에서 · 잎이 그 가지에서 날아 나온다.
// 선은 날아가는 노드와 같은 때 · 같은 곡선으로 뻗어 선 끝이 노드를 따라간다. 가지는 A9 순서로 90ms, 잎은 50ms 간격
// (프로토타입 v21 은 힘 시뮬레이션으로 가운데에서 퍼진다 — 여기서는 같은 모양을 정해진 길로 낸다). 길이는 components/motion/screenMotion.ts
const BRANCH_AT = (index: number) => 180 + index * 90;
const LEAF_AFTER = 380;
const LEAF_GAP = 50;
// 잎이 많아도 다 나오기까지 2초가 안 걸리게 — 여섯째 잎부터는 다섯째와 같이 나온다
const LEAF_STAGGER_MAX = 5;
const leafAt = (j: number) => Math.min(j, LEAF_STAGGER_MAX) * LEAF_GAP;
// 가운데 원의 파문 — 튀어나올 때 한 번, 다 나온 뒤부터 3초마다
const ROOT_RIPPLE_AT = 250;
const ROOT_PULSE_AT = 1800;
// 마우스를 올린 길 위로 흐르는 점선 무늬 — 흰 3 · 빈 9, 한 칸 12 를 newlearn-flow 가 민다
const FLOW_DASH = "3 9";
// 전망 가지의 잎은 점선 — 사실이 아니라 앞으로의 전망 · 해석이다 (Jira S15P31A102-58)
const OUTLOOK_DASH = "3 2.4";
// 글자 둘레에 바탕색 테두리를 둘러 선 위에서도 읽히게 한다
const HALO = { paintOrder: "stroke", strokeLinejoin: "round" } as const;

type Size = { width: number; height: number };

/** 상자가 화면 가운데 들어오는 확대 · 이동 */
function fitTransform(
  box: Box,
  size: Size,
  { padding, max }: { padding: number; max: number },
) {
  const [min, extentMax] = SCALE_EXTENT;
  const k = Math.max(
    min,
    Math.min(
      max,
      extentMax,
      (size.width - 2 * padding) / Math.max(1, box.x1 - box.x0),
      (size.height - 2 * padding) / Math.max(1, box.y1 - box.y0),
    ),
  );
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return zoomIdentity
    .translate(size.width / 2 - k * cx, size.height / 2 - k * cy)
    .scale(k);
}

type MindmapGraphProps = {
  /** 가운데 글자 — A9 title(지금은 기사 제목) */
  title: string;
  /** A9 가지 — 내용이 있는 것만 온다 */
  branches: MindmapBranch[];
  /** 범례에서 끈 가지 — 그 가지 · 잎 · 선을 그리지 않는다. 나머지 가지는 제자리다 */
  hidden?: ReadonlySet<BranchType>;
  /** 잎 글을 늘 보이나. 끄면 강조 · 키보드 포커스 · 마우스를 올린 잎만 글을 보인다 */
  showLabels?: boolean;
};

const NONE_HIDDEN: ReadonlySet<BranchType> = new Set();
// 잎 키(「CORE-0」)의 가지
const branchOfLeaf = (key: string) => key.split("-")[0] as BranchType;

/** 마우스를 올린 노드 — 가지면 잎이 없고, 잎이면 그 잎 키 */
type Hover = { type: BranchType; leaf: string | null } | null;

// F04 기사 마인드맵 생성의 마인드맵 보기 — 가운데 기사 제목, 네 방향 가지, 가지 바깥쪽 잎 (프로토타입 v21 MindmapGraph).
// 자리는 mindmapLayout 이 정하고 여기서는 그린다. 확대 · 이동은 d3-zoom 이 맡는다.
// 가지를 누르면 그 가지만 화면에 맞추고 나머지는 흐리게, 잎을 누르면 그 잎을 강조한다 (EXPERIENCE.md 보기 탭).
// 노드 상세 카드는 띄우지 않는다 (S15P31A102-59)
export function MindmapGraph({
  title,
  branches,
  hidden = NONE_HIDDEN,
  showLabels = true,
}: MindmapGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const measured = useElementSize(wrapRef);
  const width = measured.width || FALLBACK_SIZE.width;
  const height = measured.height || FALLBACK_SIZE.height;
  const layout = useMemo(
    () =>
      layoutMindmap(
        title,
        branches.filter((branch) => !hidden.has(branch.type)),
      ),
    [title, branches, hidden],
  );

  // 포커스한 가지 · 강조한 잎 · 키보드로 포커스한 노드(테두리를 띄운다) · 마우스를 올린 잎
  const [focusType, setFocusType] = useState<BranchType | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<string | null>(null);
  const [ringKey, setRingKey] = useState<string | null>(null);
  const [pointerHover, setHover] = useState<Hover>(null);
  const keyboardInput = useKeyboardInput();
  // 가지를 포커스한 동안에는 그 가지 안의 호버만 친다 — 흐린 가지에 마우스를 올려 포커스한 가지까지 흐려지지 않게
  const hover =
    pointerHover && (focusType === null || pointerHover.type === focusType)
      ? pointerHover
      : null;
  // 키보드로 포커스한 노드의 가지 — 가지 포커스로 흐리지 않는다. 키보드 포커스는 늘 보인다 (EXPERIENCE.md Accessibility Floor)
  const ringBranch =
    ringKey === null
      ? null
      : ringKey.startsWith("branch-")
        ? (ringKey.slice("branch-".length) as BranchType)
        : branchOfLeaf(ringKey);

  // 범례에서 가지를 끄면 그 가지에 걸린 포커스 · 강조 · 호버를 푼다 — 다시 켜도 되살리지 않는다.
  // 숨긴 노드에서는 마우스가 떠났다는 알림(pointerleave)이 오지 않아서 호버도 여기서 푼다
  const [seenHidden, setSeenHidden] = useState(hidden);
  if (hidden !== seenHidden) {
    setSeenHidden(hidden);
    if (focusType && hidden.has(focusType)) setFocusType(null);
    if (selectedLeaf && hidden.has(branchOfLeaf(selectedLeaf)))
      setSelectedLeaf(null);
    if (pointerHover && hidden.has(pointerHover.type)) setHover(null);
  }

  // 마우스 · 펜을 올린 노드. 터치는 누르면 마우스 흉내가 와서 강조와 겹쳐 흐려진 채 남으므로 받지 않는다
  const hoverProps = (next: Hover) => ({
    onPointerEnter: (pointer: PointerEvent) => {
      if (pointer.pointerType !== "touch") setHover(next);
    },
    onPointerLeave: () => setHover(null),
  });
  // 마우스를 올린 노드와 이어진 것만 또렷이 둔다 — 가운데에서 그 노드까지의 길, 가지면 그 잎들까지 (프로토타입 v21)
  const branchLit = (type: BranchType) => !hover || hover.type === type;
  const leafLit = (type: BranchType, key: string) =>
    !hover ||
    (hover.type === type && (hover.leaf === null || hover.leaf === key));
  const selectedBranch = selectedLeaf ? branchOfLeaf(selectedLeaf) : null;

  // d3-zoom 과 이벤트 처리가 그때그때 읽는 최신 크기 · 배치 · 포커스 · 좁은 화면인지. 그린 뒤 옮겨 둔다
  const narrow = useMediaQuery(NARROW_SCREEN);
  const sizeRef = useRef<Size>({ width, height });
  const layoutRef = useRef(layout);
  const focusRef = useRef(focusType);
  const narrowRef = useRef(narrow);
  useLayoutEffect(() => {
    sizeRef.current = { width, height };
    layoutRef.current = layout;
    focusRef.current = focusType;
    narrowRef.current = narrow;
  }, [width, height, layout, focusType, narrow]);

  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  // − · + 버튼이 노리는 배율. 움직임이 끝나면 비운다
  const targetScale = useRef<number | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  // d3-zoom 을 한 번 붙인다. 크기는 그때그때 읽는다 — jsdom 은 SVG 크기를 못 재서 extent 를 직접 준다.
  // 처음 그리기 전에 화면에 맞추려고 레이아웃 효과로 붙인다
  useLayoutEffect(() => {
    const svg = svgRef.current!;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      // 누르는 동안 손이 조금 떨려도(3px 까지) 끌기가 아니라 누르기로 친다
      .clickDistance(3)
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
  // 전체나 그 가지가 다 들어오게 맞춘다.
  // 좁은 화면의 전체는 배율을 NARROW_FIT 으로 묶고 가운데 기사 제목(원점)을 화면 가운데에 둔다 — 다 안 들어올 수 있다
  const fitTo = (type: BranchType | null, duration = 300) => {
    const fitted = fitTransform(
      boundsOf(layoutRef.current, type ?? undefined),
      sizeRef.current,
      type ? FIT_BRANCH : FIT_ALL,
    );
    if (type || !narrowRef.current) return apply(fitted, duration);
    const k = Math.min(NARROW_FIT.max, Math.max(NARROW_FIT.min, fitted.k));
    const { width: w, height: h } = sizeRef.current;
    apply(zoomIdentity.translate(w / 2, h / 2).scale(k), duration);
  };

  // 처음 그릴 때와 그래프 자리 크기가 바뀔 때 — 지금 보는 것(전체 · 포커스한 가지)에 다시 맞춘다
  useLayoutEffect(() => {
    fitTo(focusRef.current, 0);
    // 크기가 바뀐 때만 — 포커스가 바뀔 때는 아래 효과가 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // 포커스가 바뀌면(누르기 · 빈 곳 · Esc · 가지 끄기) 그 가지나 전체에 맞춘다. 처음 그릴 때는 위 효과가 맞춘다
  const focusSeen = useRef(focusType);
  useLayoutEffect(() => {
    if (focusSeen.current === focusType) return;
    focusSeen.current = focusType;
    fitTo(focusType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusType]);

  const focusBranch = (type: BranchType) =>
    setFocusType((current) => (current === type ? null : type));
  const toggleLeaf = (key: string) =>
    setSelectedLeaf((current) => (current === key ? null : key));
  // 포커스 · 강조를 풀고 전체로 — 빈 곳 · Esc
  const releaseAll = () => {
    setFocusType(null);
    setSelectedLeaf(null);
  };
  // 화면에 맞추기 — 포커스 중이면 포커스를 풀어 전체로 간다. 강조한 잎은 그대로 둔다
  const fitAll = () => {
    if (focusType) setFocusType(null);
    else fitTo(null);
  };

  // Esc — 포커스 · 강조를 푼다. 설정 팝오버처럼 먼저 받은 쪽이 preventDefault 했거나,
  // 서랍처럼 다른 창(dialog) 안에서 누른 Esc 는 그쪽 몫이다 (EXPERIENCE.md Interaction Primitives)
  const active = focusType !== null || selectedLeaf !== null;
  const releaseRef = useRef(releaseAll);
  useLayoutEffect(() => {
    releaseRef.current = releaseAll;
  });
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing || key.defaultPrevented)
        return;
      if ((key.target as Element | null)?.closest?.('[role="dialog"]')) return;
      releaseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  // 키보드로 옮긴 노드가 화면 밖이면 가운데로 옮긴다. 배율은 그대로
  const keepInView = (x: number, y: number) => {
    const [sx, sy] = transformRef.current.apply([x, y]);
    const { width: w, height: h } = sizeRef.current;
    if (
      sx >= VIEW_MARGIN &&
      sx <= w - VIEW_MARGIN &&
      sy >= VIEW_MARGIN &&
      sy <= h - VIEW_MARGIN
    )
      return;
    const { k } = transformRef.current;
    apply(zoomIdentity.translate(w / 2 - k * x, h / 2 - k * y).scale(k));
  };
  // 노드 누르기 — 빈 곳 누르기(포커스 풀기)로 번지지 않게 막는다
  const onNodeClick = (mouse: MouseEvent, press: () => void) => {
    mouse.stopPropagation();
    press();
  };
  const onNodeKeyDown = (key: KeyboardEvent, press: () => void) => {
    if (key.key !== "Enter" && key.key !== " ") return;
    key.preventDefault();
    press();
  };
  // 키보드로 받은 포커스에만 테두리를 띄우고 화면 안으로 옮긴다
  // 키보드로 옮기면 마우스 호버는 놓는다 — 마우스가 머문 노드 때문에 키보드로 간 노드가 흐려지지 않게
  const onNodeFocus = (key: string, x: number, y: number) => {
    if (!keyboardInput.current) return;
    setRingKey(key);
    setHover(null);
    keepInView(x, y);
  };

  const renderBranch = (branch: PlacedBranch, index: number) => {
    const { type, x, y, side, leaves } = branch;
    const info = BRANCHES[type];
    const { tone } = info;
    const focused = focusType === type;
    const dimmed = focusType !== null && !focused && ringBranch !== type;
    const labelX = -side * (BRANCH_RADIUS + BRANCH_LABEL_GAP);
    const labelAnchor = side === 1 ? "end" : "start";
    const branchKey = `branch-${type}`;
    const hovered = hover?.type === type && hover.leaf === null;
    const lit = branchLit(type);
    const at = BRANCH_AT(index);
    // 이어 주는 선 — 마우스를 올린 노드 · 강조한 잎으로 가는 길이면 가지 테두리색으로 진하게
    const lineClass = (strong: boolean) =>
      `pointer-events-none transition-[stroke,opacity] duration-[var(--seed-duration-d4)] ${strong ? tone.stroke : tone.line} ${DRAW}`;
    return (
      <g
        key={type}
        role="group"
        aria-label={info.name}
        data-branch={type}
        data-dimmed={dimmed || undefined}
        opacity={dimmed ? DIMMED_OPACITY : 1}
        className={`transition-[opacity,filter] duration-[var(--seed-duration-d5)] motion-reduce:transition-none ${dimmed ? "blur-[1.5px]" : ""}`}
      >
        <line
          x1={0}
          y1={0}
          x2={x}
          y2={y}
          pathLength={1}
          strokeWidth={2.5}
          data-faded={!lit || undefined}
          opacity={lit ? 1 : HOVER_FADED_OPACITY}
          style={enterAt(at)}
          className={lineClass(hover?.type === type || selectedBranch === type)}
        />
        {/* 마우스를 올린 가지 · 그 잎으로 가는 길 위로 점선이 바깥쪽으로 흐른다 */}
        {hover?.type === type && (
          <line
            data-flow
            x1={0}
            y1={0}
            x2={x}
            y2={y}
            strokeWidth={2.5}
            strokeDasharray={FLOW_DASH}
            className={`pointer-events-none stroke-bg-layer-default ${FLOW}`}
          />
        )}
        {leaves.map((leaf, j) => {
          const leafOn = leafLit(type, leaf.key);
          return (
            <line
              key={leaf.key}
              x1={x}
              y1={y}
              x2={leaf.x}
              y2={leaf.y}
              pathLength={1}
              strokeWidth={2}
              data-faded={!leafOn || undefined}
              opacity={leafOn ? 1 : HOVER_FADED_OPACITY}
              style={enterAt(at + LEAF_AFTER + leafAt(j))}
              className={lineClass(
                (hover !== null && leafOn) || selectedLeaf === leaf.key,
              )}
            />
          );
        })}
        {hover !== null &&
          leaves
            .filter((leaf) => leafLit(type, leaf.key))
            .map((leaf) => (
              <line
                key={`flow-${leaf.key}`}
                data-flow
                x1={x}
                y1={y}
                x2={leaf.x}
                y2={leaf.y}
                strokeWidth={2}
                strokeDasharray={FLOW_DASH}
                className={`pointer-events-none stroke-bg-layer-default ${FLOW}`}
              />
            ))}
        <g
          transform={`translate(${x},${y})`}
          role="button"
          tabIndex={0}
          aria-pressed={focused}
          aria-label={`${info.name} · ${info.question} · 잎 ${leaves.length}개`}
          data-faded={!lit || undefined}
          opacity={lit ? 1 : HOVER_FADED_OPACITY}
          className="cursor-pointer outline-none transition-opacity duration-[var(--seed-duration-d4)]"
          onClick={(mouse) => onNodeClick(mouse, () => focusBranch(type))}
          onKeyDown={(key) => onNodeKeyDown(key, () => focusBranch(type))}
          onFocus={() => onNodeFocus(branchKey, x, y)}
          onBlur={() => setRingKey(null)}
          {...hoverProps({ type, leaf: null })}
        >
          <g className={FLY_OUT} style={flyFrom(-x, -y, at)}>
            {/* 누르는 영역을 노드보다 넓게 */}
            <circle r={BRANCH_RADIUS + 10} className="fill-transparent" />
            {/* 가지 이름도 누르는 면이다 — 글자 사이 틈을 눌러도 빈 곳이 되지 않게 글 영역을 깐다 */}
            <rect
              x={side === 1 ? labelX - branchLabelWidth(type) : labelX}
              y={-18}
              width={branchLabelWidth(type)}
              height={36}
              className="fill-transparent"
            />
            {/* 마우스를 올리면 커지고 둘레가 가지 채움색으로 찬다. 포커스하면 더 진하게 */}
            <g
              className={`${HOVER_SPRING} ${hovered ? "motion-safe:scale-[1.12]" : ""}`}
            >
              <circle
                r={BRANCH_RADIUS + 6}
                opacity={focused ? 1 : hovered ? 0.7 : 0}
                className={`transition-opacity duration-[var(--seed-duration-d4)] ${tone.fill}`}
              />
              <circle
                r={BRANCH_RADIUS}
                strokeWidth={2.5}
                className={`${tone.fill} ${tone.stroke}`}
              />
            </g>
            {ringKey === branchKey && (
              <circle
                r={BRANCH_RADIUS + 8}
                fill="none"
                strokeWidth={2}
                className="stroke-stroke-focus-ring"
              />
            )}
            <text
              textAnchor={labelAnchor}
              strokeWidth={4}
              style={HALO}
              className="stroke-bg-layer-default"
            >
              <tspan
                x={labelX}
                y={-3}
                fontSize={BRANCH_NAME_FONT}
                className={`font-bold ${tone.text}`}
              >
                {info.name}
              </tspan>
              <tspan
                x={labelX}
                y={14}
                fontSize={BRANCH_QUESTION_FONT}
                className="fill-fg-neutral-muted font-medium"
              >
                {info.question}
              </tspan>
            </text>
          </g>
        </g>
        {leaves.map((leaf, j) => {
          const selected = selectedLeaf === leaf.key;
          const leafHovered = hover?.leaf === leaf.key;
          const leafOn = leafLit(type, leaf.key);
          const textX = side * (LEAF_RADIUS + LEAF_TEXT_GAP);
          const textWidth =
            Math.max(...leaf.lines.map((line) => line.length)) * LEAF_FONT;
          const cut = leaf.lines.at(-1)?.endsWith("…");
          // 라벨 표시를 꺼도 강조 · 키보드 포커스 · 마우스를 올린 잎은 글을 보인다 (프로토타입 v21 그래프 설정)
          const labeled =
            showLabels || selected || ringKey === leaf.key || leafHovered;
          return (
            <g
              key={leaf.key}
              transform={`translate(${leaf.x},${leaf.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={leaf.text}
              data-faded={!leafOn || undefined}
              opacity={leafOn ? 1 : HOVER_FADED_OPACITY}
              className="cursor-pointer outline-none transition-opacity duration-[var(--seed-duration-d4)]"
              onClick={(mouse) =>
                onNodeClick(mouse, () => toggleLeaf(leaf.key))
              }
              onKeyDown={(key) =>
                onNodeKeyDown(key, () => toggleLeaf(leaf.key))
              }
              onFocus={() => onNodeFocus(leaf.key, leaf.x, leaf.y)}
              onBlur={() => setRingKey(null)}
              {...hoverProps({ type, leaf: leaf.key })}
            >
              {labeled && cut && <title>{leaf.text}</title>}
              {/* 둥실 떠 있다 — 잎마다 박자를 달리한다. 그 안에서 가지 자리에서 날아 나온다 */}
              <g className={FLOAT} style={floatPhase(index * 7 + j)}>
                <g
                  className={FLY_OUT}
                  style={flyFrom(
                    x - leaf.x,
                    y - leaf.y,
                    at + LEAF_AFTER + leafAt(j),
                  )}
                >
                  <circle r={LEAF_RADIUS + 10} className="fill-transparent" />
                  {/* 잎 글도 누르는 면이다 — 줄 사이 틈을 눌러도 빈 곳이 되지 않게 글 영역을 깐다 */}
                  {labeled && (
                    <rect
                      x={side === 1 ? textX : textX - textWidth}
                      y={(-leaf.lines.length * LEAF_LINE) / 2}
                      width={textWidth}
                      height={leaf.lines.length * LEAF_LINE}
                      className="fill-transparent"
                    />
                  )}
                  {/* 강조하면 둘레에 파문이 한 번 번진다 */}
                  {selected && (
                    <circle
                      r={LEAF_RADIUS}
                      fill="none"
                      strokeWidth={2}
                      className={`${tone.stroke} ${RIPPLE_ONCE}`}
                    />
                  )}
                  {/* 마우스를 올리면 넘치며 커진다. 강조하면 테두리색으로 차며 한 번 튄다 */}
                  <g
                    className={`${HOVER_SPRING} ${leafHovered && !selected ? "motion-safe:scale-[1.12]" : ""}`}
                  >
                    <circle
                      data-leaf-mark
                      r={LEAF_RADIUS}
                      strokeWidth={2.5}
                      strokeDasharray={
                        type === "OUTLOOK" ? OUTLOOK_DASH : undefined
                      }
                      className={`transition-[fill] duration-[var(--seed-duration-color-transition)] ${selected ? `${tone.solid} ${POP_ONCE}` : "fill-bg-layer-default"} ${tone.stroke}`}
                    />
                  </g>
                  {ringKey === leaf.key && (
                    <circle
                      r={LEAF_RADIUS + 6}
                      fill="none"
                      strokeWidth={2}
                      className="stroke-stroke-focus-ring"
                    />
                  )}
                  {/* 잎 글은 한 단계 옅게 두고, 마우스를 올리거나 강조하면 진하게 (프로토타입 v21) */}
                  {labeled && (
                    <text
                      textAnchor={side === 1 ? "start" : "end"}
                      fontSize={LEAF_FONT}
                      strokeWidth={4}
                      style={HALO}
                      className={`stroke-bg-layer-default transition-[fill] duration-[var(--seed-duration-color-transition)] ${selected || leafHovered ? "fill-fg-neutral" : "fill-fg-neutral-muted"} ${selected ? "font-bold" : "font-medium"}`}
                    >
                      {leaf.lines.map((line, i) => (
                        <tspan
                          key={i}
                          x={textX}
                          y={(i - (leaf.lines.length - 1) / 2) * LEAF_LINE + 4}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                </g>
              </g>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div
      ref={wrapRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-bg-layer-default [background-image:radial-gradient(var(--seed-color-stroke-neutral-weak)_1px,transparent_1px)] [background-size:24px_24px]"
    >
      {/* 확대 버튼 — 탭 순서가 그래프 노드보다 앞이게 svg 앞에 둔다. 위치 클래스(left-x4 등)는 SEED 테마에 없어 px 로 준다 */}
      <div className="absolute bottom-[16px] left-[16px] flex items-center gap-x2">
        <div
          role="group"
          aria-label="확대 · 축소"
          className="flex h-x9 items-center rounded-r2 border border-stroke-neutral-weak bg-bg-layer-default p-[2px]"
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
          className="border-stroke-neutral-weak bg-bg-layer-default"
          onClick={fitAll}
        >
          화면에 맞추기
        </ActionButton>
      </div>
      <svg
        ref={svgRef}
        role="group"
        aria-label="기사 마인드맵"
        width="100%"
        height="100%"
        className="block cursor-grab touch-none select-none"
        onClick={releaseAll}
      >
        <g transform={transform.toString()}>
          {layout.branches.map(renderBranch)}
          {/* 가운데 — 기사 제목. 가지 선이 끝나는 자리를 덮게 맨 나중에 그린다. 열면 가장 먼저 튀어나온다.
              바로 위 h1 과 같은 글이라 화면 낭독에서 뺀다 */}
          <g aria-hidden="true">
            {/* 파문 — 튀어나올 때 한 번, 다 나온 뒤부터 3초마다. 꾸밈이라 처음에는 보이지 않는다 */}
            <circle
              r={ROOT_RADIUS}
              fill="none"
              strokeWidth={2}
              style={enterAt(ROOT_RIPPLE_AT)}
              className={`stroke-bg-brand-accent ${RIPPLE_ONCE}`}
            />
            <circle
              r={ROOT_RADIUS}
              fill="none"
              strokeWidth={2}
              style={enterAt(ROOT_PULSE_AT)}
              className={`stroke-bg-brand-accent ${RIPPLE_LOOP}`}
            />
            <g className={SPRING_IN} style={enterAt(0)}>
              <circle
                r={ROOT_RING}
                strokeWidth={1.5}
                className="fill-bg-layer-default stroke-stroke-neutral-weak"
              />
              <circle r={ROOT_RADIUS} className="fill-bg-brand-accent" />
              {layout.root.lines.at(-1)?.endsWith("…") && (
                <title>{title}</title>
              )}
              <text
                textAnchor="middle"
                fontSize={ROOT_FONT}
                strokeWidth={5}
                style={HALO}
                className="pointer-events-none fill-fg-neutral stroke-bg-layer-default font-bold"
              >
                {layout.root.lines.map((line, i) => (
                  <tspan key={i} x={0} y={ROOT_RING + 22 + i * ROOT_LINE}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
