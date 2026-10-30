import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { type ArticleDetail, articleQuery } from "@/api/article";
import { ArticleHeader } from "@/components/article/ArticleHeader";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

const ARTICLE: ArticleDetail = {
  id: 5,
  title: "한빛반도체 텍사스 공장 착공식",
  publisher: { code: "bareun", name: "바른신문" },
  publishedAt: "2026-10-06T05:30:00Z",
  category: { code: "economy", name: "경제" },
  summary: null,
  url: "https://news.example.com/articles/5",
  mindmapStatus: "SUCCEEDED",
  bookmarked: false,
  reporter: "김민정 기자",
  eventMatchStatus: "SUCCEEDED",
  event: {
    id: 119,
    title: "한빛반도체 텍사스 공장 착공식",
    label: "착공식",
    occurredAt: "2026-10-06T00:00:00+09:00",
  },
  issue: { id: 12, title: "한빛반도체 미국 공장 건설" },
};

function answer(article: Partial<ArticleDetail>) {
  server.use(
    http.get("/api/v1/articles/5", () =>
      HttpResponse.json({ ...ARTICLE, ...article }),
    ),
  );
}

function Header() {
  return <ArticleHeader query={useQuery(articleQuery(5))} />;
}

const title = () =>
  screen.findByRole("heading", {
    level: 1,
    name: "한빛반도체 텍사스 공장 착공식",
  });

test("분야 · 이슈 줄, 제목, 언론사 · 일시 · 기자를 보인다", async () => {
  answer({});
  renderWithProviders(<Header />);

  await title();
  expect(screen.getByText("경제 · 한빛반도체 미국 공장 건설")).toBeDefined();
  expect(
    screen.getByText("바른신문 · 2026.10.06 14:30 · 김민정 기자"),
  ).toBeDefined();
});

test("이슈가 없으면 분야만, 기자가 없으면 기자를 뺀다", async () => {
  answer({
    issue: null,
    event: null,
    reporter: null,
    eventMatchStatus: "NO_EVENT",
  });
  renderWithProviders(<Header />);

  await title();
  expect(screen.getByText("경제")).toBeDefined();
  expect(screen.getByText("바른신문 · 2026.10.06 14:30")).toBeDefined();
});

test("원문 보기는 언론사 기사를 새 탭으로 연다", async () => {
  answer({});
  renderWithProviders(<Header />);
  await title();

  const source = screen.getByRole("link", { name: /원문 보기/ });
  expect(source.getAttribute("href")).toBe(
    "https://news.example.com/articles/5",
  );
  expect(source.getAttribute("target")).toBe("_blank");
  expect(source.getAttribute("rel")).toContain("noopener");
});

test("속한 이슈가 있으면 그 사건 패널이 열린 이슈 화면으로 가는 버튼을 둔다", async () => {
  answer({});
  renderWithProviders(<Header />);
  await title();

  expect(
    screen
      .getByRole("link", { name: "이 기사가 속한 이슈 보기" })
      .getAttribute("href"),
  ).toBe("/issues/12?event=119");
});

test.each([
  [
    "사건을 찾는 중이면",
    { eventMatchStatus: "QUEUED", event: null, issue: null },
    "사건을 찾는 중이에요",
  ],
  [
    "사건은 찾았는데 이슈가 아직 없으면",
    { issue: null },
    "아직 이슈로 묶이지 않았어요",
  ],
] as const)("%s 버튼 대신 「%s」", async (_, article, message) => {
  answer(article);
  renderWithProviders(<Header />);
  await title();

  expect(screen.getByText(message)).toBeDefined();
  expect(
    screen.queryByRole("link", { name: "이 기사가 속한 이슈 보기" }),
  ).toBeNull();
});

test.each(["NONE", "FAILED", "NO_EVENT"] as const)(
  "사건 찾기가 %s 면 이슈 쪽은 아무것도 두지 않는다",
  async (eventMatchStatus) => {
    answer({ eventMatchStatus, event: null, issue: null });
    renderWithProviders(<Header />);
    await title();

    expect(
      screen.queryByRole("link", { name: "이 기사가 속한 이슈 보기" }),
    ).toBeNull();
    expect(screen.queryByText("사건을 찾는 중이에요")).toBeNull();
    expect(screen.queryByText("아직 이슈로 묶이지 않았어요")).toBeNull();
  },
);

test("불러오지 못하면 안내와 다시 시도를 두고, 다시 시도하면 다시 부른다", async () => {
  let calls = 0;
  server.use(
    http.get("/api/v1/articles/5", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 })
        : HttpResponse.json(ARTICLE);
    }),
  );
  renderWithProviders(<Header />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "기사를 불러오지 못했어요",
    }),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await title()).toBeDefined();
});
