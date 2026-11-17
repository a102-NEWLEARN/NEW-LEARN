import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { FlowView } from "@/components/article/FlowView";
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

const SUMMARY = "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다";

function renderFlow(branches = BRANCHES, summary: string | null = SUMMARY) {
  renderWithProviders(
    <FlowView articleId={409} summary={summary} branches={branches} />,
  );
}

const card = (name: string | RegExp) => screen.getByRole("button", { name });
const pressed = (name: string | RegExp) =>
  card(name).getAttribute("aria-pressed");
// 가지 하나 — 질문 제목으로 찾은 목록 칸
const step = (question: string) =>
  screen.getByRole("heading", { level: 2, name: question }).closest("li")!;

// F13 용어사전 — 잎 글은 드래그 대상(data-meaning)이고, 드래그 끝에 따라오는 클릭은 강조로 치지 않는다
test("잎 글을 드래그한 끝의 클릭은 강조하지 않는다 — 그냥 누르면 강조한다", () => {
  renderFlow();
  const leaf = "한빛반도체가 텍사스 공장 착공식을 열었다";
  const text = within(card(leaf)).getByText(leaf);
  expect(text.getAttribute("data-meaning")).toBe("ARTICLE:409");
  expect(card(leaf).className).toContain("select-text");

  const range = document.createRange();
  range.setStart(text.firstChild!, 0);
  range.setEnd(text.firstChild!, 5);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  // 마우스 클릭은 detail 이 1 이상이다
  fireEvent.click(card(leaf), { detail: 1 });
  expect(pressed(leaf)).toBe("false");

  window.getSelection()!.removeAllRanges();
  fireEvent.click(card(leaf), { detail: 1 });
  expect(pressed(leaf)).toBe("true");
});

test("선택이 남아 있어도 키보드(Enter · Space)로 낸 클릭은 강조한다 — detail 이 0 이다", () => {
  renderFlow();
  const leaf = "한빛반도체가 텍사스 공장 착공식을 열었다";
  const text = within(card(leaf)).getByText(leaf);
  const range = document.createRange();
  range.setStart(text.firstChild!, 0);
  range.setEnd(text.firstChild!, 5);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);

  fireEvent.click(card(leaf), { detail: 0 });

  expect(pressed(leaf)).toBe("true");
  window.getSelection()!.removeAllRanges();
});

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

// 넓은 자리에서 4열 고정이면 두 갈래 기사가 왼쪽에 좁게 몰리고 문장이 길게 꺾였다 → 가지 수만큼 열을 두고 최대 폭도 줄인다
// (2026-11-16 디자인 피드백, Jira 216). 가지가 하나면 넓은 자리에서도 세로다
const columns = () => step("무슨 일이?").parentElement!;

test("넓은 자리에서는 가지 수만큼 열을 둔다 — 두 갈래면 2열 · 960px, 네 갈래면 4열 · 1280px", () => {
  renderFlow([branch("CORE", "가"), branch("OUTLOOK", "라")]);
  expect(columns().className).toContain("@min-[1024px]:grid-cols-2");
  expect(columns().parentElement!.className).toContain(
    "@min-[1024px]:max-w-[960px]",
  );
  cleanup();

  renderFlow();
  expect(columns().className).toContain("@min-[1024px]:grid-cols-4");
  expect(columns().parentElement!.className).toContain(
    "@min-[1024px]:max-w-[1280px]",
  );
});

