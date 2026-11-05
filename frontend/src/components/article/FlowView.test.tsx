import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { FlowView } from "@/components/article/FlowView";
import { enterDelay, expectMotionSafe } from "@/test/motion";
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

function renderFlow(branches = BRANCHES) {
  renderWithProviders(
    <FlowView title="한빛반도체 텍사스 공장 착공" branches={branches} />,
  );
}

const card = (name: string | RegExp) => screen.getByRole("button", { name });
const pressed = (name: string | RegExp) =>
  card(name).getAttribute("aria-pressed");
// 가지 하나 — 질문 제목으로 찾은 목록 칸
const step = (question: string) =>
  screen.getByRole("heading", { level: 2, name: question }).closest("li")!;

test("가지를 A9 순서대로 질문 제목 · 번호 · 이름과 잎 수로 둔다", () => {
  renderFlow();

  expect(
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent),
  ).toEqual(["무슨 일이?", "왜 일어났나?", "누가 뭐라고 했나?", "앞으로는?"]);
  const core = within(step("무슨 일이?"));
  expect(core.getByText("1")).toBeDefined();
  expect(core.getByText("핵심 내용 · 2개")).toBeDefined();
  expect(within(step("앞으로는?")).getByText("4")).toBeDefined();
  expect(within(step("앞으로는?")).getByText("전망 · 1개")).toBeDefined();
});

test("빠진 가지는 두지 않고 번호를 당긴다", () => {
  renderFlow([branch("CORE", "가"), branch("OUTLOOK", "라")]);

  expect(screen.queryByRole("heading", { name: "왜 일어났나?" })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "누가 뭐라고 했나?" }),
  ).toBeNull();
  expect(within(step("앞으로는?")).getByText("2")).toBeDefined();
});

test("잎은 그 가지 칸 안에 문장 전체를 이름으로 한 버튼으로 둔다 — Tab · Enter · Space 는 브라우저 기본이다", () => {
  renderFlow();

  const leaf = within(step("무슨 일이?")).getByRole("button", {
    name: "한빛반도체가 텍사스 공장 착공식을 열었다",
  });
  expect(leaf.tagName).toBe("BUTTON");
  expect(leaf.getAttribute("type")).toBe("button");
  // Tab 순서 — 가지 순서, 가지 안에서는 잎 순서
  expect(screen.getAllByRole("button")).toEqual([
    leaf,
    card("첫 해 생산 목표를 밝혔다"),
    card("미국 보조금 조건을 맞추려고 착공을 앞당겼다"),
    card("업계는 인력 수급을 걱정했다"),
    card(/^2028년 양산 목표는 그대로다/),
  ]);
});

test("잎 카드는 가지 질문 · 이름으로 묶는다 — Tab 으로 카드만 옮겨 다녀도 어느 가지인지 읽힌다", () => {
  renderFlow();

  const core = screen.getByRole("group", {
    name: "무슨 일이? 핵심 내용 · 2개",
  });
  expect(within(core).getAllByRole("button")).toEqual([
    card("한빛반도체가 텍사스 공장 착공식을 열었다"),
    card("첫 해 생산 목표를 밝혔다"),
  ]);
  expect(
    screen.getByRole("group", { name: "앞으로는? 전망 · 1개" }),
  ).toBeDefined();
});

test("전망 가지의 잎만 점선 원과 「전망·해석」 표시를 단다", () => {
  renderFlow();

  const outlook = card(/^2028년 양산 목표는 그대로다/);
  expect(within(outlook).getByText("전망·해석")).toBeDefined();
  expect(outlook.querySelector("[data-leaf-mark]")!.className).toContain(
    "border-dashed",
  );
  const reaction = card("업계는 인력 수급을 걱정했다");
  expect(within(reaction).queryByText("전망·해석")).toBeNull();
  expect(reaction.querySelector("[data-leaf-mark]")!.className).not.toContain(
    "border-dashed",
  );
});

test("잎을 누르면 강조하고 나머지 잎을 흐리게 한다. 다른 잎을 누르면 강조를 옮긴다", () => {
  renderFlow();
  const first = "첫 해 생산 목표를 밝혔다";
  const second = "업계는 인력 수급을 걱정했다";

  fireEvent.click(card(first));
  expect(pressed(first)).toBe("true");
  expect(card(second).getAttribute("data-dimmed")).toBe("true");
  expect(card(first).getAttribute("data-dimmed")).toBeNull();

  fireEvent.click(card(second));
  expect(pressed(first)).toBe("false");
  expect(pressed(second)).toBe("true");
  expect(card(first).getAttribute("data-dimmed")).toBe("true");
});

test.each([
  [
    "그 잎을 다시 누르면",
    () => fireEvent.click(card("첫 해 생산 목표를 밝혔다")),
  ],
  [
    "빈 곳을 누르면",
    () => fireEvent.click(screen.getByRole("group", { name: "기사 흐름지도" })),
  ],
  [
    "가지 제목을 누르면",
    () => fireEvent.click(screen.getByRole("heading", { name: "무슨 일이?" })),
  ],
  ["Esc 를 누르면", () => fireEvent.keyDown(window, { key: "Escape" })],
])("%s 강조를 푼다", (_, release) => {
  renderFlow();
  fireEvent.click(card("첫 해 생산 목표를 밝혔다"));

  release();

  expect(pressed("첫 해 생산 목표를 밝혔다")).toBe("false");
  expect(
    card("업계는 인력 수급을 걱정했다").getAttribute("data-dimmed"),
  ).toBeNull();
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
    "한글을 조합하는 중에 누른 Esc",
    () => fireEvent.keyDown(window, { key: "Escape", isComposing: true }),
  ],
  [
    "먼저 받은 쪽이 막은 Esc",
    () => {
      const first = (key: KeyboardEvent) => key.preventDefault();
      window.addEventListener("keydown", first, true);
      fireEvent.keyDown(window, { key: "Escape" });
      window.removeEventListener("keydown", first, true);
    },
  ],
])("%s 로는 강조를 풀지 않는다", (_, press) => {
  renderFlow();
  fireEvent.click(card("첫 해 생산 목표를 밝혔다"));

  press();

  expect(pressed("첫 해 생산 목표를 밝혔다")).toBe("true");
});

