import type { TimelineEvent, TimelineLane } from "@/api/timeline";
import { formatTimelineDates } from "@/lib/date";

// 이슈 타임라인 배치 — 사건마다 레인 · 가로 · 세로 자리를 정한다. 그리기(Timeline.tsx)와 떼어 시험한다.
// 수치는 프로토타입 v21 LaneTimeline 을 따른다. 가로 자리는 확대 · 축소 전 값이고, 화면은 d3-zoom 으로 옮겨 그린다

/** 왼쪽 레인 이름 칸의 폭. 사건은 이 오른쪽에 그린다 */
export const GUTTER = 140;
/** 맨 아래 시간축 높이 */
export const AXIS_HEIGHT = 46;
/** 마지막 사건 오른쪽에 라벨이 들어갈 자리. 화면이 넓으면 이만큼 남기고 늘린다 — 처음 배율도 이 값으로 잰다(Timeline) */
export const RIGHT_ROOM = 200;
const FIRST_X = 40;
const LAST_ROOM = 140;
// 시각 차이에 비례하지 않는 간격 — 빈 기간이 길어도 화면을 낭비하지 않고, 같은 레인에서는 라벨이 겹치지 않게 넓게
const SAME_LANE_GAP = 170;
const OTHER_LANE_GAP = 110;
/**
 * 같은 시각 · 같은 레인 사건을 아래로 쌓는 간격 — 라벨 두 줄(36px) 사이에 12px 를 남긴다 (Jira 188 — 30px 로는 라벨이 맞닿아
 * 날짜 줄이 다음 사건 옆에 왔다). 라벨은 이름 줄을 사건 가운데에 맞춰 사건 가운데 − 8 ~ + 28 에 놓인다(Timeline.tsx).
 * 메인 흐름 레인 선 위 사건의 라벨만 선 밑(+ 6 ~ + 42)이라, 그 바로 아래 사건은 14px 더 벌린다.
 * 라벨 글자는 이름 15px · 날짜 13px 다 (2026-11-12 사용자 QA, Jira 197 — 13 · 12px 에서 키웠다)
 */
const STACK_GAP = 48;
const STACK_GAP_BELOW_RAIL = 62;
/** 선에서 벗어난 사건 라벨의 아래 끝(사건 가운데 기준) · 선 위 사건 라벨의 아래 끝 · 레인 아래 끝까지 남길 틈 */
const LABEL_BOTTOM = 28;
const RAIL_LABEL_BOTTOM = 42;
const LANE_BOTTOM_ROOM = 12;
/**
 * 같은 시각 · 같은 레인 사건이 이만큼 이상이면 SHOWN_IN_FOLD 건만 놓고 나머지는 「+N건」 칩으로 접는다. 4건은 칩이 4번째 자리를
 * 그대로 차지해 줄어드는 높이가 없어 접지 않는다. 스마트안경 이슈는 하루 메인 사건 10건이 쌓여 메인 흐름 레인이 562px 가 됐다
 * (2026-11-17 사용자)
 */
const FOLD_FROM = 5;
const SHOWN_IN_FOLD = 3;
/** 칩은 쌓인 다음 자리 가운데에 놓이고 위아래로 이만큼 차지한다 */
const CHIP_HALF = 12;

/** 쌓인 순서(0 부터)의 사건이 첫 사건에서 아래로 떨어진 거리. 메인 흐름 첫 사건은 레인 선 위다 */
const stackOffset = (lane: TimelineLane, index: number) =>
  index === 0
    ? 0
    : lane === "MAIN"
      ? STACK_GAP_BELOW_RAIL + (index - 1) * STACK_GAP
      : index * STACK_GAP;
const DAY = 86_400_000;
const KST_OFFSET = 9 * 3_600_000;

const LANES: Record<
  TimelineLane,
  { name: string; height: number; nodeY: number }
> = {
  MAIN: { name: "메인 흐름", height: 170, nodeY: 76 },
  SUB: { name: "서브 흐름", height: 140, nodeY: 46 },
};

