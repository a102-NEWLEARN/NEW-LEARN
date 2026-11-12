import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { fetchTimeline } from "@/api/timeline";
import { Timeline } from "@/components/issue/Timeline";
import { enterDelay, expectMotionSafe, lastEnterEnd } from "@/test/motion";

// 12번 이슈의 가짜 사건 8개 — 메인 5 · 서브 3, 같은 시각 사건과 「추정」 사건이 있다 (src/mocks/handlers.ts)
async function renderTimeline(selectedId: number | null = null) {
  const { events } = await fetchTimeline(12);
  const onSelect = vi.fn();
  const onDeselect = vi.fn();
  render(
    <Timeline
      events={events}
      selectedId={selectedId}
      onSelect={onSelect}
      onDeselect={onDeselect}
      summary="2026.08.04 ~ 10.09 · 사건 8 · 기사 31"
    />,
  );
  return { onSelect, onDeselect };
}

const node = (name: RegExp) => screen.getByRole("button", { name });
const zoomLevel = () =>
  Number(
    within(screen.getByRole("group", { name: "확대 · 축소" }))
      .getByText(/%$/)
      .textContent!.replace("%", ""),
  );

test("사건마다 날짜 · 제목 · 레인 · 기사 수를 읽어 주는 버튼을 둔다", async () => {
  await renderTimeline();

  const nodes = screen.getAllByRole("button", {
    name: /(메인|서브) 흐름, 기사/,
  });
  expect(nodes).toHaveLength(8);
  expect(nodes[1].getAttribute("aria-label")).toBe(
    "08.21 한빛반도체, 텍사스 공장 투자 확대 공식 발표, 메인 흐름, 기사 5건",
  );
  // 발생 시점을 첫 기사로 채운 사건은 「추정」
  expect(node(/세제 혜택 패키지/).getAttribute("aria-label")).toMatch(
    /^08\.21 추정 /,
  );
});

test("왼쪽에 레인 이름과 레인마다 사건 수를 둔다", async () => {
  await renderTimeline();

  const lanes = screen.getByRole("list", { name: "레인" });
  // 항목 글자에는 마우스를 올리면 뜨는 레인 뜻(<title>)도 들어 있다
  expect(
    within(lanes)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    expect.stringContaining("메인 흐름사건 5"),
    expect.stringContaining("서브 흐름사건 3"),
  ]);
});

test("사건 노드 옆에 키워드와 날짜 · 기사 수를 적는다", async () => {
  await renderTimeline();

  expect(screen.getByText("착공식")).toBeDefined();
  expect(screen.getByText("10.06 · 기사 5건")).toBeDefined();
  expect(screen.getByText("10.09 추정 · 기사 4건")).toBeDefined();
});

// 사건 이름 · 날짜 줄이 작아 읽기 어려웠다 — 이름 13 → 15px, 날짜 · 기사 수 12 → 13px (2026-11-12 사용자 QA, Jira 197)
test("사건 이름은 15px, 날짜 · 기사 수 줄은 13px 로 적는다", async () => {
  await renderTimeline();

  expect(screen.getByText("착공식").getAttribute("class")).toContain(
    "text-[0.9375rem]",
  );
  expect(screen.getByText("10.06 · 기사 5건").getAttribute("class")).toContain(
    "text-[0.8125rem]",
  );
});

test("노드를 누르거나 Enter · Space 로 고른다", async () => {
  const { onSelect } = await renderTimeline();

  fireEvent.click(node(/착공식/));
  fireEvent.keyDown(node(/보조금 지급 확정/), { key: "Enter" });
  fireEvent.keyDown(node(/추가 투자 승인/), { key: " " });

  expect(onSelect.mock.calls).toEqual([[119], [117], [118]]);
});

test("고른 사건은 지금 고른 것(aria-current)으로 읽히고 시간축에 그 날짜를 띄운다", async () => {
  await renderTimeline(119);

  expect(node(/착공식/).getAttribute("aria-current")).toBe("true");
  expect(node(/공식 발표/).getAttribute("aria-current")).toBeNull();
  expect(screen.getByTestId("selected-date").textContent).toBe("10.06");
});

test("타임라인 빈 곳을 누르면 고르기를 푼다 — 노드를 누를 때는 풀지 않는다", async () => {
  const { onDeselect } = await renderTimeline(119);

  fireEvent.click(node(/공식 발표/));
  expect(onDeselect).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("group", { name: "사건 타임라인" }));
  expect(onDeselect).toHaveBeenCalledOnce();
});

