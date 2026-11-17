import { expect, test } from "vitest";
import type { TimelineEvent } from "@/api/timeline";
import {
  latestEventId,
  layoutTimeline,
  stackKey,
} from "@/components/issue/timelineLayout";

const NOW = new Date("2026-10-28T09:00:00+09:00");

function event(
  id: number,
  occurredAt: string,
  lane: TimelineEvent["lane"],
  occurredAtBasis: TimelineEvent["occurredAtBasis"] = "EXTRACTED",
): TimelineEvent {
  return {
    id,
    title: `사건 ${id}`,
    label: `키워드 ${id}`,
    lane,
    occurredAt,
    occurredAtBasis,
    articleCount: 3,
    publisherCount: 2,
  };
}

const at = (day: string) => `2026-${day}T00:00:00+09:00`;
const xs = (layout: ReturnType<typeof layoutTimeline>) =>
  layout.events.map((item) => item.x);

test("사건을 시각 순서로 놓는다", () => {
  const layout = layoutTimeline(
    [event(2, at("09-02"), "MAIN"), event(1, at("08-04"), "MAIN")],
    { now: NOW },
  );

  expect(layout.events.map((item) => item.id)).toEqual([1, 2]);
});

test("서브 흐름 사건이 없으면 서브 흐름 레인을 두지 않는다", () => {
  const layout = layoutTimeline(
    [event(1, at("08-04"), "MAIN"), event(2, at("09-02"), "MAIN")],
    { now: NOW },
  );

  expect(layout.lanes.map((lane) => lane.name)).toEqual(["메인 흐름"]);
  expect(layout.events.map((item) => item.lane)).toEqual(["MAIN", "MAIN"]);
});

test("서브 흐름 사건이 있으면 메인 흐름 아래에 서브 흐름 레인을 둔다", () => {
  const layout = layoutTimeline(
    [event(1, at("08-04"), "MAIN"), event(2, at("09-02"), "SUB")],
    { now: NOW },
  );

  expect(layout.lanes.map((lane) => [lane.name, lane.count])).toEqual([
    ["메인 흐름", 1],
    ["서브 흐름", 1],
  ]);
  const [main, sub] = layout.lanes;
  expect(sub.top).toBe(main.top + main.height);
  expect(layout.events[1].y).toBeGreaterThan(sub.top);
  expect(layout.axisY).toBe(sub.top + sub.height);
});

test("시각 차이와 상관없이 앞 사건과 같은 레인이면 170px, 다른 레인이면 110px 띄운다", () => {
  const layout = layoutTimeline(
    [
      event(1, at("08-04"), "MAIN"),
      event(2, at("08-05"), "MAIN"),
      event(3, at("10-01"), "SUB"),
      event(4, at("10-02"), "SUB"),
    ],
    { now: NOW },
  );
  const [a, b, c, d] = xs(layout);

  expect([b - a, c - b, d - c]).toEqual([170, 110, 170]);
});

// 운영에서 같은 날 사건이 쌓이면 30px 간격에 두 줄 라벨(32px)이 맞닿아, 날짜 줄이 다음 사건 옆에 왔다 (Jira 188)
test("같은 시각에 같은 레인 사건은 같은 가로 자리에서 첫 사건을 레인 선에 두고, 라벨이 겹치지 않게 아래로 쌓는다", () => {
  const layout = layoutTimeline(
    [
      event(1, at("09-15"), "MAIN"),
      event(2, at("09-15"), "MAIN"),
      event(3, at("09-15"), "MAIN"),
      event(4, at("09-15"), "SUB"),
      event(5, at("09-15"), "SUB"),
      event(6, at("09-15"), "SUB"),
    ],
    { now: NOW },
  );
  const [one, two, three, four, five, six] = layout.events;
  const [main, sub] = layout.lanes;

  expect(new Set(xs(layout)).size).toBe(1);
  // 메인 흐름 선은 레인의 nodeY 를 지난다
  expect(one.y).toBe(main.top + main.nodeY);
  // 선 위 사건의 라벨은 선 밑(사건 가운데 + 6 ~ + 42)이라 그 아래 첫 사건은 더 벌린다 — 라벨 사이 12
  expect(two.y - one.y).toBe(62);
  // 그다음부터는 이름 줄을 사건 가운데에 맞춘 두 줄 라벨(− 8 ~ + 28) 사이 12 — 이름 15px · 날짜 13px (Jira 197)
  expect(three.y - two.y).toBe(48);
  expect(four.lane).toBe("SUB");
  expect(four.y).toBe(sub.top + sub.nodeY);
  expect([five.y - four.y, six.y - five.y]).toEqual([48, 48]);
  // 레인은 마지막 사건의 라벨이 들어가게 늘어난다
  expect(main.top + main.height).toBeGreaterThanOrEqual(three.y + 28 + 12);
  expect(sub.top + sub.height).toBeGreaterThanOrEqual(six.y + 28 + 12);
});