export type PlacedEvent = Omit<TimelineEvent, "lane"> & {
  /** A4 lane. 계약상 늘 MAIN · SUB 지만 값이 빠지거나 모르는 값이면 메인 흐름에 둔다 */
  lane: TimelineLane;
  /** 그리는 영역 왼쪽 끝에서 잰 가로 자리 (확대 · 축소 전) */
  x: number;
  y: number;
  /** 「10.06」 · 해가 바뀌면 「2026.01.04」 */
  dateLabel: string;
  /** 발생 시점을 첫 기사 발행 시각으로 채웠다 — 날짜 뒤에 「추정」 */
  estimated: boolean;
};

export type LaneBox = {
  key: TimelineLane;
  name: string;
  top: number;
  height: number;
  /** 이 레인 사건이 놓이는 높이 */
  nodeY: number;
  count: number;
};

export type MonthTick = {
  /** 「2026-05」 — 기간이 1년을 넘으면 같은 달 이름이 두 번 나와서 이름 대신 쓴다 */
  key: string;
  x: number;
  label: string;
  /** 달 첫날 눈금선을 그리나. 구간 안에 달 첫날이 없어 첫 사건 자리에 달 이름만 둘 때는 false */
  line: boolean;
};

export type TimelineLayout = {
  events: PlacedEvent[];
  lanes: LaneBox[];
  /** 시간축 윗변 */
  axisY: number;
  /** 시간축까지 합친 높이 */
  height: number;
  /** 그리는 영역의 폭 (확대 · 축소 전) */
  width: number;
  months: MonthTick[];
  /** 「+N건」 · 「접기」 칩 — 접을 만큼 쌓인 칸마다 하나 */
  folds: StackFold[];
};

export type StackFold = {
  /** 펼친 칸을 기억할 key — stackKey */
  key: string;
  lane: TimelineLane;
  /** 그 칸 사건과 같은 가로 자리 (확대 · 축소 전) */
  x: number;
  /** 칩 가운데 높이 — 쌓인 마지막 사건의 다음 자리 */
  y: number;
  /** 숨긴 사건 수. 펼쳤으면 0 */
  hidden: number;
  expanded: boolean;
  /** 그 칸의 날짜 — 칩 이름에 쓴다 */
  dateLabel: string;
};

/** 같은 시각 · 같은 레인 사건을 한 칸으로 묶는 key */
export const stackKey = (lane: TimelineLane, occurredAt: string) =>
  `${lane}|${Date.parse(occurredAt)}`;

type LayoutOptions = {
  /** 타임라인 자리의 폭(레인 이름 칸 포함). 넓으면 빈 자리를 채우게 늘린다 */
  width?: number;
  /** 날짜에 연도를 붙일지 가릴 오늘 */
  now?: Date;
  /** 펼친 칸의 stackKey */
  expanded?: ReadonlySet<string>;
  /** 접어도 늘 보일 사건 id — 고른 사건 · 최신 사건 */
  pinned?: readonly (number | null)[];
};

const timeOf = (event: TimelineEvent) => Date.parse(event.occurredAt);

/**
 * 최신 사건 — 노드를 짙은 청록으로 칠할 하나. 발생 시점이 가장 늦은 사건, 같으면 id 가 큰 것
 * (A2 lastEvent 와 같은 규칙, docs/api-screen.md A2). 사건이 없으면 null (2026-11-16 디자인 피드백, Jira 216)
 */
export function latestEventId(events: TimelineEvent[]): number | null {
  let latest: TimelineEvent | null = null;
  for (const event of events)
    if (
      !latest ||
      timeOf(event) > timeOf(latest) ||
      (timeOf(event) === timeOf(latest) && event.id > latest.id)
    )
      latest = event;
  return latest?.id ?? null;
}