test("포커스를 받은 노드는 제목 · 날짜 · 기사 · 언론사 수 · 레인을 툴팁으로 띄운다", async () => {
  await renderTimeline();

  act(() => node(/착공식/).focus());

  const tip = screen.getByRole("tooltip");
  expect(tip.textContent).toContain("한빛반도체 텍사스 공장 착공식");
  expect(tip.textContent).toContain(
    "10.06 · 기사 5건 · 언론사 4곳 · 메인 흐름",
  );

  act(() => node(/착공식/).blur());
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("+ · − 로 확대 · 축소하고 전체 보기로 다 들어오게 맞춘다", async () => {
  await renderTimeline();
  const start = zoomLevel();

  fireEvent.click(screen.getByRole("button", { name: "확대" }));
  await waitFor(() => expect(zoomLevel()).toBeGreaterThan(start));
  const zoomed = zoomLevel();

  fireEvent.click(screen.getByRole("button", { name: "축소" }));
  await waitFor(() => expect(zoomLevel()).toBeLessThan(zoomed));

  fireEvent.click(screen.getByRole("button", { name: "확대" }));
  fireEvent.click(screen.getByRole("button", { name: "확대" }));
  await waitFor(() => expect(zoomLevel()).toBeGreaterThan(100));
  fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
  await waitFor(() => expect(zoomLevel()).toBeLessThanOrEqual(100));
});

test("TIP 을 열면 레인 뜻과 「추정」 뜻을 보여 주고 닫을 수 있다", async () => {
  await renderTimeline();

  fireEvent.click(screen.getByRole("button", { name: "TIP" }));
  const tip = screen.getByRole("dialog", { name: "타임라인 TIP" });
  expect(tip.textContent).toContain("반응 · 평가 · 여론");
  expect(tip.textContent).toContain("추정");

  fireEvent.click(within(tip).getByRole("button", { name: "TIP 닫기" }));
  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
});

// 처음 그릴 때는 자리 폭을 아직 못 재서 1000px 로 어림한다. 진짜 폭을 재면 처음 배율과 고른 사건 자리를 다시 맞춰야 한다
test("타임라인 자리가 좁아도 ?event= 로 고른 마지막 사건을 처음부터 화면 안에 둔다", async () => {
  const width = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(375);
  try {
    await renderTimeline(120);

    const transform = node(/엔지니어 수급 우려/).getAttribute("transform")!;
    const x = Number(/translate\(([-\d.]+),/.exec(transform)![1]);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(375);
  } finally {
    width.mockRestore();
  }
});

test("마우스로 눌러 받은 포커스에는 툴팁을 남기지 않는다 — 키보드 포커스만 띄운다", async () => {
  await renderTimeline();
  const target = node(/착공식/);

  fireEvent.pointerDown(target);
  act(() => target.focus());
  fireEvent.click(target);

  expect(screen.queryByRole("tooltip")).toBeNull();
});

// ── 리뷰 반영 ─────────────────────────────────────────────

function stubWidth(width: number) {
  return vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(width);
}

const nodeX = (name: RegExp) =>
  Number(
    /translate\(([-\d.]+),/.exec(node(name).getAttribute("transform")!)![1],
  );

test("고른 노드도 DOM 에서 시간 순서 자리에 있다 — Tab 순서와 읽는 순서가 그대로다", async () => {
  await renderTimeline(114);

  const nodes = screen.getAllByRole("button", { name: /(메인|서브) 흐름/ });
  expect(nodes[1].getAttribute("aria-label")).toContain("공식 발표");
  expect(nodes.at(-1)!.getAttribute("aria-label")).toContain("엔지니어");
});

test("TIP 을 열면 포커스가 창 안으로 가고, Esc 나 닫기로 닫으면 TIP 버튼으로 돌아온다", async () => {
  await renderTimeline();
  const tipButton = screen.getByRole("button", { name: "TIP" });

  fireEvent.click(tipButton);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "TIP 닫기" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
  expect(document.activeElement).toBe(tipButton);

  // 연 버튼에 포커스가 있어도 Esc 로 닫힌다
  fireEvent.click(tipButton);
  act(() => tipButton.focus());
  fireEvent.keyDown(tipButton, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();

  fireEvent.click(tipButton);
  fireEvent.click(screen.getByRole("button", { name: "TIP 닫기" }));
  expect(document.activeElement).toBe(tipButton);
});

test("넓은 화면에 다 들어오면 처음 배율은 100% 다", async () => {
  const width = stubWidth(1600);
  try {
    await renderTimeline();
    expect(zoomLevel()).toBe(100);
  } finally {
    width.mockRestore();
  }
});

test("기간이 1년을 넘어 같은 달 이름이 두 번 나와도 눈금을 겹치지 않게 그린다", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { events } = await fetchTimeline(12);
    render(
      <Timeline
        events={[
          { ...events[0], occurredAt: "2025-03-10T00:00:00+09:00" },
          { ...events[1], occurredAt: "2026-06-03T00:00:00+09:00" },
        ]}
        selectedId={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );

    expect(screen.getAllByText("5월")).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});

test("노드를 누르다 끌어도(클릭 없이 손을 떼도) 다음 키보드 포커스에는 툴팁을 띄운다", async () => {
  await renderTimeline();

  fireEvent.pointerDown(node(/착공식/));
  fireEvent.pointerUp(window);
  // 끌기를 마친 뒤 Tab 으로 다음 노드에 간다
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => node(/공식 발표/).focus());

  expect(screen.getByRole("tooltip").textContent).toContain("공식 발표");
});

test("기사 · 언론사가 0이면 그 항목을 빼고 적는다", async () => {
  const { events } = await fetchTimeline(12);
  render(
    <Timeline
      events={[{ ...events[6], articleCount: 0, publisherCount: 0 }]}
      selectedId={null}
      onSelect={() => {}}
      onDeselect={() => {}}
    />,
  );

  expect(node(/착공식/).getAttribute("aria-label")).toBe(
    "10.06 한빛반도체 텍사스 공장 착공식, 메인 흐름",
  );
  expect(screen.queryByText(/기사 0/)).toBeNull();
  act(() => node(/착공식/).focus());
  expect(screen.getByRole("tooltip").textContent).not.toMatch(
    /기사 0|언론사 0/,
  );
});

test("키보드로 화면 밖 노드에 가면 그 노드가 보이게 옮긴다", async () => {
  const width = stubWidth(375);
  try {
    await renderTimeline();
    expect(nodeX(/엔지니어 수급 우려/)).toBeGreaterThan(375);

    act(() => node(/엔지니어 수급 우려/).focus());

    await waitFor(() => expect(nodeX(/엔지니어 수급 우려/)).toBeLessThan(375));
  } finally {
    width.mockRestore();
  }
});

// 터치 탭은 pointerdown → pointerup → (touchend 뒤) mousedown 에서 포커스 → click 순서다. 손을 뗀 뒤에 포커스가 온다
test("터치로 탭한 노드에도 키보드용 툴팁 · 테두리를 남기지 않는다", async () => {
  await renderTimeline();
  const target = node(/착공식/);

  fireEvent.pointerDown(target);
  fireEvent.pointerUp(target);
  act(() => target.focus());
  fireEvent.click(target);

  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("TIP 이 열린 채 노드에서 Esc 를 누르면 TIP 을 닫고, 한글 조합 중 Esc 는 넘긴다", async () => {
  await renderTimeline();
  fireEvent.click(screen.getByRole("button", { name: "TIP" }));

  fireEvent.keyDown(node(/착공식/), { key: "Escape", isComposing: true });
  expect(screen.getByRole("dialog", { name: "타임라인 TIP" })).toBeDefined();

  fireEvent.keyDown(node(/착공식/), { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
});

test("Alt · Ctrl · Cmd 만 누른 것은 키보드 입력으로 치지 않는다 — 창을 오가도 마우스로 누른 노드에 툴팁이 안 뜬다", async () => {
  await renderTimeline();
  const target = node(/착공식/);

  fireEvent.pointerDown(target);
  fireEvent.keyDown(document.body, { key: "Alt" });
  act(() => target.focus());

  expect(screen.queryByRole("tooltip")).toBeNull();
});

// 사건 패널을 닫으면 처음 열었을 때 보기로 돌아간다 — 사건을 보이려고 옮긴 자리 · 키운 배율에 멈추지 않는다.
// 닫은 뒤 패널 자리만큼 넓어진 폭으로 한 번 더 맞춘다 (2026-11-12 사용자 QA, Jira 197)
test("사건 패널을 닫으면 처음 열었을 때 배율 · 위치로 돌아간다", async () => {
  // SEED 도 크기를 보느라 같은 관찰자를 쓴다 — 그쪽 콜백은 entries 를 읽어서 빈 목록을 넘긴다
  const callbacks: ((entries: unknown[]) => void)[] = [];
  const original = globalThis.ResizeObserver;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: unknown[]) => void) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  let width = 1216;
  const spy = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(() => width);
  const resize = (next: number) => {
    width = next;
    act(() => callbacks.forEach((callback) => callback([])));
  };
  try {
    const { events } = await fetchTimeline(12);
    const timeline = (selectedId: number | null) => (
      <Timeline
        events={events}
        selectedId={selectedId}
        onSelect={() => {}}
        onDeselect={() => {}}
      />
    );
    const { rerender } = render(timeline(null));
    const firstX = () =>
      Number(
        /translate\(([-\d.]+),/.exec(
          screen
            .getAllByRole("button", { name: /(메인|서브) 흐름, 기사/ })[0]
            .getAttribute("transform")!,
        )![1],
      );
    const startZoom = zoomLevel();
    const startX = firstX();

    // 키워 두고 마지막 사건을 고른다 — 패널이 열려 좁아지고, 그 사건이 보이게 옮겨진다
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    await waitFor(() => expect(zoomLevel()).toBe(Math.round(startZoom * 1.25)));
    rerender(timeline(120));
    resize(796);
    await waitFor(() => expect(nodeX(/엔지니어 수급 우려/)).toBeLessThan(796));
    expect(firstX()).not.toBeCloseTo(startX, 0);

    // 닫는다 — 고른 사건이 없어지고, 패널이 빠져 폭이 돌아온다
    rerender(timeline(null));
    resize(1216);

    await waitFor(() => expect(zoomLevel()).toBe(startZoom));
    await waitFor(() => expect(firstX()).toBeCloseTo(startX, 0));
  } finally {
    spy.mockRestore();
    vi.stubGlobal("ResizeObserver", original);
  }
});

// 사건을 고르면 오른쪽 패널이 열리며 타임라인이 좁아진다 — 고른 사건이 오른쪽으로 밀려나면 다시 보이게 옮긴다
test("타임라인 폭이 줄어 고른 사건이 오른쪽 끝에 걸리면 다시 보이게 옮긴다", async () => {
  const callbacks: (() => void)[] = [];
  const original = globalThis.ResizeObserver;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  let width = 1216;
  const spy = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(() => width);
  try {
    await renderTimeline(119);
    expect(nodeX(/착공식/)).toBeLessThan(1216 - 210);

    width = 796;
    act(() => callbacks.forEach((callback) => callback()));

    await waitFor(() => expect(nodeX(/착공식/)).toBeLessThan(796 - 210));
  } finally {
    spy.mockRestore();
    vi.stubGlobal("ResizeObserver", original);
  }
});

test("레인 이름 칸은 140px 이고, 도구줄에 확대 % 와 글자 「전체 보기」 버튼을 둔다", async () => {
  await renderTimeline();

  const lanes = screen.getByRole("list", { name: "레인" });
  expect(lanes.querySelector("line")?.getAttribute("x1")).toBe("139.5");
  expect(screen.getByRole("button", { name: "전체 보기" }).textContent).toBe(
    "전체 보기",
  );
  expect(zoomLevel()).toBeGreaterThan(0);
});

// 사건이 튀어나오는 묶음 · 라벨이 떠오르는 묶음 · 노드 가로 자리
const popOf = (button: Element) =>
  button.querySelector('[class*="newlearn-spring-in"]')!;
const labelOf = (button: Element) =>
  button.querySelector('[class*="newlearn-rise-short"]')!;
const xOf = (button: Element) =>
  Number(/translate\(([-\d.]+),/.exec(button.getAttribute("transform")!)![1]);
const laneNodes = (lane: "메인" | "서브") =>
  screen
    .getAllByRole("button", { name: new RegExp(`${lane} 흐름`) })
    .sort((a, b) => xOf(a) - xOf(b));

test("열 때 메인 흐름 선이 왼쪽에서 오른쪽으로 뻗고, 선 끝이 지나는 자리의 사건이 차례로 튀어나온다 — 같은 시각 사건은 함께", async () => {
  await renderTimeline();
  const mains = laneNodes("메인");
  const delays = mains.map((button) => enterDelay(popOf(button)));

  mains.slice(1).forEach((button, i) => {
    if (xOf(button) > xOf(mains[i]))
      expect(delays[i + 1]).toBeGreaterThan(delays[i]);
    else expect(delays[i + 1]).toBe(delays[i]);
  });
  // 라벨은 그 사건 뒤에 떠오른다
  mains.forEach((button) =>
    expect(enterDelay(labelOf(button))).toBeGreaterThan(
      enterDelay(popOf(button)),
    ),
  );
  // 레인 선은 첫 메인 사건이 나올 때 뻗기 시작해 마지막 메인 사건이 나올 때 다 뻗는다
  const rail = document.querySelector<SVGLineElement>("[data-rail]")!;
  expect(rail.getAttribute("pathLength")).toBe("1");
  expect(enterDelay(rail)).toBe(delays[0]);
  expect(
    enterDelay(rail) + Number.parseFloat(rail.style.animationDuration),
  ).toBe(delays.at(-1));
});

test("서브 흐름 사건은 그 자리를 메인 흐름 선이 지나간 뒤에 나온다 — 레인 이름은 그보다 먼저다", async () => {
  await renderTimeline();
  const mains = laneNodes("메인");

  for (const sub of laneNodes("서브")) {
    const passed = mains
      .filter((main) => xOf(main) <= xOf(sub))
      .map((main) => enterDelay(popOf(main)));
    if (passed.length)
      expect(enterDelay(popOf(sub))).toBeGreaterThan(Math.max(...passed));
  }
  const lanes = within(screen.getByRole("list", { name: "레인" })).getAllByRole(
    "listitem",
  );
  lanes.forEach((lane) => {
    const first = lane.querySelector('[class*="motion-safe:animate-"]')!;
    expect(enterDelay(first)).toBeLessThan(enterDelay(popOf(mains[0])));
  });
});

test("사건이 많아도 2초 안에 다 나온다 — 선이 뻗는 길이에 상한이 있다", async () => {
  const { events } = await fetchTimeline(12);
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...events[i % events.length],
    id: 1000 + i,
    occurredAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
  }));
  render(
    <Timeline
      events={many}
      selectedId={null}
      onSelect={vi.fn()}
      onDeselect={vi.fn()}
    />,
  );

  expect(lastEnterEnd()).toBeGreaterThan(0);
  expect(lastEnterEnd()).toBeLessThanOrEqual(2000);
});

test("고른 사건에는 파문이 번지고 시간축 날짜 표시가 튀어나온다", async () => {
  await renderTimeline(119);

  expect(
    node(/착공식/).querySelector('[class*="newlearn-ripple"]'),
  ).not.toBeNull();
  expect(
    node(/공식 발표/).querySelector('[class*="newlearn-ripple"]'),
  ).toBeNull();
  expect(
    screen
      .getByTestId("selected-date")
      .closest('[class*="newlearn-spring-in"]'),
  ).not.toBeNull();
});

test("마우스를 올린 사건은 커지고, 툴팁은 떠오르며 나타난다", async () => {
  await renderTimeline();
  const scaled = (button: Element) =>
    button.querySelector('[class*="motion-safe:scale-[1.15]"]');

  fireEvent.mouseEnter(node(/착공식/));

  expect(scaled(node(/착공식/))).not.toBeNull();
  expect(scaled(node(/공식 발표/))).toBeNull();
  expect(screen.getByRole("tooltip").getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-/,
  );
});

test("움직임은 동작 줄이기를 켜면 빠진다 — 애니메이션 · 크기 변화 클래스는 모두 motion-safe 다", async () => {
  await renderTimeline(119);
  fireEvent.mouseEnter(node(/공식 발표/));

  expectMotionSafe();
});

// 운영에서 같은 날 쌓인 사건의 라벨이 자기 사건보다 아래로 처져, 날짜 줄이 다음 사건 옆에 왔다 (Jira 188)
test("레인 선 위 사건의 라벨은 선 밑에, 선에서 벗어난 사건의 라벨은 이름 줄을 사건 가운데에 맞춘다", async () => {
  await renderTimeline();
  const shiftY = (button: Element) =>
    Number(
      /translate\([-\d.]+,([-\d.]+)\)/.exec(
        labelOf(button).parentElement!.getAttribute("transform")!,
      )![1],
    );

  // 09.15 메인 사건 둘 — 117 은 레인 선 위, 118 은 그 아래로 쌓였다
  expect(shiftY(node(/보조금 지급 확정/))).toBe(6);
  expect(shiftY(node(/추가 투자 승인/))).toBe(-8);
  // 서브 흐름에는 레인 선이 없다
  expect(shiftY(node(/세제 혜택 패키지/))).toBe(-8);
});
