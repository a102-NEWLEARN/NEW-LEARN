import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { afterEach, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { stubReducedMotion } from "@/test/media";
import { enterDelay, expectMotionSafe } from "@/test/motion";
import { renderRoute } from "@/test/render";

// 랜딩 — 프로토타입 v21 LandingScreen (2026-11-12, Jira 32)

// scrollTo · scrollY 대역만 되돌린다. matchMedia 는 setup.ts 가 시험마다 되돌리고,
// ResizeObserver 대역(setup.ts)은 지우면 안 된다 — SEED 스낵바가 쓴다
afterEach(() => vi.restoreAllMocks());

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

const heading = () =>
  screen.findByRole("heading", { level: 1, name: "NEW:LEARN" });
// *서비스 시작하기* 는 첫 화면에, *로그인* 은 머리에 있다
const startLinks = () =>
  screen.getAllByRole("link", { name: /서비스 시작하기/ });
const loginLink = () => screen.getByRole("link", { name: "로그인" });
const hrefs = () =>
  [...startLinks(), loginLink()].map((link) => link.getAttribute("href"));

test("/ 를 열면 셸 없이, 인사 막 없이 첫 화면을 바로 띄운다", async () => {
  renderRoute("/");

  expect(await heading()).toBeDefined();
  expect(
    screen.getByText(
      "흩어진 뉴스를 연결해, 새로운 맥락을 배울 수 있는 뉴스 플랫폼",
    ),
  ).toBeDefined();
  // 셸(헤더) 없이 뜬다
  expect(screen.queryByRole("link", { name: "나의 뉴스함" })).toBeNull();
});

test("손님이면 서비스 시작하기 · 로그인이 로그인 화면으로 간다", async () => {
  asGuest();
  renderRoute("/");

  await heading();
  await waitFor(() =>
    // 돌아올 곳을 붙이지 않는다 — 로그인 화면을 닫으면 랜딩으로 온다 (Jira 205)
    expect(hrefs()).toEqual(Array(startLinks().length + 1).fill("/login")),
  );
});

test("회원이면 서비스 시작하기 · 로그인이 홈으로 간다", async () => {
  renderRoute("/");

  await heading();
  await waitFor(() =>
    expect(hrefs()).toEqual(Array(startLinks().length + 1).fill("/home")),
  );
});

test("회원이 서비스 시작하기를 누르면 홈이 열린다", async () => {
  const { router } = renderRoute("/");
  await heading();
  await waitFor(() => expect(loginLink().getAttribute("href")).toBe("/home"));

  fireEvent.click(startLinks()[0]);

  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
});

test("로고를 누르면 랜딩에 남아 맨 위로 부드럽게 올라간다", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { router } = renderRoute("/");
  const logo = await screen.findByRole("link", {
    name: "NEW:LEARN 처음 화면으로",
  });
  expect(logo.getAttribute("href")).toBe("/");

  fireEvent.click(logo);

  expect(router.state.location.pathname).toBe("/");
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
});

test("머리는 처음에는 투명하고, 내리면 흰 바탕과 밑줄이 생긴다", async () => {
  renderRoute("/");
  await heading();
  const header = screen.getByRole("banner");
  expect(header.dataset.scrolled).toBe("false");

  vi.spyOn(window, "scrollY", "get").mockReturnValue(120);
  fireEvent.scroll(window);

  await waitFor(() => expect(header.dataset.scrolled).toBe("true"));
});

test("첫 화면 글은 한 줄 소개 → NEW:LEARN → 설명 → 버튼 차례로 떠오르고, NEW:LEARN 은 아래에서 올라온다", async () => {
  renderRoute("/");
  const title = await heading();

  const hero = within(title.closest("section")!);
  const kicker = hero.getByText(/뉴스를 넘어,/);
  const word = title.querySelector("[aria-hidden]")!;
  const lead = screen.getByText(
    "흩어진 뉴스를 연결해, 새로운 맥락을 배울 수 있는 뉴스 플랫폼",
  );
  const cta = startLinks()[0].parentElement!;
  expect(word.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-line-up_760ms_/,
  );
  const order = [kicker, word, lead, cta].map((element) =>
    Number.isNaN(enterDelay(element)) ? 0 : enterDelay(element),
  );
  order.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(order[i]));
  expectMotionSafe(title.closest("section")!);
});

test("동작 줄이기를 켜도 첫 화면을 바로 보인다", async () => {
  stubReducedMotion();
  renderRoute("/");

  expect(await heading()).toBeDefined();
  expect(startLinks().length).toBeGreaterThan(0);
});

test("첫 화면 아래로 소개 섹션이 차례로 이어진다", async () => {
  renderRoute("/");
  await heading();

  const sections = screen
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent);
  expect(sections).toEqual([
    "기사 한 편만으로는 사건의 전체 전개를 알기 어려워요.",
    "뉴스는 넘쳐나는데,",
    "어떻게 정리하나요",
    "요약보다 근거를 먼저, 판단은 읽는 사람에게.",
    "자주 묻는 질문",
    "뉴스를 읽는 서비스를 넘어, 뉴스를 이해하는 경험으로.",
  ]);
  // MVP 밖 기능(F10 근거 기반 변화 카드의 UPDATE)은 랜딩 어디에도 말하지 않는다
  expect(document.body.textContent).not.toMatch(/UPDATE/);
});

test("서비스 시작하기는 첫 화면과 마지막 권유에 하나씩 있다", async () => {
  asGuest();
  renderRoute("/");
  await heading();

  await waitFor(() =>
    expect(startLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/login",
      "/login",
    ]),
  );
});

test("머리 메뉴를 누르면 그 섹션으로 머리 높이만큼 덜 부드럽게 내린다", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  renderRoute("/");
  await heading();
  const menu = screen.getByRole("navigation", { name: "랜딩 메뉴" });
  const trust = document.getElementById("trust")!;
  vi.spyOn(trust, "getBoundingClientRect").mockReturnValue({
    top: 1500,
  } as DOMRect);

  fireEvent.click(within(menu).getByRole("button", { name: "근거와 신뢰" }));

  expect(scrollTo).toHaveBeenCalledWith({ top: 1500 - 64, behavior: "smooth" });
  expect(
    within(menu)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["어떻게 정리하나요", "근거와 신뢰", "자주 묻는 질문"]);
});

test("바닥글에 약관(준비 중)과 안내가 있고, 로고를 누르면 맨 위로 올라간다", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  renderRoute("/");
  await heading();
  const footer = screen.getByRole("contentinfo");

  expect(within(footer).getByText("이용약관 (준비 중)")).toBeDefined();
  expect(within(footer).getByText("© 2026 NEW:LEARN")).toBeDefined();
  fireEvent.click(
    within(footer).getByRole("button", { name: "NEW:LEARN 맨 위로" }),
  );
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
});

test("첫 화면 아래 「어떻게 정리하나요」를 누르면 그 섹션으로 내리고, 화살표는 까딱인다", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  renderRoute("/");
  const title = await heading();
  const how = document.getElementById("how")!;
  vi.spyOn(how, "getBoundingClientRect").mockReturnValue({
    top: 2800,
  } as DOMRect);
  const button = within(title.closest("section")!).getByRole("button", {
    name: "어떻게 정리하나요",
  });

  fireEvent.click(button);

  expect(scrollTo).toHaveBeenCalledWith({ top: 2800 - 64, behavior: "smooth" });
  expect(button.querySelector("svg")?.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-bob_1\.8s_ease-in-out_infinite\]/,
  );
});
