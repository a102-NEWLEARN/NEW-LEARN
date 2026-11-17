import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { MindmapGraph } from "@/components/article/MindmapGraph";
import { boundsOf, layoutMindmap } from "@/components/article/mindmapLayout";
import { stubScreen } from "@/test/media";
import { enterDelay, expectMotionSafe, lastEnterEnd } from "@/test/motion";
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
    <MindmapGraph
      articleId={409}
      title="한빛반도체 텍사스 공장 착공"
      branches={branches}
    />,
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

// 노드가 나오는 묶음 — 가운데는 튀어나오고 가지 · 잎은 날아 나온다. 가운데 기사 제목은 화면 낭독에서 뺀 묶음 안이다
const popIn = (node: Element) =>
  node.querySelector(
    '[class*="newlearn-fly-out"], [class*="newlearn-spring-in"]',
  )!;
// 노드 자리 — transform="translate(x,y)"
const position = (node: Element) =>
  node
    .getAttribute("transform")!
    .match(/translate\(([-\d.]+),([-\d.]+)\)/)!
    .slice(1)
    .map(Number);
// 날아 나오는 출발점 — 제자리에서 잰 거리
const flyFrom = (node: Element) => {
  const style = (popIn(node) as SVGElement).style;
  return ["--nl-from-x", "--nl-from-y"].map((name) =>
    Number.parseFloat(style.getPropertyValue(name)),
  );
};
const rootNode = () =>
  screen.getByText("한빛반도체 텍사스 공장").closest('[aria-hidden="true"]')!;
const branchNode = (type: BranchType) =>
  branchGroup(type).querySelector('[role="button"]')!;
// 가지의 선 — 가운데에서 가지로, 그다음 가지에서 잎으로 (잎 순서)
const lines = (type: BranchType) => [
  ...branchGroup(type).querySelectorAll(":scope > line"),
];
const faded = (element: Element) => element.getAttribute("data-faded");
const strokeOf = (element: Element) => element.getAttribute("class") ?? "";
const mark = (name: string) => leaf(name).querySelector("[data-leaf-mark]")!;
const MOUSE = { pointerType: "mouse" };

