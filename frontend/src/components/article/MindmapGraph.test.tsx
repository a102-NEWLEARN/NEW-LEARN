import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { MindmapGraph } from "@/components/article/MindmapGraph";
import { renderWithProviders } from "@/test/render";

const branch = (type: BranchType, ...texts: string[]): MindmapBranch => ({
  type,
  items: texts.map((text) => ({ text })),
});

const BRANCHES = [
  branch(
    "CORE",
    "한빛반도체가 텍사스 공장 착공식을 열었다",
    "첫 해 생산 목표를 밝혔다",
  ),
  branch("CAUSE", "미국 보조금 조건을 맞추려고 착공을 앞당겼다"),
  branch("REACTION", "업계는 인력 수급을 걱정했다"),
  branch("OUTLOOK", "2028년 양산 목표는 그대로다"),
];

function renderGraph(branches = BRANCHES) {
  renderWithProviders(
    <MindmapGraph title="한빛반도체 텍사스 공장 착공" branches={branches} />,
  );
}

const coreBranch = () =>
  screen.getByRole("button", { name: "핵심 내용 · 무슨 일이? · 잎 2개" });
const causeBranch = () =>
  screen.getByRole("button", { name: "원인·배경 · 왜 일어났나? · 잎 1개" });
const leaf = (name: string) => screen.getByRole("button", { name });
// 가지 하나 — 가지 원 · 잎 · 이어 주는 선을 묶은 자리
const branchGroup = (type: BranchType) =>
  document.querySelector(`[data-branch="${type}"]`)!;
const zoomLevel = () =>
  Number(
    within(screen.getByRole("group", { name: "확대 · 축소" }))
      .getByText(/%$/)
      .textContent!.replace("%", ""),
  );

test("가운데 기사 제목 둘레에 가지와 잎을 누를 수 있는 버튼으로 둔다", () => {
  renderGraph();

  expect(
    screen.getByRole("group", { name: "기사 마인드맵" }).textContent,
  ).toContain("한빛반도체 텍사스 공장");
  expect(coreBranch()).toBeDefined();
  expect(causeBranch()).toBeDefined();
  expect(
    screen.getByRole("button", { name: "반응 · 누가 뭐라고 했나? · 잎 1개" }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "전망 · 앞으로는? · 잎 1개" }),
  ).toBeDefined();
  // 잎은 줄을 바꿔 그려도 이름은 문장 전체다
  expect(leaf("한빛반도체가 텍사스 공장 착공식을 열었다")).toBeDefined();
});

test("전망 가지의 잎만 점선으로 그린다 — 전망 · 해석", () => {
  renderGraph();

  const dash = (name: string) =>
    leaf(name)
      .querySelector("[data-leaf-mark]")!
      .getAttribute("stroke-dasharray");
  expect(dash("2028년 양산 목표는 그대로다")).toBeTruthy();
  expect(dash("업계는 인력 수급을 걱정했다")).toBeNull();
});

test("가지를 누르면 그 가지에 맞춰 확대하고 나머지 가지를 흐리게 한다", async () => {
  renderGraph();
  const start = zoomLevel();

  fireEvent.click(coreBranch());

  expect(coreBranch().getAttribute("aria-pressed")).toBe("true");
  expect(branchGroup("CAUSE").getAttribute("data-dimmed")).toBe("true");
  expect(branchGroup("CORE").getAttribute("data-dimmed")).toBeNull();
  await waitFor(() => expect(zoomLevel()).toBeGreaterThan(start));
});

test.each([
  ["그 가지를 다시 누르면", () => fireEvent.click(coreBranch())],
  [
    "빈 곳을 누르면",
    () => fireEvent.click(screen.getByRole("group", { name: "기사 마인드맵" })),
  ],
  ["Esc 를 누르면", () => fireEvent.keyDown(window, { key: "Escape" })],
  [
    "화면에 맞추기를 누르면",
    () =>
      fireEvent.click(screen.getByRole("button", { name: "화면에 맞추기" })),
  ],
])("%s 포커스를 풀고 전체로 돌아간다", async (_, release) => {
  renderGraph();
  const start = zoomLevel();
  fireEvent.click(coreBranch());
  await waitFor(() => expect(zoomLevel()).toBeGreaterThan(start));

  release();

  expect(coreBranch().getAttribute("aria-pressed")).toBe("false");
  expect(branchGroup("CAUSE").getAttribute("data-dimmed")).toBeNull();
  await waitFor(() => expect(zoomLevel()).toBe(start));
});

