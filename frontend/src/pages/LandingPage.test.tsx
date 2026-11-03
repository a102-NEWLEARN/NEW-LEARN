import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
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
  expect(screen.queryByRole("navigation", { name: "사이드바" })).toBeNull();
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
