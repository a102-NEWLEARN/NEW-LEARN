import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { IssueSummary } from "@/api/issues";
import { IssueCard } from "@/components/IssueCard";
import { expectMotionSafe } from "@/test/motion";
import { renderWithProviders } from "@/test/render";

// docs/api-screen.md A2 예시
const lastEvent = {
  id: 98,
  title: "텍사스 공장 엔지니어 수급 우려 보도",
  label: "인력 수급 우려",
  occurredAt: "2026-10-09T08:41:00+09:00",
};
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
  lastEvent,
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
          ...lastEvent,
          occurredAt: "2025-12-01T10:00:00+09:00",
        },
      }}
    />,
  );

  expect(screen.getByText("최근 사건 · 2025.12.01")).toBeDefined();
});

test("사건이 없는 이슈는 최근 사건 줄을 두지 않는다 (A2 기간 · lastEvent 가 null)", () => {
  renderWithProviders(
    <IssueCard
      issue={{
        ...issue,
        eventCount: 0,
        articleCount: 0,
        publisherCount: 0,
        firstEventAt: null,
        lastEventAt: null,
        lastEvent: null,
      }}
    />,
  );

  const link = screen.getByRole("link");
  expect(link.textContent).toContain("한빛반도체 미국 공장 건설");
  expect(link.textContent).not.toContain("최근 사건");
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

// 관심 이슈 표시 (PRD FR-28, Jira 172)
test("관심 이슈면 분야 옆에 「관심 이슈」를 붙인다", () => {
  renderWithProviders(<IssueCard issue={{ ...issue, interested: true }} />);

  expect(screen.getByRole("link").textContent).toContain("관심 이슈");
});

test("관심 이슈가 아니면 「관심 이슈」를 붙이지 않는다", () => {
  renderWithProviders(<IssueCard issue={issue} />);

  expect(screen.getByRole("link").textContent).not.toContain("관심 이슈");
});

test("마우스를 올리거나 키보드로 오면 「흐름 보기」가 왼쪽에서 미끄러지며 나타난다 — 꾸밈이라 링크 이름에는 없다", () => {
  renderWithProviders(<IssueCard issue={issue} />);

  const link = screen.getByRole("link");
  const hint = within(link).getByText("흐름 보기").closest("[aria-hidden]")!;
  expect(hint).not.toBeNull();
  // 프로토타입 v21 im-rec-arrow — 평소 투명, 카드 호버 · 포커스 때 나타나며 4px 미끄러짐
  expect(link.getAttribute("class")).toMatch(/(^|\s)group(\s|$)/);
  const look = hint.getAttribute("class");
  expect(look).toMatch(/(^|\s)opacity-0(\s|$)/);
  expect(look).toMatch(/group-hover:opacity-100/);
  expect(look).toMatch(/group-focus-visible:opacity-100/);
  expect(look).toMatch(/motion-safe:translate-x-\[-4px\]/);
  expect(look).toMatch(/motion-safe:group-hover:translate-x-\[0px\]/);
  expect(screen.queryByRole("link", { name: /흐름 보기/ })).toBeNull();
  expectMotionSafe();
});