// 가지 번호 원 · 질문과 이름 묶음 · 잎 원
const circle = (question: string, n: number) =>
  within(step(question)).getByText(String(n));
const questionBlock = (question: string) =>
  screen.getByRole("heading", { level: 2, name: question }).parentElement!;
const mark = (name: string | RegExp) =>
  card(name).querySelector("[data-leaf-mark]")!;

test("열 때 머리 줄 → 가지 열 차례로 나온다 — 열 안에서는 번호 원 → 질문 → 잎 카드 차례다 (프로토타입 v21)", () => {
  renderFlow();
  const header = screen.getByText("기사 핵심").closest("[aria-hidden]")!;
  const questions = [
    "무슨 일이?",
    "왜 일어났나?",
    "누가 뭐라고 했나?",
    "앞으로는?",
  ];

  for (const element of [
    header,
    circle("무슨 일이?", 1),
    questionBlock("무슨 일이?"),
    card("첫 해 생산 목표를 밝혔다"),
  ])
    expect(element.getAttribute("class")).toMatch(/motion-safe:animate-\[/);
  // 가지 열은 A9 순서로, 머리 줄 뒤에
  const circles = questions.map((question, i) =>
    enterDelay(circle(question, i + 1)),
  );
  expect(enterDelay(header)).toBeLessThan(circles[0]);
  circles.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(circles[i]));
  // 한 열 안에서는 번호 원 → 질문 → 잎 카드(잎 순서대로)
  expect(enterDelay(questionBlock("무슨 일이?"))).toBeGreaterThan(circles[0]);
  expect(
    enterDelay(card("한빛반도체가 텍사스 공장 착공식을 열었다")),
  ).toBeGreaterThan(enterDelay(questionBlock("무슨 일이?")));
  expect(enterDelay(card("첫 해 생산 목표를 밝혔다"))).toBeGreaterThan(
    enterDelay(card("한빛반도체가 텍사스 공장 착공식을 열었다")),
  );
});

test("번호 원이 나온 뒤 다음 가지로 잇는 선이 자란다 — 마지막 가지에는 선이 없다", () => {
  renderFlow();
  const grows = (question: string) =>
    [
      ...step(question).querySelectorAll(
        '[class*="newlearn-grow-x"], [class*="newlearn-grow-y"]',
      ),
    ].map((line) => enterDelay(line));

  // 가로(넓은 자리) · 세로(좁은 자리) 선 하나씩. 어느 쪽이 보일지는 자리 폭이 정한다
  const lines = grows("무슨 일이?");
  expect(lines).toHaveLength(2);
  lines.forEach((at) =>
    expect(at).toBeGreaterThan(enterDelay(circle("무슨 일이?", 1))),
  );
  expect(grows("앞으로는?")).toEqual([]);
});

test("잎 카드는 누르는 동안 살짝 줄어든다 — 누르는 면이 하나인 카드라서다", () => {
  renderFlow();

  expect(card("첫 해 생산 목표를 밝혔다").getAttribute("class")).toContain(
    "motion-safe:active:scale-",
  );
});

test("잎이 많아도 1초 안에 다 나온다 — 차례 지연에 상한이 있다", () => {
  const many = Array.from({ length: 12 }, (_, i) => `잎 ${i + 1}`);
  renderFlow([
    branch("CORE", "가"),
    branch("CAUSE", "나"),
    branch("REACTION", "다"),
    branch("OUTLOOK", ...many),
  ]);

  const last = Math.max(
    ...[...document.querySelectorAll<HTMLElement>("[style]")]
      .map(enterDelay)
      .filter((at) => !Number.isNaN(at)),
  );
  expect(last + 300).toBeLessThanOrEqual(1000);
});

test("강조한 잎의 원이 한 번 튄다 — 다른 잎은 그대로다", () => {
  renderFlow();
  const first = "첫 해 생산 목표를 밝혔다";
  const second = "업계는 인력 수급을 걱정했다";

  expect(mark(first).getAttribute("class")).not.toContain("newlearn-pop-once");
  fireEvent.click(card(first));

  expect(mark(first).getAttribute("class")).toContain("newlearn-pop-once");
  expect(mark(second).getAttribute("class")).not.toContain("newlearn-pop-once");
});

test("움직임은 동작 줄이기를 켜면 빠진다 — 애니메이션 · 크기 변화 클래스는 모두 motion-safe 다", () => {
  renderFlow();
  fireEvent.click(card("첫 해 생산 목표를 밝혔다"));

  expectMotionSafe();
});

test("머리 줄의 기사 제목은 화면 낭독에서 뺀다 — 바로 위 h1 과 같은 글이다", () => {
  renderFlow();

  const title = screen.getByText("한빛반도체 텍사스 공장 착공");
  expect(title.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.getByText("기사 핵심")).toBeDefined();
});