test("잎을 누르면 강조하고 다시 누르면 푼다 — 확대는 하지 않는다", async () => {
  renderGraph();
  const start = zoomLevel();
  const target = () => leaf("미국 보조금 조건을 맞추려고 착공을 앞당겼다");

  fireEvent.click(target());
  expect(target().getAttribute("aria-pressed")).toBe("true");
  expect(causeBranch().getAttribute("aria-pressed")).toBe("false");
  expect(zoomLevel()).toBe(start);

  fireEvent.click(target());
  expect(target().getAttribute("aria-pressed")).toBe("false");
});

test("다른 잎을 누르면 강조를 옮기고, Esc 로 강조를 푼다", () => {
  renderGraph();
  const first = () => leaf("첫 해 생산 목표를 밝혔다");
  const second = () => leaf("업계는 인력 수급을 걱정했다");

  fireEvent.click(first());
  fireEvent.click(second());
  expect(first().getAttribute("aria-pressed")).toBe("false");
  expect(second().getAttribute("aria-pressed")).toBe("true");

  fireEvent.keyDown(window, { key: "Escape" });
  expect(second().getAttribute("aria-pressed")).toBe("false");
});

test("Enter · Space 로도 누른다", () => {
  renderGraph();

  fireEvent.keyDown(coreBranch(), { key: "Enter" });
  expect(coreBranch().getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(leaf("업계는 인력 수급을 걱정했다"), { key: " " });
  expect(leaf("업계는 인력 수급을 걱정했다").getAttribute("aria-pressed")).toBe(
    "true",
  );
});

test("+ · − 로 확대 · 축소하고 화면에 맞추기로 처음 배율로 돌아간다", async () => {
  renderGraph();
  const start = zoomLevel();

  fireEvent.click(screen.getByRole("button", { name: "확대" }));
  await waitFor(() => expect(zoomLevel()).toBeGreaterThan(start));
  const zoomed = zoomLevel();
  fireEvent.click(screen.getByRole("button", { name: "축소" }));
  await waitFor(() => expect(zoomLevel()).toBeLessThan(zoomed));

  fireEvent.click(screen.getByRole("button", { name: "화면에 맞추기" }));
  await waitFor(() => expect(zoomLevel()).toBe(start));
});

test("없는 가지는 그리지 않는다", () => {
  renderGraph([branch("CORE", "가"), branch("OUTLOOK", "라")]);

  expect(screen.queryByRole("button", { name: /원인·배경/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /반응/ })).toBeNull();
  expect(
    screen.getByRole("button", { name: "전망 · 앞으로는? · 잎 1개" }),
  ).toBeDefined();
});

test.each([
  [
    "다른 창(서랍 등) 안에서 누른 Esc",
    () => {
      const drawer = document.createElement("div");
      drawer.setAttribute("role", "dialog");
      const inside = document.createElement("button");
      drawer.append(inside);
      document.body.append(drawer);
      fireEvent.keyDown(inside, { key: "Escape" });
      drawer.remove();
    },
  ],
  [
    "먼저 받은 쪽(설정 창 등)이 막은 Esc",
    () => {
      const first = (key: KeyboardEvent) => key.preventDefault();
      window.addEventListener("keydown", first, true);
      fireEvent.keyDown(window, { key: "Escape" });
      window.removeEventListener("keydown", first, true);
    },
  ],
])("%s 로는 포커스를 풀지 않는다", (_, press) => {
  renderGraph();
  fireEvent.click(coreBranch());

  press();

  expect(coreBranch().getAttribute("aria-pressed")).toBe("true");
});

test("가지마다 그 가지 이름의 묶음으로 가지 원과 잎을 묶는다", () => {
  renderGraph();

  const cause = screen.getByRole("group", { name: "원인·배경" });
  expect(
    within(cause).getByRole("button", {
      name: "미국 보조금 조건을 맞추려고 착공을 앞당겼다",
    }),
  ).toBeDefined();
  expect(within(cause).getByRole("button", { name: /^원인·배경 ·/ })).toBe(
    causeBranch(),
  );
});

test("가운데 기사 제목은 화면 낭독에서 뺀다 — 바로 위 h1 과 같은 글이다", () => {
  renderGraph();

  const title = screen.getByText("한빛반도체 텍사스 공장");
  expect(title.closest('[aria-hidden="true"]')).not.toBeNull();
});
