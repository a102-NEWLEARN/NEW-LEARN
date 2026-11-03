import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ArticleSummary } from "@/api/types";
import { ArticleRow } from "@/components/ArticleRow";
import { renderWithProviders } from "@/test/render";

const NOW = new Date("2026-10-28T12:00:00+09:00");

const article: ArticleSummary = {
  id: 11901,
  title: "한빛반도체 텍사스 공장 착공식",
  publisher: { code: "bareun", name: "바른신문" },
  publishedAt: "2026-10-28T09:00:00+09:00",
  category: { code: "economy", name: "경제" },
  summary: null,
  url: "https://news.example.com/articles/11901",
  mindmapStatus: "SUCCEEDED",
  bookmarked: false,
};

function renderRow(overrides: Partial<ArticleSummary> = {}) {
  return renderWithProviders(
    <ul>
      <ArticleRow article={{ ...article, ...overrides }} now={NOW} />
    </ul>,
  );
}

test("행 전체가 기사 마인드맵 링크이고 제목 · 언론사 · 날짜를 보인다", () => {
  renderRow();

  const link = screen.getByRole("link", {
    name: /착공식\s*바른신문 · 3시간 전/,
  });
  expect(link.getAttribute("href")).toBe("/articles/11901");
  expect(within(link).getByText("바른신문 · 3시간 전")).toBeDefined();
});

test("마인드맵을 분석하는 중이면 「분석 중」을 붙인다", () => {
  renderRow({ mindmapStatus: "QUEUED" });

  expect(screen.getByText("분석 중")).toBeDefined();
});

test("분석이 끝난 기사에는 「분석 중」이 없다", () => {
  renderRow();

  expect(screen.queryByText("분석 중")).toBeNull();
});

test("원문 보기는 새 탭으로 여는 링크다", () => {
  renderRow();

  const source = screen.getByRole("link", {
    name: "한빛반도체 텍사스 공장 착공식 원문 보기 (바른신문, 새 탭)",
  });
  expect(source.getAttribute("href")).toBe(article.url);
  expect(source.getAttribute("target")).toBe("_blank");
  expect(source.getAttribute("rel")).toBe("noopener noreferrer");
});
