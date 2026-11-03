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
/** 같은 시각 · 같은 레인 사건을 아래로 쌓는 간격 */
const STACK_GAP = 30;
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
};

type LayoutOptions = {
  /** 타임라인 자리의 폭(레인 이름 칸 포함). 넓으면 빈 자리를 채우게 늘린다 */
  width?: number;
  /** 날짜에 연도를 붙일지 가릴 오늘 */
  now?: Date;
};

const timeOf = (event: TimelineEvent) => Date.parse(event.occurredAt);

function kstYearMonth(ms: number) {
  const date = new Date(ms + KST_OFFSET);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function layoutTimeline(
  input: TimelineEvent[],
  { width = 0, now = new Date() }: LayoutOptions = {},
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

  // 세로 — 같은 시각 · 같은 레인 사건은 첫 사건을 레인 자리에 두고 아래로 쌓는다(라벨이 레인 선에 걸리지 않게). 둘을 넘으면 레인을 늘린다
  const stacks = new Map<string, TimelineEvent[]>();
  for (const event of sorted) {
    const key = `${laneOf(event)}|${timeOf(event)}`;
    stacks.set(key, [...(stacks.get(key) ?? []), event]);
  }
  const keys: TimelineLane[] = sorted.some((event) => laneOf(event) === "SUB")
    ? ["MAIN", "SUB"]
    : ["MAIN"];
  let top = 0;
  const lanes = keys.map((key): LaneBox => {
    const tallest = Math.max(
      1,
      ...[...stacks.values()]
        .filter((stack) => laneOf(stack[0]) === key)
        .map((stack) => stack.length),
    );
    const extra = Math.max(0, tallest - 2) * STACK_GAP;
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
  const events = sorted.map((event, index): PlacedEvent => {
    const lane = lanes.find((item) => item.key === laneOf(event))!;
    const stack = stacks.get(`${lane.key}|${timeOf(event)}`)!;
    const offset = stack.indexOf(event);
    return {
      ...event,
      lane: lane.key,
      x: xAt(timeOf(event)),
      y: lane.top + lane.nodeY + offset * STACK_GAP,
      dateLabel: dateLabels[index],
      estimated: event.occurredAtBasis === "FIRST_PUBLISHED",
    };
  });

  return {
    events,
    lanes,
    axisY: top,
    height: top + AXIS_HEIGHT,
    width: plotWidth,
    months: monthTicks(start, end, xAt, events[0]),
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