test("화면이 넓으면 간격 비율을 지킨 채 빈 자리를 채우게 늘린다", () => {
  const events = [
    event(1, at("08-04"), "MAIN"),
    event(2, at("08-05"), "MAIN"),
    event(3, at("08-06"), "SUB"),
  ];
  const narrow = layoutTimeline(events, { now: NOW, width: 0 });
  const wide = layoutTimeline(events, { now: NOW, width: 3000 });
  const [a, b, c] = xs(narrow);
  const [wa, wb, wc] = xs(wide);

  expect(wide.width).toBeGreaterThan(narrow.width);
  expect((wb - wa) / (wc - wb)).toBeCloseTo((b - a) / (c - b));
});

test("월 눈금은 첫 눈금과 1월에 연도를 붙인다", () => {
  const layout = layoutTimeline(
    [
      event(1, "2025-12-20T00:00:00+09:00", "MAIN"),
      event(2, at("02-10"), "MAIN"),
    ],
    { now: NOW },
  );

  expect(layout.months.map((month) => month.label)).toEqual([
    "2026년 1월",
    "2월",
  ]);
});

test("월 눈금은 사건 앞뒤 여유를 둔 구간 안의 달 첫날마다 찍고 시각 순서대로 오른쪽으로 간다", () => {
  const layout = layoutTimeline(
    [event(1, at("08-04"), "MAIN"), event(2, at("10-09"), "MAIN")],
    { now: NOW },
  );
  const labels = layout.months.map((month) => month.label);
  const tickXs = layout.months.map((month) => month.x);

  expect(labels).toEqual(["2026년 8월", "9월", "10월"]);
  expect(tickXs).toEqual([...tickXs].sort((p, q) => p - q));
  expect(tickXs[0]).toBeLessThan(layout.events[0].x);
});

test("사건 날짜는 「MM.DD」로 적고 발생 시점을 첫 기사로 채웠으면 추정으로 표시한다", () => {
  const layout = layoutTimeline(
    [
      event(1, at("08-04"), "MAIN"),
      event(2, at("08-21"), "SUB", "FIRST_PUBLISHED"),
    ],
    { now: NOW },
  );

  expect(layout.events.map((item) => [item.dateLabel, item.estimated])).toEqual(
    [
      ["08.04", false],
      ["08.21", true],
    ],
  );
});

// 계약상 늘 MAIN · SUB 지만, 값이 빠지거나 모르는 값이 와도 화면이 깨지지 않게
test("레인 값이 없거나 모르는 값이면 깨지지 않고 메인 흐름에 둔다", () => {
  const layout = layoutTimeline(
    [
      event(1, at("08-04"), "OTHER" as TimelineEvent["lane"]),
      event(2, at("08-05"), null as unknown as TimelineEvent["lane"]),
    ],
    { now: NOW },
  );

  expect(layout.events.map((item) => item.lane)).toEqual(["MAIN", "MAIN"]);
});

test("월 눈금마다 겹치지 않는 key 를 준다", () => {
  const layout = layoutTimeline(
    [
      event(1, "2025-03-10T00:00:00+09:00", "MAIN"),
      event(2, "2026-06-03T00:00:00+09:00", "MAIN"),
    ],
    { now: NOW },
  );
  const keys = layout.months.map((month) => month.key);

  expect(keys).toContain("2025-05");
  expect(keys).toContain("2026-05");
  expect(new Set(keys).size).toBe(keys.length);
});

test("늘리는 폭은 레인 이름 칸(140)과 오른쪽 여백(200)을 뺀 자리다", () => {
  const events = [event(1, at("08-04"), "MAIN"), event(2, at("08-05"), "MAIN")];

  expect(layoutTimeline(events, { now: NOW, width: 2000 }).width).toBe(1660);
});

