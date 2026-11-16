import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { expect, onTestFinished, test, vi } from "vitest";
import { fetchTimeline, type TimelineEvent } from "@/api/timeline";
import { IssueFlowSplit } from "@/components/issue/IssueFlowSplit";
import { IssueViewSwitch } from "@/components/issue/IssueViewSwitch";
import { renderWithProviders } from "@/test/render";

// 넓은 화면 세로 보기 (Jira 221). 12번 이슈의 가짜 사건 8개 — 113 이 첫 사건, 119 착공식, 최신은 120(서브)이다 (src/mocks/handlers.ts)
const LATEST = "텍사스 공장 엔지니어 수급 우려 보도";

// 이슈 화면처럼 주소의 ?event= 를 바깥 상태로 쥔다. null 이면 고르지 않은 것이다
function Harness({
  events,
  initial,
  onSelect,
}: {
  events: TimelineEvent[];
  initial: number | null;
  onSelect: (eventId: number) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <IssueFlowSplit
      events={events}
      selectedId={selected}
      onSelect={(eventId) => {
        onSelect(eventId);
        setSelected(eventId);
      }}
      summary="2026.08.04 ~ 10.09 · 사건 8 · 기사 31"
    />
  );
}

async function renderSplit(initial: number | null = null) {
  const { events } = await fetchTimeline(12);
  const onSelect = vi.fn();
  renderWithProviders(
    <Harness events={events} initial={initial} onSelect={onSelect} />,
  );
  return { onSelect };
}

const detail = () => screen.findByRole("complementary", { name: "사건 상세" });
const detailTitle = async (name: string) =>
  within(await detail()).findByRole("heading", { level: 2, name });
const row = (name: RegExp) =>
  within(screen.getByRole("group", { name: "사건 타임라인" })).getByRole(
    "button",
    { name },
  );

test("?event= 없이 열면 최신 사건을 오른쪽 사건 상세에 보이고 그 줄을 고른 것으로 표시한다 — 주소는 바꾸지 않는다", async () => {
  const { onSelect } = await renderSplit();

  expect(await detailTitle(LATEST)).toBeDefined();
  expect(row(/수급 우려/).getAttribute("aria-current")).toBe("true");
  expect(onSelect).not.toHaveBeenCalled();
});

test("도구줄에 이슈 흐름 제목과 기간 · 사건 · 기사 수를 둔다", async () => {
  await renderSplit();

  expect(
    screen.getByRole("heading", { level: 2, name: "이슈 흐름" }),
  ).toBeDefined();
  expect(
    screen.getByText("2026.08.04 ~ 10.09 · 사건 8 · 기사 31"),
  ).toBeDefined();
});

test("?event= 가 있으면 그 사건을 보인다", async () => {
  await renderSplit(119);

  expect(await detailTitle("한빛반도체 텍사스 공장 착공식")).toBeDefined();
  expect(row(/착공식/).getAttribute("aria-current")).toBe("true");
});

test("왼쪽에서 사건을 누르면 그 사건을 고르고 포커스를 오른쪽 사건 제목으로 옮긴다", async () => {
  const { onSelect } = await renderSplit();
  await detailTitle(LATEST);

  fireEvent.click(row(/착공식/));

  expect(onSelect).toHaveBeenCalledWith(119);
  const heading = await detailTitle("한빛반도체 텍사스 공장 착공식");
  await waitFor(() => expect(document.activeElement).toBe(heading));
});

test("처음 골라 둔 최신 사건 줄을 눌러도 주소에 남기고 포커스를 오른쪽 제목으로 옮긴다", async () => {
  const { onSelect } = await renderSplit();
  const heading = await detailTitle(LATEST);

  fireEvent.click(row(/수급 우려/));

  expect(onSelect).toHaveBeenCalledWith(120);
  await waitFor(() => expect(document.activeElement).toBe(heading));
});

test("오른쪽 칸 안에서 Esc 를 누르면 닫지 않고 고른 사건 줄로 포커스를 돌린다", async () => {
  await renderSplit();
  fireEvent.click(row(/착공식/));
  const heading = await detailTitle("한빛반도체 텍사스 공장 착공식");
  await waitFor(() => expect(document.activeElement).toBe(heading));

  fireEvent.keyDown(heading, { key: "Escape" });

  expect(document.activeElement).toBe(row(/착공식/));
  expect(await detail()).toBeDefined();
});

test("이전 · 다음 사건으로 바꾸면 그 사건을 고르되 포커스는 오른쪽 제목으로 옮기지 않는다", async () => {
  const { onSelect } = await renderSplit(119);
  await detailTitle("한빛반도체 텍사스 공장 착공식");

  const next = await within(await detail()).findByRole("button", {
    name: /다음 사건/,
  });
  next.focus();
  fireEvent.click(next);

  expect(onSelect).toHaveBeenCalledWith(120);
  const heading = await detailTitle(LATEST);
  expect(document.activeElement).not.toBe(heading);
});

// jsdom 은 배치를 계산하지 않는다 — 왼쪽 목록 칸은 0~300, 고른 줄은 600~650 에 있는 척한다
function stubListBoxes(eventId: number) {
  const box = (top: number, height: number) =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 400,
      width: 400,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.flowList !== undefined) return box(0, 300);
      if (this.dataset.eventId === String(eventId)) return box(600, 50);
      return box(0, 0);
    },
  );
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
}

const list = () =>
  screen
    .getByRole("group", { name: "사건 타임라인" })
    .closest<HTMLElement>("[data-flow-list]")!;

test("주소로 연 사건이 왼쪽 목록 밖이면 그 줄이 보이게 왼쪽 칸만 스크롤한다", async () => {
  stubListBoxes(117);
  await renderSplit(117);

  // 고른 줄의 아래 끝(650)이 목록 칸 아래 끝(300)에 오도록
  await waitFor(() => expect(list().scrollTop).toBe(350));
});

test("처음 골라 둔 최신 사건은 목록을 스크롤하지 않는다 — 목록은 첫 사건부터 보인다", async () => {
  stubListBoxes(120);
  await renderSplit();
  await detailTitle(LATEST);

  expect(list().scrollTop).toBe(0);
});

// ── 「지도 | 세로」 전환 ──────────────────────────────

test("보기 전환은 지도 · 세로 버튼 묶음이고 고른 보기가 눌린 상태다", () => {
  const onChange = vi.fn();
  renderWithProviders(<IssueViewSwitch view="list" onChange={onChange} />);

  const group = screen.getByRole("group", { name: "이슈 흐름 보기" });
  expect(
    within(group)
      .getByRole("button", { name: "세로" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    within(group)
      .getByRole("button", { name: "지도" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

test("다른 보기를 누르면 바꾸고, 이미 고른 보기를 누르면 아무것도 하지 않는다", () => {
  const onChange = vi.fn();
  renderWithProviders(<IssueViewSwitch view="list" onChange={onChange} />);

  fireEvent.click(screen.getByRole("button", { name: "세로" }));
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "지도" }));
  expect(onChange).toHaveBeenCalledWith("map");
});

test("세로 보기 도구줄에 보기 전환을 둔다", async () => {
  const { events } = await fetchTimeline(12);
  renderWithProviders(
    <IssueFlowSplit
      events={events}
      selectedId={null}
      onSelect={() => {}}
      viewSwitch={<IssueViewSwitch view="list" onChange={() => {}} />}
    />,
  );

  expect(screen.getByRole("group", { name: "이슈 흐름 보기" })).toBeDefined();
});
