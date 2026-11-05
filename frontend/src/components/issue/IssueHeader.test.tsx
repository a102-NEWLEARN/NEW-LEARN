import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
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

test("요약이 두 줄에서 잘리면 더보기로 펼치고 접기로 다시 접는다", async () => {
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

test("요약에 AI 생성 표시를 붙인다 — 요약이 두 줄로 잘려도 보이게 요약 문단 밖에 둔다", async () => {
  withSummary("텍사스 공장 투자를 늘리고 착공했다");
  const restore = stubClamped(true);
  try {
    renderWithProviders(<Header />);

    const summary = await screen.findByText(
      "텍사스 공장 투자를 늘리고 착공했다",
    );
    const badge = screen.getByText("AI 생성");
    expect(summary.contains(badge)).toBe(false);
  } finally {
    restore();
  }
});

test("요약이 없으면 AI 생성 표시도 두지 않는다", async () => {
  withSummary("");
  renderWithProviders(<Header />);

  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByText("AI 생성")).toBeNull();
});

test("이슈를 받으면 분야 · 제목 · 요약이 차례로 떠오른다 — 움직임은 동작 줄이기를 켜면 빠진다", async () => {
  withSummary("텍사스 공장 투자를 늘리고 착공했다");
  renderWithProviders(<Header />);

  const heading = await screen.findByRole("heading", { level: 1 });
  await screen.findByText("텍사스 공장 투자를 늘리고 착공했다");
  const order = [
    screen.getByRole("banner").firstElementChild!,
    heading.firstElementChild!,
    screen.getByText("텍사스 공장 투자를 늘리고 착공했다").parentElement!,
  ].map(enterDelay);

  expect(order.some(Number.isNaN)).toBe(false);
  order.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(order[i]));
  expectMotionSafe();
});