// 최신 사건 — 짙은 청록으로 칠할 하나. A2 lastEvent 와 같은 규칙: 발생 시점 내림차순, 같으면 id 가 큰 것 (Jira 216)
test("최신 사건은 가장 늦게 일어난 사건이고, 같은 시각이면 id 가 큰 것이다", () => {
  expect(
    latestEventId([
      event(3, at("09-02"), "MAIN"),
      event(7, at("10-06"), "SUB"),
      event(5, at("10-06"), "MAIN"),
      event(9, at("08-04"), "MAIN"),
    ]),
  ).toBe(7);
  expect(latestEventId([])).toBeNull();
});

// 같은 날 · 같은 레인 사건이 5건 이상이면 3건만 놓고 「+N건」 칩으로 접는다. 스마트안경 이슈는 11.16 메인 사건 10건이
// 쌓여 메인 흐름 레인이 562px 가 됐다 (2026-11-17 사용자)
const tenOnOneDay = () =>
  Array.from({ length: 10 }, (_, index) =>
    event(index + 1, at("11-16"), "MAIN"),
  );

test("같은 날 같은 레인 사건이 5건 이상이면 3건만 놓고 나머지 수를 칩으로 남긴다", () => {
  const layout = layoutTimeline(tenOnOneDay(), { now: NOW });
  const [main] = layout.lanes;

  expect(layout.events).toHaveLength(3);
  expect(layout.folds).toEqual([
    expect.objectContaining({
      key: stackKey("MAIN", at("11-16")),
      lane: "MAIN",
      hidden: 7,
      expanded: false,
      x: layout.events[0].x,
    }),
  ]);
  // 칩은 4번째 사건 자리에 둔다
  const [, , third] = layout.events;
  expect(layout.folds[0].y - third.y).toBe(48);
  // 레인은 3건과 칩까지만 늘어난다. 레인 이름 칸의 사건 수는 숨긴 사건까지 센다
  expect(main.height).toBeLessThan(300);
  expect(main.top + main.height).toBeGreaterThanOrEqual(
    layout.folds[0].y + 12 + 12,
  );
  expect(main.count).toBe(10);
});

test("4건이면 칩이 4번째 자리를 그대로 차지해 줄어드는 높이가 없어서 접지 않는다", () => {
  const layout = layoutTimeline(tenOnOneDay().slice(0, 4), { now: NOW });

  expect(layout.events).toHaveLength(4);
  expect(layout.folds).toEqual([]);
});

test("펼친 칸은 다 놓고, 마지막 사건 아래에 접는 칩을 둔다", () => {
  const layout = layoutTimeline(tenOnOneDay(), {
    now: NOW,
    expanded: new Set([stackKey("MAIN", at("11-16"))]),
  });
  const last = layout.events[layout.events.length - 1];
  const [main] = layout.lanes;

  expect(layout.events).toHaveLength(10);
  expect(layout.folds).toEqual([
    expect.objectContaining({ hidden: 0, expanded: true }),
  ]);
  expect(layout.folds[0].y - last.y).toBe(48);
  expect(main.top + main.height).toBeGreaterThanOrEqual(
    layout.folds[0].y + 12 + 12,
  );
});

test("접을 때 고른 사건 · 최신 사건을 먼저 남기고, 그다음 기사 수 많은 사건을 남긴다. 놓는 순서는 id 순이다", () => {
  const events = tenOnOneDay().map((item) =>
    item.id === 6 ? { ...item, articleCount: 20 } : item,
  );
  const layout = layoutTimeline(events, { now: NOW, pinned: [9, 2, null] });

  expect(layout.events.map((item) => item.id)).toEqual([2, 6, 9]);
  // 첫 사건은 메인 흐름 선 위다
  expect(layout.events[0].y).toBe(layout.lanes[0].top + layout.lanes[0].nodeY);
});

test("접힌 칸은 레인마다 따로 센다 — 서브 흐름 칸은 서브 흐름 레인에 칩을 둔다", () => {
  const layout = layoutTimeline(
    [
      ...tenOnOneDay(),
      ...Array.from({ length: 5 }, (_, index) =>
        event(20 + index, at("11-16"), "SUB"),
      ),
    ],
    { now: NOW },
  );
  const [, sub] = layout.lanes;

  expect(layout.events).toHaveLength(6);
  expect(layout.folds.map((fold) => [fold.lane, fold.hidden])).toEqual([
    ["MAIN", 7],
    ["SUB", 2],
  ]);
  expect(layout.folds[1].y).toBeGreaterThan(sub.top);
  expect(sub.count).toBe(5);
});