test("가지가 하나면 넓은 자리에서도 세로로 둔다", () => {
  renderFlow([branch("CORE", "가", "나")]);

  expect(columns().className).not.toContain("@min-[1024px]:grid-cols");
  expect(step("무슨 일이?").className).not.toContain("@min-[1024px]:flex");
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

// 2026-11-13 사용자 QA 9 — 누르면 진해지기만 해서 뜻이 모호했다 → 누른 카드를 키우고 그 아래에 가지가 무엇인지 한 줄,
// 나머지는 더 흐리게 (Jira 204)
test("잎을 누르면 그 카드를 키워 띄우고 아래에 가지 설명 한 줄을 붙인다 — 카드가 그 설명을 가리킨다. 나머지는 더 흐리다", () => {
  renderFlow();
  const leaf = "미국 보조금 조건을 맞추려고 착공을 앞당겼다";
  const other = "업계는 인력 수급을 걱정했다";
  expect(screen.queryByText(/이 일이 일어난 까닭/)).toBeNull();

  fireEvent.click(card(leaf));

  const note = screen.getByText(
    "원인·배경 — 직접 원인과 오래 쌓인 배경을 나눠 보면 사건이 또렷해져요",
  );
  expect(card(leaf).getAttribute("aria-describedby")).toBe(note.id);
  expect(card(leaf).className).toContain("motion-safe:scale-[1.04]");
  expect(card(leaf).className).toContain("shadow-");
  expect(card(other).className).toContain("opacity-35");

  fireEvent.click(card(other));
  expect(screen.queryByText(/이 일이 일어난 까닭/)).toBeNull();
  expect(
    screen.getByText("반응 — 누가 어느 편에 섰는지 나눠 보면 쟁점이 보여요"),
  ).toBeDefined();
  expect(card(leaf).hasAttribute("aria-describedby")).toBe(false);
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
  const header = screen.getByText("기사 핵심").closest("div")!;
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

test("잎이 많아도 2초 안에 다 나온다 — 차례 지연에 상한이 있다", () => {
  const many = Array.from({ length: 12 }, (_, i) => `잎 ${i + 1}`);
  renderFlow([
    branch("CORE", "가"),
    branch("CAUSE", "나"),
    branch("REACTION", "다"),
    branch("OUTLOOK", ...many),
  ]);

  expect(lastEnterEnd()).toBeGreaterThan(0);
  expect(lastEnterEnd()).toBeLessThanOrEqual(2000);
});

test("선이 자라는 동안 점 하나가 다음 번호로 달려간다 — 가로 · 세로 하나씩, 마지막 가지에는 없다", () => {
  renderFlow();
  const travels = (question: string) => [
    ...step(question).querySelectorAll('[class*="newlearn-travel"]'),
  ];

  const dots = travels("무슨 일이?");
  expect(dots).toHaveLength(2);
  const line = step("무슨 일이?").querySelector('[class*="newlearn-grow-x"]')!;
  dots.forEach((dot) => {
    expect(enterDelay(dot)).toBe(enterDelay(line));
    // 꾸밈이라 달리는 동안만 보인다 — 동작 줄이기면 끝까지 보이지 않는다
    expect(dot.getAttribute("class")).toContain("opacity-0");
  });
  expect(travels("앞으로는?")).toEqual([]);
});

test("번호 원 · 머리 줄 점에서 파문이 번진다 — 꾸밈이라 처음에는 보이지 않는 채로 둔다", () => {
  renderFlow();
  const header = screen.getByText("기사 핵심").closest("div")!;

  for (const place of [step("무슨 일이?"), step("앞으로는?"), header]) {
    const ripple = place.querySelector('[class*="newlearn-ripple"]');
    expect(ripple).not.toBeNull();
    expect(ripple!.getAttribute("class")).toContain("opacity-0");
  }
});

test("잎 카드에 마우스를 올리면 살짝 들리고 원이 커진다", () => {
  renderFlow();

  expect(card("첫 해 생산 목표를 밝혔다").getAttribute("class")).toContain(
    "motion-safe:hover:-translate-y-",
  );
  expect(mark("첫 해 생산 목표를 밝혔다").getAttribute("class")).toContain(
    "motion-safe:group-hover:scale-",
  );
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

// 머리 줄이 바로 위 h1 과 같은 기사 제목이라 같은 글이 두 번 보였다 → AI 한 줄 요지(A8 summary)를 둔다
// (2026-11-12 사용자 QA, Jira 197). h1 과 다른 글이라 낭독하고, 좁은 자리에서도 숨기지 않는다
test("머리 줄은 기사 제목이 아니라 AI 한 줄 요지다 — h1 과 다른 글이라 낭독하고 좁은 자리에서도 둔다", () => {
  renderFlow();

  const summary = screen.getByText(SUMMARY);
  expect(summary.closest("[aria-hidden]")).toBeNull();
  const header = screen.getByText("기사 핵심").closest("div")!;
  expect(header.contains(summary)).toBe(true);
  expect(header.className).not.toContain("hidden");
});

// 요약부터 눈이 가게 기사 핵심 줄을 옅은 민트 칸에 넣는다 (2026-11-16 디자인 피드백, Jira 216)
test("기사 핵심 줄은 옅은 민트 칸에 둔다", () => {
  renderFlow();

  expect(screen.getByText("기사 핵심").closest("div")!.className).toContain(
    "bg-bg-brand-weak",
  );
});

// 요지 줄도 드래그하면 용어사전 「의미」가 뜬다 — A26 이 기사 요지를 화면 글로 받는다 (2026-11-13 사용자, Jira 202)
test("머리 줄 요지는 용어사전 드래그 대상이다 — 기사 대상, 글은 요지 그대로", () => {
  renderFlow();

  const summary = screen.getByText(SUMMARY);
  expect(summary.getAttribute("data-meaning")).toBe("ARTICLE:409");
  expect(summary.textContent).toBe(SUMMARY);
});

test("요지가 없거나 공백뿐이면 머리 줄을 두지 않는다", () => {
  renderFlow(BRANCHES, "   ");
  expect(screen.queryByText("기사 핵심")).toBeNull();
  cleanup();

  renderFlow(BRANCHES, null);

  expect(screen.queryByText("기사 핵심")).toBeNull();
  expect(
    screen.getByRole("heading", { level: 2, name: "무슨 일이?" }),
  ).toBeDefined();
});