test("열 때 가운데 → 가지 → 잎 차례로 나온다 — 선은 날아가는 노드를 따라 뻗는다. 가지는 A9 순서다", () => {
  renderGraph();
  const [coreLine, firstLeafLine] = lines("CORE");
  const first = leaf("한빛반도체가 텍사스 공장 착공식을 열었다");
  const second = leaf("첫 해 생산 목표를 밝혔다");

  for (const element of [popIn(rootNode()), popIn(coreBranch()), coreLine])
    expect(element.getAttribute("class")).toMatch(/motion-safe:animate-\[/);
  expect(enterDelay(popIn(rootNode()))).toBe(0);
  expect(enterDelay(coreLine)).toBe(enterDelay(popIn(coreBranch())));
  expect(enterDelay(popIn(coreBranch()))).toBeLessThan(
    enterDelay(firstLeafLine),
  );
  expect(enterDelay(firstLeafLine)).toBe(enterDelay(popIn(first)));
  expect(enterDelay(popIn(first))).toBeLessThan(enterDelay(popIn(second)));
  const branchDelays = (["CORE", "CAUSE", "REACTION", "OUTLOOK"] as const).map(
    (type) => enterDelay(popIn(branchNode(type))),
  );
  branchDelays
    .slice(1)
    .forEach((at, i) => expect(at).toBeGreaterThan(branchDelays[i]));
  // 선은 시작점에서 끝점으로 뻗는다 — 길이와 상관없이 1 로 잰다
  expect(coreLine.getAttribute("pathLength")).toBe("1");
});

test("가지에 마우스를 올리면 그 가지 · 잎 · 선만 또렷이 두고 나머지는 흐린다. 이어진 선은 진하게 칠한다", () => {
  renderGraph();
  const [coreLine, firstLeafLine] = lines("CORE");

  fireEvent.pointerEnter(coreBranch(), MOUSE);

  expect(faded(coreBranch())).toBeNull();
  expect(faded(leaf("첫 해 생산 목표를 밝혔다"))).toBeNull();
  expect(faded(coreLine)).toBeNull();
  expect(faded(causeBranch())).toBe("true");
  expect(faded(leaf("미국 보조금 조건을 맞추려고 착공을 앞당겼다"))).toBe(
    "true",
  );
  expect(faded(lines("CAUSE")[0])).toBe("true");
  expect(strokeOf(coreLine)).toContain("stroke-mindmap-core-stroke");
  expect(strokeOf(firstLeafLine)).toContain("stroke-mindmap-core-stroke");
  expect(strokeOf(lines("CAUSE")[0])).toContain("stroke-mindmap-cause-line");

  fireEvent.pointerLeave(coreBranch(), MOUSE);
  expect(faded(causeBranch())).toBeNull();
  expect(strokeOf(coreLine)).toContain("stroke-mindmap-core-line");
});

test("잎에 마우스를 올리면 가운데에서 그 잎까지의 길만 또렷이 둔다 — 같은 가지의 다른 잎도 흐린다", () => {
  renderGraph();
  const [coreLine, firstLeafLine, secondLeafLine] = lines("CORE");

  fireEvent.pointerEnter(leaf("첫 해 생산 목표를 밝혔다"), MOUSE);

  expect(faded(leaf("첫 해 생산 목표를 밝혔다"))).toBeNull();
  expect(faded(coreBranch())).toBeNull();
  expect(faded(coreLine)).toBeNull();
  expect(faded(secondLeafLine)).toBeNull();
  expect(faded(leaf("한빛반도체가 텍사스 공장 착공식을 열었다"))).toBe("true");
  expect(faded(firstLeafLine)).toBe("true");
  expect(faded(causeBranch())).toBe("true");
  expect(strokeOf(coreLine)).toContain("stroke-mindmap-core-stroke");
  expect(strokeOf(secondLeafLine)).toContain("stroke-mindmap-core-stroke");
  expect(strokeOf(firstLeafLine)).toContain("stroke-mindmap-core-line");
});

test("마우스를 올린 노드는 커지고, 잎이면 글이 진해진다", () => {
  renderGraph();
  const scaled = (node: Element) =>
    node.querySelector('[class*="motion-safe:scale-[1.12]"]');
  const text = (name: string) =>
    leaf(name).querySelector("text")!.getAttribute("class");

  fireEvent.pointerEnter(coreBranch(), MOUSE);
  expect(scaled(coreBranch())).not.toBeNull();
  expect(scaled(causeBranch())).toBeNull();

  fireEvent.pointerLeave(coreBranch(), MOUSE);
  fireEvent.pointerEnter(leaf("첫 해 생산 목표를 밝혔다"), MOUSE);
  expect(scaled(leaf("첫 해 생산 목표를 밝혔다"))).not.toBeNull();
  expect(text("첫 해 생산 목표를 밝혔다")).not.toContain(
    "fill-fg-neutral-muted",
  );
  expect(text("한빛반도체가 텍사스 공장 착공식을 열었다")).toContain(
    "fill-fg-neutral-muted",
  );
});

test("가지를 포커스한 동안 흐린 가지에 마우스를 올려도 포커스한 가지를 흐리지 않는다 — 포커스한 가지 안에서는 호버가 돈다", () => {
  renderGraph();
  fireEvent.click(coreBranch());

  fireEvent.pointerEnter(causeBranch(), MOUSE);
  expect(faded(coreBranch())).toBeNull();
  expect(faded(leaf("첫 해 생산 목표를 밝혔다"))).toBeNull();

  fireEvent.pointerLeave(causeBranch(), MOUSE);
  fireEvent.pointerEnter(leaf("첫 해 생산 목표를 밝혔다"), MOUSE);
  expect(faded(leaf("한빛반도체가 텍사스 공장 착공식을 열었다"))).toBe("true");
});

test("키보드로 옮긴 노드는 흐리지 않는다 — 키보드 포커스는 늘 보인다", () => {
  renderGraph();
  fireEvent.click(coreBranch());
  fireEvent.pointerEnter(coreBranch(), MOUSE);

  fireEvent.keyDown(window, { key: "Tab" });
  fireEvent.focus(causeBranch());

  // 가지 포커스로 흐린 가지도, 마우스 호버로 흐린 노드도 키보드 포커스를 받으면 또렷하다
  expect(branchGroup("CAUSE").getAttribute("data-dimmed")).toBeNull();
  expect(faded(causeBranch())).toBeNull();
  fireEvent.blur(causeBranch());
  expect(branchGroup("CAUSE").getAttribute("data-dimmed")).toBe("true");
});

test("잎이 많아도 2초 안에 다 나온다 — 차례 지연에 상한이 있다", () => {
  const many = Array.from({ length: 12 }, (_, i) => `잎 ${i + 1}`);
  renderGraph([
    branch("CORE", "가"),
    branch("CAUSE", "나"),
    branch("REACTION", "다"),
    branch("OUTLOOK", ...many),
  ]);

  expect(lastEnterEnd()).toBeGreaterThan(0);
  expect(lastEnterEnd()).toBeLessThanOrEqual(2000);
});

test("가지는 가운데에서, 잎은 그 가지에서 날아 나온다", () => {
  renderGraph();
  const [bx, by] = position(coreBranch());
  const [fx, fy] = flyFrom(coreBranch());
  expect([bx + fx, by + fy]).toEqual([0, 0]);

  const first = leaf("첫 해 생산 목표를 밝혔다");
  const [lx, ly] = position(first);
  const [lfx, lfy] = flyFrom(first);
  expect([lx + lfx, ly + lfy]).toEqual([bx, by]);
});

test("가운데 원에서 파문이 번진다 — 꾸밈이라 처음에는 보이지 않는 채로 둔다", () => {
  renderGraph();

  const ripples = rootNode().querySelectorAll('[class*="newlearn-ripple"]');
  expect(ripples.length).toBeGreaterThanOrEqual(2);
  ripples.forEach((ring) =>
    expect(ring.getAttribute("class")).toContain("opacity-0"),
  );
});

// 운영에서 잎 글자가 계속 위아래로 움직여 읽기 어려웠다 — 잎은 날아 나온 뒤 제자리에 선다 (Jira 188)
test("잎은 날아 나온 뒤 떠다니지 않는다", () => {
  renderGraph();

  [
    "한빛반도체가 텍사스 공장 착공식을 열었다",
    "첫 해 생산 목표를 밝혔다",
  ].forEach((name) =>
    expect(leaf(name).querySelector('[class*="newlearn-float"]')).toBeNull(),
  );
  expect(document.querySelector('[class*="newlearn-float"]')).toBeNull();
});

test("마우스를 올린 길에는 점선이 바깥쪽으로 흐른다 — 가지면 그 잎들까지, 잎이면 그 잎까지", () => {
  renderGraph();
  const flows = (type: BranchType) =>
    branchGroup(type).querySelectorAll("[data-flow]").length;
  expect(flows("CORE")).toBe(0);

  fireEvent.pointerEnter(coreBranch(), MOUSE);
  expect(flows("CORE")).toBe(3);
  expect(flows("CAUSE")).toBe(0);

  fireEvent.pointerLeave(coreBranch(), MOUSE);
  fireEvent.pointerEnter(leaf("첫 해 생산 목표를 밝혔다"), MOUSE);
  expect(flows("CORE")).toBe(2);
});

test("강조한 잎에는 파문이 한 번 번진다", () => {
  renderGraph();
  const ripple = (name: string) =>
    leaf(name).querySelector('[class*="newlearn-ripple"]');

  fireEvent.click(leaf("첫 해 생산 목표를 밝혔다"));

  expect(ripple("첫 해 생산 목표를 밝혔다")).not.toBeNull();
  expect(ripple("한빛반도체가 텍사스 공장 착공식을 열었다")).toBeNull();
});

test("손가락으로 누를 때는 흐리지 않는다 — 터치는 누르면 마우스 흉내가 와서 강조와 겹친다", () => {
  renderGraph();

  fireEvent.pointerEnter(causeBranch(), { pointerType: "touch" });

  expect(faded(coreBranch())).toBeNull();
});

test("마우스를 올린 가지를 범례로 숨기면 흐림을 푼다 — 숨긴 노드에서는 마우스가 떠났다는 알림이 오지 않는다", () => {
  const { rerender } = renderWithProviders(
    <MindmapGraph
      articleId={409}
      title="한빛반도체 텍사스 공장 착공"
      branches={BRANCHES}
    />,
  );
  fireEvent.pointerEnter(causeBranch(), MOUSE);
  expect(faded(coreBranch())).toBe("true");

  rerender(
    <MindmapGraph
      articleId={409}
      title="한빛반도체 텍사스 공장 착공"
      branches={BRANCHES}
      hidden={new Set(["CAUSE"])}
    />,
  );

  expect(faded(coreBranch())).toBeNull();
});

test("강조한 잎은 원이 한 번 튀고, 가운데에서 그 잎까지 선을 진하게 칠한다", () => {
  renderGraph();
  const [coreLine, firstLeafLine, secondLeafLine] = lines("CORE");

  fireEvent.click(leaf("첫 해 생산 목표를 밝혔다"));

  expect(strokeOf(mark("첫 해 생산 목표를 밝혔다"))).toContain(
    "newlearn-pop-once",
  );
  expect(
    strokeOf(mark("한빛반도체가 텍사스 공장 착공식을 열었다")),
  ).not.toContain("newlearn-pop-once");
  expect(strokeOf(coreLine)).toContain("stroke-mindmap-core-stroke");
  expect(strokeOf(secondLeafLine)).toContain("stroke-mindmap-core-stroke");
  expect(strokeOf(firstLeafLine)).toContain("stroke-mindmap-core-line");
});

test("가지 포커스 밖은 흐리게 하고 살짝 번지게 한다 (프로토타입 v21)", () => {
  renderGraph();

  fireEvent.click(coreBranch());

  expect(branchGroup("CAUSE").getAttribute("class")).toContain("blur-");
  expect(branchGroup("CORE").getAttribute("class")).not.toContain("blur-");
});

test("움직임은 동작 줄이기를 켜면 빠진다 — 애니메이션 · 크기 변화 클래스는 모두 motion-safe 다", () => {
  renderGraph();
  fireEvent.click(leaf("첫 해 생산 목표를 밝혔다"));
  fireEvent.pointerEnter(coreBranch(), MOUSE);

  expectMotionSafe();
});

// 폰 폭(393 × 600)으로 잰다 — jsdom 은 크기를 못 재서 어림값을 쓴다
function phoneSize() {
  const width = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(393);
  const height = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(600);
  return () => {
    width.mockRestore();
    height.mockRestore();
  };
}

// 지도 전체를 옮기고 키우는 변환 — d3-zoom 이 맞춘 「translate(x,y) scale(k)」
function viewTransform() {
  const value = screen
    .getByRole("group", { name: "기사 마인드맵" })
    .querySelector(":scope > g")!
    .getAttribute("transform")!;
  const [x, y, k] = value.match(/-?[\d.]+(e-?\d+)?/g)!.map(Number);
  return { x, y, k };
}

// 처음 열면 가운데 기사 제목이 칸 가운데, 지도 전체가 칸 안 (2026-11-12 사용자 「메인이 가장 가운데로」 「모두 보이게」, Jira 195).
// 전에는 폰에서 글자를 읽게 72% 아래로 줄이지 않아 가장자리가 잘렸다
test.each([
  ["폰 폭(393 × 600)", "narrow", phoneSize],
  ["넓은 화면(960 × 560)", "wide", () => () => {}],
] as const)(
  "%s — 처음 열면 가운데 기사 제목을 칸 가운데 두고 지도 전체가 들어오게 맞춘다",
  async (_, screenWidth, size) => {
    stubScreen(screenWidth);
    const restore = size();
    try {
      renderGraph();
      const [width, height] =
        screenWidth === "narrow" ? [393, 600] : [960, 560];
      await waitFor(() =>
        expect(viewTransform()).toMatchObject({ x: width / 2, y: height / 2 }),
      );
      const { k } = viewTransform();
      const bounds = boundsOf(
        layoutMindmap("한빛반도체 텍사스 공장 착공", BRANCHES),
      );
      // 원점에서 가장 먼 가장자리까지 가로 · 세로 모두 칸 반쪽 안에 든다
      expect(k * Math.max(-bounds.x0, bounds.x1)).toBeLessThanOrEqual(
        width / 2,
      );
      expect(k * Math.max(-bounds.y0, bounds.y1)).toBeLessThanOrEqual(
        height / 2,
      );
      expect(k).toBeLessThanOrEqual(1.15);
    } finally {
      restore();
    }
  },
);

// 기사 머리 h1 과 같은 제목이 가운데 원에 또 보였다 — PRD FR-6 대로 제목은 두되, 앞의 말머리는 뺀다 (2026-11-12 사용자 QA, Jira 197)
test("가운데 원은 제목 앞의 말머리([속보] 등)를 빼고 보인다", () => {
  renderWithProviders(
    <MindmapGraph
      articleId={409}
      title='[속보] 임광현 "긴급 소방 재원 미래기금 활용…국회와 협의"'
      branches={BRANCHES}
    />,
  );

  const center = [...document.querySelectorAll("text")].find((text) =>
    text.textContent?.startsWith("임광현"),
  );
  expect(center).toBeDefined();
  expect(document.body.textContent).not.toContain("[속보]");
});
