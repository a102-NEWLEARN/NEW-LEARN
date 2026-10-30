import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { MindmapView } from "@/components/article/MindmapView";
import { renderWithProviders } from "@/test/render";

const branch = (type: BranchType, ...texts: string[]): MindmapBranch => ({
  type,
  items: texts.map((text) => ({ text })),
});

// 반응 가지가 없는 기사
const BRANCHES = [
  branch("CORE", "착공식을 열었다"),
  branch("CAUSE", "보조금 조건을 맞추려 했다"),
  branch("OUTLOOK", "양산 목표는 그대로다"),
];

function renderView(branches = BRANCHES) {
  renderWithProviders(<MindmapView title="공장 착공" branches={branches} />);
}

const legend = () => screen.getByRole("group", { name: "가지 보기" });
const chip = (name: string) => within(legend()).getByRole("button", { name });
const graph = () => screen.getByRole("group", { name: "기사 마인드맵" });
const graphBranch = (name: RegExp) =>
  within(graph()).queryByRole("button", { name });
const settingsButton = () => screen.getByRole("button", { name: "탐색 설정" });

test("범례에 있는 가지만 칩으로 두고 처음에는 모두 켜져 있다", () => {
  renderView();

  const chips = within(legend()).getAllByRole("button");
  expect(chips.map((item) => item.textContent)).toEqual([
    "핵심 내용",
    "원인·배경",
    "전망",
  ]);
  expect(chips.map((item) => item.getAttribute("aria-pressed"))).toEqual([
    "true",
    "true",
    "true",
  ]);
});

test("칩을 누르면 그 가지를 숨기고 다시 누르면 되살린다", () => {
  renderView();

  fireEvent.click(chip("원인·배경"));
  expect(chip("원인·배경").getAttribute("aria-pressed")).toBe("false");
  expect(graphBranch(/^원인·배경/)).toBeNull();
  expect(graph().textContent).not.toContain("보조금 조건을 맞추려 했다");

  fireEvent.click(chip("원인·배경"));
  expect(chip("원인·배경").getAttribute("aria-pressed")).toBe("true");
  expect(graphBranch(/^원인·배경/)).not.toBeNull();
});

test("하나라도 숨기면 「모두 보기」로 한 번에 되살린다", () => {
  renderView();
  expect(screen.queryByRole("button", { name: "모두 보기" })).toBeNull();

  fireEvent.click(chip("핵심 내용"));
  fireEvent.click(chip("전망"));
  fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));

  expect(graphBranch(/^핵심 내용/)).not.toBeNull();
  expect(graphBranch(/^전망/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "모두 보기" })).toBeNull();
});

test("전망 가지가 보일 때만 점선 범례 「전망·해석」을 둔다", () => {
  renderView();
  expect(legend().textContent).toContain("전망·해석");

  fireEvent.click(chip("전망"));
  expect(legend().textContent).not.toContain("전망·해석");
});

test("전망 가지가 없는 기사는 점선 범례가 없다", () => {
  renderView([branch("CORE", "가")]);

  expect(legend().textContent).not.toContain("전망·해석");
});

test("라벨 표시를 끄면 잎 글을 숨기고, 강조한 잎만 글을 보인다", () => {
  renderView();
  expect(graph().textContent).toContain("착공식을 열었다");

  fireEvent.click(settingsButton());
  const toggle = within(
    screen.getByRole("dialog", { name: "탐색 설정" }),
  ).getByRole("switch", { name: "라벨 표시" });
  expect((toggle as HTMLInputElement).checked).toBe(true);
  fireEvent.click(toggle);

  expect(graph().textContent).not.toContain("착공식을 열었다");
  // 가지 이름과 가운데 제목은 그대로다
  expect(graph().textContent).toContain("핵심 내용");
  expect(graph().textContent).toContain("공장 착공");
  // 글은 숨겨도 잎 이름은 그대로 읽힌다
  const leaf = within(graph()).getByRole("button", { name: "착공식을 열었다" });
  fireEvent.click(leaf);
  expect(graph().textContent).toContain("착공식을 열었다");
});

test("탐색 설정을 연 채 Esc 를 누르면 설정만 닫고 포커스를 톱니 버튼으로 돌린다", () => {
  renderView();
  const core = () =>
    within(graph()).getByRole("button", { name: /^핵심 내용/ });
  fireEvent.click(core());
  fireEvent.click(settingsButton());
  expect(settingsButton().getAttribute("aria-expanded")).toBe("true");

  fireEvent.keyDown(screen.getByRole("dialog", { name: "탐색 설정" }), {
    key: "Escape",
  });

  expect(screen.queryByRole("dialog", { name: "탐색 설정" })).toBeNull();
  expect(document.activeElement).toBe(settingsButton());
  expect(core().getAttribute("aria-pressed")).toBe("true");

  // 다음 Esc 는 가지 포커스를 푼다
  fireEvent.keyDown(window, { key: "Escape" });
  expect(core().getAttribute("aria-pressed")).toBe("false");
});

test("탐색 설정은 바깥을 누르면 닫힌다", () => {
  renderView();
  fireEvent.click(settingsButton());

  fireEvent.pointerDown(document.body);

  expect(screen.queryByRole("dialog", { name: "탐색 설정" })).toBeNull();
});

test("포커스한 가지를 숨기면 포커스가 풀린다", () => {
  renderView();
  const core = () =>
    within(graph()).getByRole("button", { name: /^핵심 내용/ });
  fireEvent.click(core());

  fireEvent.click(chip("핵심 내용"));
  fireEvent.click(chip("핵심 내용"));

  expect(core().getAttribute("aria-pressed")).toBe("false");
  expect(
    document
      .querySelector('[data-branch="CAUSE"]')!
      .getAttribute("data-dimmed"),
  ).toBeNull();
});
