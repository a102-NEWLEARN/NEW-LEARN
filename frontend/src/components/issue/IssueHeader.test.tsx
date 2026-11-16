import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import { issueQuery } from "@/api/issue";
import { IssueHeader } from "@/components/issue/IssueHeader";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe } from "@/test/motion";
import { renderWithProviders } from "@/test/render";

function Header() {
  return <IssueHeader query={useQuery(issueQuery(12))} />;
}

function withSummary(summary: string) {
  server.use(
    http.get("/api/v1/issues/12", async ({ request }) => {
      const real = await fetch(request.url.replace("/12", "/13"));
      return HttpResponse.json({ ...(await real.json()), id: 12, summary });
    }),
  );
}

// 요약 칸이 두 줄로 잘렸는지는 글자 수가 아니라 화면에서 잰다 — 좁은 화면에서는 짧은 요약도 잘린다
function stubClamped(clamped: boolean) {
  const scroll = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(clamped ? 72 : 48);
  const client = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(48);
  return () => {
    scroll.mockRestore();
    client.mockRestore();
  };
}

test("요약이 한 줄에서 잘리면 더보기로 펼치고 접기로 다시 접는다", async () => {
  withSummary("텍사스 공장 투자를 늘리고 착공했다");
  const restore = stubClamped(true);
  try {
    renderWithProviders(<Header />);

    const more = await screen.findByRole("button", { name: "더보기" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);

    const less = screen.getByRole("button", { name: "접기" });
    expect(less.getAttribute("aria-expanded")).toBe("true");
  } finally {
    restore();
  }
});

test("요약이 길어도 잘리지 않으면 더보기를 두지 않는다", async () => {
  withSummary("가".repeat(120));
  const restore = stubClamped(false);
  try {
    renderWithProviders(<Header />);

    expect(await screen.findByText("가".repeat(120))).toBeDefined();
    expect(screen.queryByRole("button", { name: "더보기" })).toBeNull();
  } finally {
    restore();
  }
});

// 이슈 머리가 눈에 덜 띄었다 → 분야는 청록 글자, 요약은 18px 진한 글자에 왼쪽 민트 막대, AI 생성 표시는 넓은 화면에서
// 머리 오른쪽 위로 (2026-11-12 사용자 QA, Jira 197). 좁은 화면은 별이 오른쪽 위를 써서 요약 아래 그대로다.
// jsdom 은 미디어 쿼리 CSS 를 안 풀어 둘 다 그려진다 — 어느 폭에서 숨는지는 클래스로 본다
test("AI 생성 표시는 넓은 화면에서 머리 오른쪽 위에, 좁은 화면에서 요약 아래에 둔다 — 둘 다 요약 문단 밖이다", async () => {
  withSummary("텍사스 공장 투자를 늘리고 착공했다");
  const restore = stubClamped(true);
  try {
    renderWithProviders(<Header />);

    const summary = await screen.findByText(
      "텍사스 공장 투자를 늘리고 착공했다",
    );
    const badges = screen.getAllByText("AI 생성");
    expect(badges).toHaveLength(2);
    // 넓은 화면 표시는 머리 끝에 있어 요약 다음에 읽힌다 — 차례가 아니라 숨는 폭으로 가른다
    const holders = badges.map((badge) => badge.parentElement!);
    const wide = holders.find((holder) =>
      holder.className.includes("max-md:hidden"),
    )!;
    const narrow = holders.find((holder) => holder !== wide)!;
    expect(wide.className).toContain("max-md:hidden");
    expect(wide.className).toContain("absolute");
    expect(wide.parentElement).toBe(screen.getByRole("banner"));
    expect(narrow.className).toContain("md:hidden");
    badges.forEach((badge) => expect(summary.contains(badge)).toBe(false));
  } finally {
    restore();
  }
});

test("분야는 청록 글자로, 요약은 16px 진한 글자 · 줄 간격 1.7 에 왼쪽 민트 막대로 한 줄만 보인다", async () => {
  withSummary("텍사스 공장 투자를 늘리고 착공했다");
  renderWithProviders(<Header />);

  const summary = await screen.findByText("텍사스 공장 투자를 늘리고 착공했다");
  // 글자를 한 단계 줄이고 줄 간격을 띄웠다 (2026-11-13 사용자, Jira 202). 이슈 흐름이 더 보이게 한 줄만 보인다 (2026-11-16 사용자, Jira 221)
  expect(summary.className).toContain("t5-regular");
  expect(summary.className).toContain("leading-[1.7]");
  expect(summary.className).toContain("line-clamp-1");
  expect(summary.className).toContain("text-fg-neutral ");
  expect(summary.className).toContain("border-l-[3px]");
  const category = screen.getByRole("banner").querySelector("p")!;
  expect(within(category).getByText("경제").className).toContain(
    "text-fg-brand",
  );
});

test("요약이 없으면 AI 생성 표시도 두지 않는다", async () => {
  withSummary("");
  renderWithProviders(<Header />);

  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryAllByText("AI 생성")).toHaveLength(0);
});

// 폰에서 별이 제목 첫 줄보다 4px 내려가 보였다(32px 줄과 40px 버튼의 위를 맞췄다) → 좁은 화면은 머리 오른쪽 위에 붙인다
// (2026-11-12 사용자, Jira 195). 넓은 화면은 제목 옆 그대로. jsdom 은 미디어 쿼리 CSS 를 안 풀어 칸 자리 클래스로 본다
test("관심 이슈 별은 좁은 화면에서 분야 줄 · 제목 오른쪽 위 칸에, 넓은 화면에서 제목 줄 옆에 둔다", async () => {
  renderWithProviders(<Header />);

  const star = await screen.findByRole("button", { name: /관심 이슈로 저장/ });
  const heading = screen.getByRole("heading", { level: 1 });
  expect(star.parentElement).toBe(heading.parentElement);
  expect(star.className).toContain("max-md:row-span-2");
  expect(star.className).toContain("md:row-start-2");
});

test("이슈를 받으면 분야 · 제목 · 요약이 차례로 떠오른다 — 움직임은 동작 줄이기를 켜면 빠진다", async () => {
  withSummary("텍사스 공장 투자를 늘리고 착공했다");
  renderWithProviders(<Header />);

  const heading = await screen.findByRole("heading", { level: 1 });
  await screen.findByText("텍사스 공장 투자를 늘리고 착공했다");
  const order = [
    screen.getByRole("banner").querySelector("p")!,
    heading.firstElementChild!,
    screen.getByText("텍사스 공장 투자를 늘리고 착공했다").parentElement!,
  ].map(enterDelay);

  expect(order.some(Number.isNaN)).toBe(false);
  order.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(order[i]));
  expectMotionSafe();
});
