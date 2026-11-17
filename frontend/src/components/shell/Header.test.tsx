import { fireEvent, screen, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { Header } from "@/components/shell/Header";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

const noop = () => {};

// 오른쪽 버튼은 회원인지 안 뒤에 그린다 — 기본 가짜 서버는 회원이다
const bookmarks = () => screen.findByRole("link", { name: "나의 뉴스함" });
const myPage = () => screen.findByRole("button", { name: "마이페이지" });

const asGuest = () =>
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

test("나의 뉴스함은 /bookmarks 로 간다", async () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  expect((await bookmarks()).getAttribute("href")).toBe("/bookmarks");
});

// 마이페이지는 링크가 아니라 프로필 메뉴(마이페이지 · 로그아웃)를 여는 버튼이다 — 메뉴는 ProfileMenu.test
test("마이페이지는 프로필 메뉴를 여는 버튼이다", async () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  expect((await myPage()).getAttribute("aria-haspopup")).toBe("menu");
  expect(screen.queryByRole("link", { name: "마이페이지" })).toBeNull();
  expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
});

// 손님은 나의 뉴스함 · 마이페이지 대신 로그인 하나다. 로그인하면 보던 화면으로 돌아온다 (EXPERIENCE.md 앱 셸, 2026-11-13 Jira 205)
test("손님이면 로그인 하나만 두고, 로그인하면 지금 주소로 돌아오게 한다", async () => {
  asGuest();
  renderWithProviders(<Header onLogoClick={noop} />, {
    route: "/issues/12?event=117",
  });

  const login = await screen.findByRole("link", { name: "로그인" });
  expect(login.getAttribute("href")).toBe(
    "/login?next=/issues/12%3Fevent%3D117",
  );
  expect(screen.queryByRole("link", { name: "나의 뉴스함" })).toBeNull();
  expect(screen.queryByRole("button", { name: "마이페이지" })).toBeNull();
});

test("좁은 화면에서도 손님의 로그인은 글자로 보인다", async () => {
  asGuest();
  renderWithProviders(<Header narrow onLogoClick={noop} />);

  const login = await screen.findByRole("link", { name: "로그인" });
  expect(login.textContent).toBe("로그인");
  expect(login.querySelector(".sr-only")).toBeNull();
});

// 손님 · 회원 버튼이 눈앞에서 바뀌어 보이지 않게
test("회원인지 아는 동안에는 오른쪽을 비워 둔다", async () => {
  server.use(
    http.get("/api/v1/members/me", async () => {
      await delay("infinite");
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<Header onLogoClick={noop} />);

  expect(
    await screen.findByRole("link", { name: "NEW:LEARN 홈으로" }),
  ).toBeDefined();
  expect(screen.queryByRole("link", { name: "나의 뉴스함" })).toBeNull();
  expect(screen.queryByRole("button", { name: "마이페이지" })).toBeNull();
  expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
});

// 셸의 좁은 화면 판정(useMediaQuery)으로 글자를 숨긴다. 이름은 스크린 리더에 남는다.
// 좁은 화면의 메뉴 버튼 · 서랍은 뺐다 — 로고가 맨 왼쪽 (2026-11-12 사용자, Jira 195)
test("좁은 화면에서는 메뉴 버튼 없이 로고가 맨 앞이고 오른쪽 버튼 글자를 숨긴다", async () => {
  renderWithProviders(<Header narrow onLogoClick={noop} />);

  await bookmarks();
  expect(screen.queryByRole("button", { name: "메뉴 열기" })).toBeNull();
  expect(
    screen
      .getByRole("banner")
      .querySelector("a, button")
      ?.getAttribute("aria-label"),
  ).toBe("NEW:LEARN 홈으로");
  expect(screen.getByText("나의 뉴스함").classList.contains("sr-only")).toBe(
    true,
  );
  // 메뉴 안 *마이페이지* 항목도 DOM 에 있어서 버튼 안 글자만 본다
  const myPageLabel = within(await myPage()).getByText("마이페이지");
  expect(myPageLabel.classList.contains("sr-only")).toBe(true);
});

test("넓은 화면에서는 오른쪽 버튼 글자가 보인다", async () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  await bookmarks();
  expect(screen.getByText("나의 뉴스함").classList.contains("sr-only")).toBe(
    false,
  );
});

test("로고를 누르면 셸에 알린다 (본문을 맨 위로 올리게)", () => {
  let clicked = 0;
  renderWithProviders(<Header onLogoClick={() => clicked++} />);

  fireEvent.click(screen.getByRole("link", { name: "NEW:LEARN 홈으로" }));

  expect(clicked).toBe(1);
});

// 지금 화면의 버튼을 눌린 모양으로 알린다 — 모바일 v1 · v21 TopNav (Jira 163).
// 마이페이지 버튼은 메뉴를 여는 버튼이라 aria-current 대신 모양만(data-current) 칠한다. 화면 읽기는 메뉴 안 항목이 알린다
test("/bookmarks 에서는 나의 뉴스함만 지금 화면이다", async () => {
  renderWithProviders(<Header narrow onLogoClick={noop} />, {
    route: "/bookmarks",
  });

  expect((await bookmarks()).getAttribute("aria-current")).toBe("page");
  expect((await myPage()).dataset.current).toBeUndefined();
});

test("/me 에서는 마이페이지 버튼만 지금 화면 모양이다", async () => {
  renderWithProviders(<Header narrow onLogoClick={noop} />, { route: "/me" });

  expect((await myPage()).dataset.current).toBe("true");
  expect((await bookmarks()).getAttribute("aria-current")).toBeNull();
});

test("홈에서는 어느 버튼도 지금 화면이 아니다", async () => {
  renderWithProviders(<Header onLogoClick={noop} />, { route: "/home" });

  expect((await bookmarks()).getAttribute("aria-current")).toBeNull();
  expect((await myPage()).dataset.current).toBeUndefined();
});
