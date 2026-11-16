import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { fetchTimeline } from "@/api/timeline";
import { TimelineList } from "@/components/issue/TimelineList";
import { enterDelay, expectMotionSafe, lastEnterEnd } from "@/test/motion";

// 12번 이슈의 가짜 사건 8개 — 메인 5 · 서브 3, 같은 시각 사건과 「추정」 사건이 있다 (src/mocks/handlers.ts)
async function renderList(selectedId: number | null = null) {
  const { events } = await fetchTimeline(12);
  const onSelect = vi.fn();
  render(
    <TimelineList
      events={events}
      selectedId={selectedId}
      onSelect={onSelect}
      summary="2026.08.04 ~ 10.09 · 사건 8 · 기사 31"
    />,
  );
  return { onSelect, events };
}

const eventButtons = () =>
  screen.getAllByRole("button", { name: /(메인|서브) 흐름/ });
const node = (name: RegExp) => screen.getByRole("button", { name });

test("사건을 시간 순서대로 날짜 · 제목 · 레인 · 기사 수를 읽어 주는 버튼으로 둔다 — 가로 지도와 같은 이름이다", async () => {
  await renderList();

  const buttons = eventButtons();
  expect(buttons).toHaveLength(8);
  expect(buttons[1].getAttribute("aria-label")).toBe(
    "08.21 한빛반도체, 텍사스 공장 투자 확대 공식 발표, 메인 흐름, 기사 5건",
  );
  expect(buttons.at(-1)!.getAttribute("aria-label")).toContain("엔지니어");
  expect(node(/세제 혜택 패키지/).getAttribute("aria-label")).toMatch(
    /^08\.21 추정 /,
  );
});

test("폰에서도 제목 전체와 날짜 · 기사 수를 줄이지 않고 보인다", async () => {
  await renderList();

  const ceremony = node(/착공식/);
  expect(
    within(ceremony).getByText("한빛반도체 텍사스 공장 착공식"),
  ).toBeDefined();
  expect(within(ceremony).getByText("10.06 · 기사 5건")).toBeDefined();
});

test("달마다 제목을 둔다 — 첫 달과 해가 바뀐 달은 연도까지", async () => {
  await renderList();

  expect(
    screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent),
  ).toEqual(["2026년 8월", "9월", "10월"]);
});

test("서브 흐름 사건은 들여쓰고 메인 흐름 선에서 점선으로 갈라진다 (DESIGN.md 타임라인 노드)", async () => {
  await renderList();

  const sub = node(/세제 혜택 패키지/);
  const main = node(/공식 발표/);
  expect(sub.getAttribute("data-lane")).toBe("SUB");
  expect(main.getAttribute("data-lane")).toBe("MAIN");
  expect(sub.querySelector("[data-branch-line]")).not.toBeNull();
  expect(main.querySelector("[data-branch-line]")).toBeNull();
});

// 가로 지도와 같은 규칙 — 최신 사건은 짙은 청록, 고른 사건은 채움 대신 고리 (2026-11-16 디자인 피드백, Jira 216)
const fillOf = (button: HTMLElement) =>
  button.querySelector("[data-node]")?.getAttribute("class") ?? "";

test("가장 늦게 일어난 사건 하나만 최신 사건으로 짙은 청록 노드에 두고 이름에 「최신 사건」을 붙인다", async () => {
  await renderList();

  const latest = node(/엔지니어 수급 우려/);
  expect(latest.getAttribute("data-latest")).toBe("true");
  expect(latest.getAttribute("aria-label")).toMatch(/, 최신 사건$/);
  expect(screen.getAllByRole("button", { name: /최신 사건/ })).toHaveLength(1);
  expect(fillOf(latest)).toContain("bg-bg-brand-solid");
  expect(fillOf(node(/착공식/))).toContain("bg-bg-brand-accent");
});

test("고른 사건은 채움을 바꾸지 않고 둘레에 고리를 둔다", async () => {
  await renderList(119);

  const ceremony = node(/착공식/);
  expect(fillOf(ceremony)).toContain("bg-bg-brand-accent");
  expect(fillOf(ceremony)).not.toContain("bg-bg-brand-solid");
  expect(ceremony.querySelector("[data-selected-ring]")).not.toBeNull();
  expect(node(/공식 발표/).querySelector("[data-selected-ring]")).toBeNull();
});

test("사건을 누르면 고르고, 고른 사건은 지금 고른 것(aria-current)으로 읽힌다", async () => {
  const { onSelect } = await renderList(119);

  expect(node(/착공식/).getAttribute("aria-current")).toBe("true");
  expect(node(/공식 발표/).getAttribute("aria-current")).toBeNull();
  fireEvent.click(node(/공식 발표/));
  expect(onSelect).toHaveBeenCalledWith(114);
  // 시트를 닫을 때 화면이 이 사건으로 포커스를 돌린다
  expect(node(/착공식/).getAttribute("data-event-id")).toBe("119");
});

test("레인 뜻 · 「추정」 뜻은 TIP 으로 연다", async () => {
  await renderList();

  fireEvent.click(screen.getByRole("button", { name: "TIP" }));

  expect(
    within(screen.getByRole("dialog", { name: "타임라인 TIP" })).getByText(
      /첫 기사가 나온 때/,
    ),
  ).toBeDefined();
});

test("열 때 메인 흐름 선이 위에서 아래로 자라며 사건이 차례로 나온다", async () => {
  await renderList();
  const pop = (button: Element) =>
    button.querySelector('[class*="newlearn-spring-in"]')!;

  const delays = eventButtons().map((button) => enterDelay(pop(button)));
  delays.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(delays[i]));
  const rail = document.querySelector("[data-rail]")!;
  expect(rail.getAttribute("class")).toContain("newlearn-grow-y");
});

test("사건이 많아도 2초 안에 다 나온다 — 움직임은 동작 줄이기를 켜면 빠진다", async () => {
  const { events } = await fetchTimeline(12);
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...events[i % events.length],
    id: 1000 + i,
    occurredAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
  }));
  render(<TimelineList events={many} selectedId={1003} onSelect={vi.fn()} />);

  expect(lastEnterEnd()).toBeGreaterThan(0);
  expect(lastEnterEnd()).toBeLessThanOrEqual(2000);
  expectMotionSafe();
});
