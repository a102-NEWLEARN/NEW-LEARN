import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import { issueQuery } from "@/api/issue";
import { IssueHeader } from "@/components/issue/IssueHeader";
import { server } from "@/mocks/node";
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