function kstYearMonth(ms: number) {
  const date = new Date(ms + KST_OFFSET);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function layoutTimeline(
  input: TimelineEvent[],
  {
    width = 0,
    now = new Date(),
    expanded = new Set(),
    pinned = [],
  }: LayoutOptions = {},
): TimelineLayout {
  const sorted = [...input].sort(
    (a, b) => timeOf(a) - timeOf(b) || a.id - b.id,
  );
  // 계약상 늘 MAIN · SUB 다. 빠지거나 모르는 값이 와도 화면이 깨지지 않게 메인 흐름에 둔다
  const laneOf = (event: TimelineEvent): TimelineLane =>
    event.lane === "SUB" ? "SUB" : "MAIN";

  // 가로 — 서로 다른 시각마다 한 자리. 앞 시각과 레인이 겹치면 넓게, 아니면 좁게 띄운다
  const times = [...new Set(sorted.map(timeOf))];
  const lanesAt = (time: number) =>
    new Set(sorted.filter((event) => timeOf(event) === time).map(laneOf));
  const knots: [number, number][] = [];
  let x = FIRST_X;
  times.forEach((time, index) => {
    if (index > 0) {
      const before = lanesAt(times[index - 1]);
      const shares = [...lanesAt(time)].some((lane) => before.has(lane));
      x += shares ? SAME_LANE_GAP : OTHER_LANE_GAP;
    }
    knots.push([time, x]);
  });
  const total = x + LAST_ROOM;
  const plotWidth = Math.max(width - GUTTER - RIGHT_ROOM, total);
  const scale = plotWidth / total;

  // 달 눈금이 들어갈 앞뒤 여유 — 사건 구간의 8%, 하루 ~ 닷새
  const span = times.length ? times[times.length - 1] - times[0] : 0;
  const pad = Math.min(5 * DAY, Math.max(DAY, span * 0.08));
  const start = times.length ? times[0] - pad : 0;
  const end = times.length ? times[times.length - 1] + pad : 0;
  const points: [number, number][] = times.length
    ? [[start, 0], ...knots, [end, total]]
    : [];
  // 시각 → 가로 자리. 사건 시각 사이는 곧게 잇는다
  const xAt = (time: number) => {
    let index = 1;
    while (index < points.length - 1 && time > points[index][0]) index += 1;
    const [timeA, xA] = points[index - 1];
    const [timeB, xB] = points[index];
    const ratio = timeB > timeA ? (time - timeA) / (timeB - timeA) : 0;
    return (xA + (xB - xA) * ratio) * scale;
  };

  // 세로 — 같은 시각 · 같은 레인 사건은 첫 사건을 레인 자리에 두고 아래로 쌓는다(라벨끼리 12px 를 남기게, stackOffset).
  // 많이 쌓인 칸은 접는다(FOLD_FROM). 마지막 라벨 · 칩이 안 들어가면 레인을 늘린다
  const stacks = new Map<string, TimelineEvent[]>();
  for (const event of sorted) {
    const key = stackKey(laneOf(event), event.occurredAt);
    stacks.set(key, [...(stacks.get(key) ?? []), event]);
  }
  // 접은 칸에 남길 사건 — 고른 사건 · 최신 사건 먼저, 그다음 기사 수 많은 순, 같으면 id 작은 순. 놓는 순서는 원래대로 둔다
  const pinnedIds = new Set(pinned);
  const shownOf = (stack: TimelineEvent[], key: string) => {
    if (stack.length < FOLD_FROM || expanded.has(key)) return stack;
    const kept = new Set(
      [...stack]
        .sort(
          (a, b) =>
            Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) ||
            b.articleCount - a.articleCount ||
            a.id - b.id,
        )
        .slice(0, SHOWN_IN_FOLD),
    );
    return stack.filter((event) => kept.has(event));
  };
  const shown = new Map(
    [...stacks].map(([key, stack]) => [key, shownOf(stack, key)]),
  );
  const folded = (key: string) => stacks.get(key)!.length >= FOLD_FROM;

  const keys: TimelineLane[] = sorted.some((event) => laneOf(event) === "SUB")
    ? ["MAIN", "SUB"]
    : ["MAIN"];
  let top = 0;
  const lanes = keys.map((key): LaneBox => {
    // 칸마다 아래 끝 — 칩이 있으면 칩 아래 끝, 없으면 마지막 라벨 아래 끝. 가장 깊은 칸이 레인 안에 들어오게 늘린다
    const bottoms = [...shown]
      .filter(([stackId]) => laneOf(stacks.get(stackId)![0]) === key)
      .map(([stackId, events]) =>
        folded(stackId)
          ? stackOffset(key, events.length) + CHIP_HALF
          : stackOffset(key, events.length - 1) +
            (key === "MAIN" && events.length === 1
              ? RAIL_LABEL_BOTTOM
              : LABEL_BOTTOM),
      );
    const lastBottom = Math.max(
      key === "MAIN" ? RAIL_LABEL_BOTTOM : LABEL_BOTTOM,
      ...bottoms,
    );
    const extra = Math.max(
      0,
      lastBottom + LANE_BOTTOM_ROOM - (LANES[key].height - LANES[key].nodeY),
    );
    const lane = {
      key,
      name: LANES[key].name,
      top,
      height: LANES[key].height + extra,
      nodeY: LANES[key].nodeY,
      count: sorted.filter((event) => laneOf(event) === key).length,
    };
    top += lane.height;
    return lane;
  });

  const dateLabels = formatTimelineDates(
    sorted.map((event) => event.occurredAt),
    now,
  );
  const laneBox = (key: TimelineLane) =>
    lanes.find((item) => item.key === key)!;
  const placed = sorted.map((event, index): PlacedEvent | null => {
    const lane = laneBox(laneOf(event));
    const stack = shown.get(stackKey(lane.key, event.occurredAt))!;
    const offset = stack.indexOf(event);
    if (offset < 0) return null;
    return {
      ...event,
      lane: lane.key,
      x: xAt(timeOf(event)),
      y: lane.top + lane.nodeY + stackOffset(lane.key, offset),
      dateLabel: dateLabels[index],
      estimated: event.occurredAtBasis === "FIRST_PUBLISHED",
    };
  });
  const events = placed.filter((event): event is PlacedEvent => !!event);

  const folds = [...stacks]
    .filter(([key]) => folded(key))
    .map(([key, stack]): StackFold => {
      const lane = laneBox(laneOf(stack[0]));
      const count = shown.get(key)!.length;
      return {
        key,
        lane: lane.key,
        x: xAt(timeOf(stack[0])),
        y: lane.top + lane.nodeY + stackOffset(lane.key, count),
        hidden: stack.length - count,
        expanded: count === stack.length,
        dateLabel: dateLabels[sorted.indexOf(stack[0])],
      };
    });

  return {
    events,
    lanes,
    axisY: top,
    height: top + AXIS_HEIGHT,
    width: plotWidth,
    months: monthTicks(start, end, xAt, events[0]),
    folds,
  };
}

// 구간 안의 달 첫날(한국 시간)마다 눈금. 첫 눈금과 1월에는 연도를 붙인다.
// 구간 안에 달 첫날이 없으면 첫 사건 자리에 그 달 이름만 둔다
function monthTicks(
  start: number,
  end: number,
  xAt: (time: number) => number,
  first: PlacedEvent | undefined,
): MonthTick[] {
  if (!first) return [];
  const ticks: MonthTick[] = [];
  let { year, month } = kstYearMonth(start);
  for (;;) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const time = Date.UTC(year, month - 1, 1) - KST_OFFSET;
    if (time > end) break;
    const label =
      ticks.length === 0 || month === 1 ? `${year}년 ${month}월` : `${month}월`;
    ticks.push({ key: monthKey(year, month), x: xAt(time), label, line: true });
  }
  if (ticks.length > 0) return ticks;
  const own = kstYearMonth(Date.parse(first.occurredAt));
  return [
    {
      key: monthKey(own.year, own.month),
      x: first.x,
      label: `${own.year}년 ${own.month}월`,
      line: false,
    },
  ];
}

const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;
