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

test("노드를 누르거나 Enter · Space 로 고른다", async () => {
  const { onSelect } = await renderTimeline();

  fireEvent.click(node(/착공식/));
  fireEvent.keyDown(node(/보조금 지급 확정/), { key: "Enter" });
  fireEvent.keyDown(node(/추가 투자 승인/), { key: " " });

  expect(onSelect.mock.calls).toEqual([[119], [117], [118]]);
});

test("고른 사건은 눌린 버튼으로 읽히고 시간축에 그 날짜를 띄운다", async () => {
  await renderTimeline(119);

  expect(node(/착공식/).getAttribute("aria-pressed")).toBe("true");
  expect(node(/공식 발표/).getAttribute("aria-pressed")).toBe("false");
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
  expect(tip.textContent).toContain("메인 흐름에서 갈라진");
  expect(tip.textContent).toContain("추정");

  fireEvent.click(within(tip).getByRole("button", { name: "TIP 닫기" }));
  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
});
