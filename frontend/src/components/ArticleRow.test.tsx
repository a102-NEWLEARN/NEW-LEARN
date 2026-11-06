import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ArticleSummary } from "@/api/types";
import { ArticleRow } from "@/components/ArticleRow";
import { expectMotionSafe } from "@/test/motion";
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

// 홈 최신 기사 · 나의 뉴스함의 호버 안내 (프로토타입 v21 im-row-hint)
function renderHinted(overrides: Partial<ArticleSummary> = {}) {
  return renderWithProviders(
    <ul>
      <ArticleRow
        article={{ ...article, ...overrides }}
        now={NOW}
        mindmapHint
      />
    </ul>,
  );
}

test("mindmapHint 이면 넓은 화면에서 마우스를 올리거나 키보드로 올 때 「마인드맵 보기」가 미끄러지며 나타난다", () => {
  renderHinted();

  const link = screen.getByRole("link", { name: /착공식\s*바른신문/ });
  const hint = within(link)
    .getByText("마인드맵 보기")
    .closest("[aria-hidden]")!;
  expect(hint).not.toBeNull();
  expect(link.getAttribute("class")).toMatch(/(^|\s)group(\s|$)/);
  const look = hint.getAttribute("class");
  // 좁은 화면 · 터치에서는 안 보인다
  expect(look).toMatch(/max-md:hidden/);
  expect(look).toMatch(/(^|\s)opacity-0(\s|$)/);
  expect(look).toMatch(/group-hover:opacity-100/);
  expect(look).toMatch(/group-focus-visible:opacity-100/);
  expect(look).toMatch(/motion-safe:translate-x-\[-4px\]/);
  expect(look).toMatch(/motion-safe:group-hover:translate-x-\[0px\]/);
  // 꾸밈이라 링크 이름은 그대로다
  expect(screen.queryByRole("link", { name: /마인드맵 보기/ })).toBeNull();
  expectMotionSafe();
});

test.each(["NONE", "QUEUED", "FAILED", "NOT_ANALYZABLE"] as const)(
  "마인드맵이 없는 기사(%s)에는 「마인드맵 보기」를 두지 않는다",
  (mindmapStatus) => {
    renderHinted({ mindmapStatus });

    expect(screen.queryByText("마인드맵 보기")).toBeNull();
  },
);

test("mindmapHint 를 주지 않으면(사건 패널) 「마인드맵 보기」가 없다", () => {
  renderRow();

  expect(screen.queryByText("마인드맵 보기")).toBeNull();
});
