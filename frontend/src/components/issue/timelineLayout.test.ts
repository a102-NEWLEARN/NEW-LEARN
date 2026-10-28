import { expect, test } from "vitest";
import type { TimelineEvent } from "@/api/timeline";
import { layoutTimeline } from "@/components/issue/timelineLayout";

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

test("레인을 정하지 않은(null) 사건은 메인 흐름에 두고, 서브 흐름 사건이 없으면 서브 레인을 두지 않는다", () => {
  const layout = layoutTimeline(
    [event(1, at("08-04"), null), event(2, at("09-02"), null)],
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

test("같은 시각에 같은 레인 사건은 같은 가로 자리에서 위아래로 30px 벌린다", () => {
  const layout = layoutTimeline(
    [
      event(1, at("09-15"), "MAIN"),
      event(2, at("09-15"), "MAIN"),
      event(3, at("09-15"), "SUB"),
    ],
    { now: NOW },
  );
  const [one, two, three] = layout.events;

  expect(new Set(xs(layout)).size).toBe(1);
  expect(two.y - one.y).toBe(30);
  expect(three.lane).toBe("SUB");
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
