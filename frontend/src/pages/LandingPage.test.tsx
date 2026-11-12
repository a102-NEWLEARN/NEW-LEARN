import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe, lastEnterEnd } from "@/test/motion";
import { renderRoute } from "@/test/render";

// 손님 — A17 이 401 이면 손님이다 (src/api/members.ts fetchMe)
function asGuest() {
  server.use(
    http.get("/api/v1/members/me", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "UNAUTHORIZED",
          status: 401,
          detail: "UNAUTHORIZED",
          instance: "/api/v1/members/me",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      ),
    ),
  );
}

// *서비스 시작하기* 는 상단과 첫 화면에 하나씩 있다. *로그인* 은 상단에만
const startLinks = () =>
  screen.getAllByRole("link", { name: "서비스 시작하기" });
const loginLink = () => screen.getByRole("link", { name: "로그인" });
const hrefs = () =>
  [...startLinks(), loginLink()].map((link) => link.getAttribute("href"));

test("/ 를 열면 셸 없이 랜딩을 띄운다", async () => {
  renderRoute("/");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "기사는 많아도, 이슈는 한 흐름으로.",
    }),
  ).toBeDefined();
  // 셸(헤더) 없이 뜬다
  expect(screen.queryByRole("link", { name: "나의 뉴스함" })).toBeNull();
});

test("손님이면 서비스 시작하기 · 로그인이 로그인 화면으로 간다", async () => {
  asGuest();
  renderRoute("/");

  await screen.findByRole("heading", { level: 1 });
  expect(startLinks()).toHaveLength(2);
  await waitFor(() =>
    expect(hrefs()).toEqual(Array(3).fill("/login?next=/home")),
  );
});

test("회원이면 서비스 시작하기 · 로그인이 홈으로 간다", async () => {
  renderRoute("/");

  await waitFor(() => expect(hrefs()).toEqual(Array(3).fill("/home")));
});

test("회원이 서비스 시작하기를 누르면 홈이 열린다", async () => {
  const { router } = renderRoute("/");
  await waitFor(() => expect(hrefs()).toEqual(Array(3).fill("/home")));

  fireEvent.click(startLinks()[1]);

  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
});

test("로고를 누르면 랜딩에 남아 맨 위로 올라간다", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { router } = renderRoute("/");
  const logo = await screen.findByRole("link", {
    name: "NEW:LEARN 처음 화면으로",
  });
  expect(logo.getAttribute("href")).toBe("/");

  fireEvent.click(logo);

  expect(router.state.location.pathname).toBe("/");
  expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
});

test("열면 인사 문구가 뜨고, 키를 치면 걷혀 사라진다", async () => {
  renderRoute("/");

  expect(screen.getByText("안녕하세요!")).toBeDefined();
  // 인사 막은 장식이라 그동안에도 첫 화면 제목이 읽힌다
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "기사는 많아도, 이슈는 한 흐름으로.",
    }),
  ).toBeDefined();

  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("안녕하세요!")).toBeNull());
});

test("동작 줄이기를 켜면 인사 없이 첫 화면을 띄운다", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  renderRoute("/");

  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByText("안녕하세요!")).toBeNull();
  // 첫 화면 그림도 다 그린 모양이다
  expect(animated(heroArt())).toHaveLength(0);
});

// 첫 화면 그림 (프로토타입 v21 LandingHeroMap 의 움직임만)
const heroArt = () => document.querySelector('svg[viewBox="0 0 400 260"]')!;
const animated = (root: Element) => [
  ...root.querySelectorAll('[class*="motion-safe:animate-"]'),
];

test("인사 막이 걷히면 첫 화면 그림의 선이 그려지고 카드가 떠오르고 노드 · 새 소식 점이 튀어나온다", async () => {
  renderRoute("/");
  await screen.findByRole("heading", { level: 1 });
  // 막 뒤에서는 아직 그리지 않는다
  expect(animated(heroArt())).toHaveLength(0);

  fireEvent.keyDown(window, { key: "Escape" });

  await waitFor(() => expect(animated(heroArt()).length).toBeGreaterThan(0));
  const art = heroArt();
  const rail = art.querySelector("line")!;
  expect(rail.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-draw_/,
  );
  expect(rail.getAttribute("pathLength")).toBe("1");
  const nodes = [...art.querySelectorAll(":scope > rect")];
  expect(nodes).toHaveLength(6);
  nodes.forEach((node) =>
    expect(node.getAttribute("class")).toMatch(
      /motion-safe:animate-\[newlearn-spring-in_/,
    ),
  );
  const nodeDelays = nodes.map(enterDelay);
  nodeDelays
    .slice(1)
    .forEach((at, i) => expect(at).toBeGreaterThan(nodeDelays[i]));
  const cards = [...art.querySelectorAll(":scope > g")];
  cards.forEach((card) =>
    expect(card.getAttribute("class")).toMatch(
      /motion-safe:animate-\[newlearn-rise-short_/,
    ),
  );
  // 새 소식 점은 맨 마지막
  const dot = art.querySelector("circle")!;
  expect(enterDelay(dot)).toBeGreaterThan(Math.max(...nodeDelays));
  expect(lastEnterEnd(art)).toBeLessThanOrEqual(2000);
  expectMotionSafe(art);
});
