import { screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { IssueSummary } from "@/api/issues";
import { IssueCard } from "@/components/IssueCard";
import { renderWithProviders } from "@/test/render";

// docs/api-screen.md A2 예시
const issue: IssueSummary = {
  id: 12,
  title: "한빛반도체 미국 공장 건설",
  summary: "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다",
  categories: [{ code: "economy", name: "경제" }],
  eventCount: 8,
  articleCount: 23,
  publisherCount: 5,
  firstEventAt: "2026-08-04T00:00:00+09:00",
  lastEventAt: "2026-10-09T08:41:00+09:00",
  createdAt: "2026-08-21T12:30:00+09:00",
  lastEvent: {
    id: 98,
    title: "텍사스 공장 엔지니어 수급 우려 보도",
    label: "인력 수급 우려",
    occurredAt: "2026-10-09T08:41:00+09:00",
  },
  interested: false,
};

// 최근 사건 날짜는 올해인지에 따라 연도를 붙인다. Date 만 고정한다
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T09:00:00+09:00"));
});
afterEach(() => vi.useRealTimers());

test("카드 전체가 이슈 화면으로 가는 링크 하나다", () => {
  renderWithProviders(<IssueCard issue={issue} />);

  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/issues/12");
  expect(link.textContent).toContain("한빛반도체 미국 공장 건설");
});

test("분야 · 최근 사건 · 사건과 기사 수를 보인다", () => {
  renderWithProviders(<IssueCard issue={issue} />);

  const link = screen.getByRole("link");
  expect(screen.getByText("경제")).toBeDefined();
  expect(screen.getByText("최근 사건 · 10.09")).toBeDefined();
  expect(screen.getByText("텍사스 공장 엔지니어 수급 우려 보도")).toBeDefined();
  expect(link.textContent).toContain("사건 8");
  expect(link.textContent).toContain("기사 23");
});

test("최근 사건이 올해가 아니면 연도를 붙인다", () => {
  renderWithProviders(
    <IssueCard
      issue={{
        ...issue,
        lastEvent: {
          ...issue.lastEvent,
          occurredAt: "2025-12-01T10:00:00+09:00",
        },
      }}
    />,
  );

  expect(screen.getByText("최근 사건 · 2025.12.01")).toBeDefined();
});

test("분야가 여럿이면 모두 적는다", () => {
  renderWithProviders(
    <IssueCard
      issue={{
        ...issue,
        categories: [
          { code: "economy", name: "경제" },
          { code: "world", name: "국제" },
        ],
      }}
    />,
  );

  expect(screen.getByText("경제 · 국제")).toBeDefined();
});

test("개수가 0이면 「0개」로 쓰지 않고 그 항목을 뺀다 (v2 IssueCard)", () => {
  renderWithProviders(<IssueCard issue={{ ...issue, articleCount: 0 }} />);

  const link = screen.getByRole("link");
  expect(link.textContent).toContain("사건 8");
  expect(link.textContent).not.toContain("기사");
});
