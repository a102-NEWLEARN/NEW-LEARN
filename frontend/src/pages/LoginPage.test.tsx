import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

function problem(status: number, code: string, extra: object = {}) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: code,
      status,
      detail: code,
      instance: "/api/v1/auth/login",
      code,
      ...extra,
    },
    { status },
  );
}

// 손님 — A17 이 401 이면 손님이다. 로그인에 성공한 뒤에는 회원으로 답한다
function asGuest() {
  let loggedIn = false;
  server.use(
    http.get("/api/v1/members/me", () =>
      loggedIn
        ? HttpResponse.json({
            id: 1,
            loginId: "seojin",
            name: "김뉴런",
            categories: [],
          })
        : problem(401, "UNAUTHORIZED"),
    ),
    http.post("/api/v1/auth/login", () => {
      loggedIn = true;
      return HttpResponse.json({
        id: 1,
        loginId: "seojin",
        name: "김뉴런",
        categories: [],
      });
    }),
  );
}

// A15 가 이 응답을 준다. 보낸 본문을 모아 둔다
function loginAnswers(response: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/v1/auth/login", async ({ request }) => {
      bodies.push(await request.json());
      return response();
    }),
  );
  return bodies;
}

const idField = () => screen.getByRole("textbox", { name: "아이디" });
const passwordField = () => screen.getByLabelText("비밀번호");
// 보내는 동안에는 SEED 가 버튼 안에 진행 표시를 넣어 이름이 「loading... 로그인」이 된다
const submit = () => screen.getByRole("button", { name: /로그인/ });

async function fillAndSubmit(loginId: string, password: string) {
  await screen.findByRole("heading", { level: 1, name: "로그인" });
  fireEvent.change(idField(), { target: { value: loginId } });
  fireEvent.change(passwordField(), { target: { value: password } });
  fireEvent.click(submit());
}

test("셸 없이 아이디 · 비밀번호 칸과 로그인 버튼을 띄운다", async () => {
  asGuest();
  renderRoute("/login?next=/home");

  expect(
    await screen.findByRole("heading", { level: 1, name: "로그인" }),
  ).toBeDefined();
  expect(idField().getAttribute("autocomplete")).toBe("username");
  expect(passwordField().getAttribute("type")).toBe("password");
  expect(passwordField().getAttribute("autocomplete")).toBe("current-password");
  expect(screen.queryByRole("navigation", { name: "사이드바" })).toBeNull();
  await waitFor(() => expect(document.title).toBe("로그인 | NEW:LEARN"));
});

test("빈 칸으로 보내면 칸마다 오류를 띄우고 첫 칸에 포커스하며 보내지 않는다", async () => {
  asGuest();
  const bodies = loginAnswers(() => problem(401, "LOGIN_FAILED"));
  renderRoute("/login?next=/home");

  await fillAndSubmit("  ", "");

  expect(await screen.findByText("아이디를 입력해 주세요.")).toBeDefined();
  expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeDefined();
  expect(idField().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(idField());
  expect(bodies).toEqual([]);
});

test("고쳐 쓰면 그 칸의 오류를 지운다", async () => {
  asGuest();
  renderRoute("/login?next=/home");
  await fillAndSubmit("", "");
  await screen.findByText("아이디를 입력해 주세요.");

  fireEvent.change(idField(), { target: { value: "s" } });

  expect(screen.queryByText("아이디를 입력해 주세요.")).toBeNull();
  expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeDefined();
});

test("로그인하면 알림을 띄우고 next 화면으로 돌아간다", async () => {
  asGuest();
  const { router } = renderRoute("/login?next=/issues/12%3Fevent%3D3");

  await fillAndSubmit("seojin", "password123");

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/12"),
  );
  expect(router.state.location.search).toBe("?event=3");
  expect(await screen.findByText("로그인했어요")).toBeDefined();
});

test("아이디 앞뒤 빈칸은 빼고 보낸다", async () => {
  asGuest();
  const bodies = loginAnswers(() => problem(401, "LOGIN_FAILED"));
  renderRoute("/login?next=/home");

  await fillAndSubmit(" seojin ", " pass word ");

  await waitFor(
    () =>
      expect(bodies).toEqual([{ loginId: "seojin", password: " pass word " }]), // secret-scan:allow — 시험용 값
  );
});

test("next 가 다른 사이트면 홈으로 간다", async () => {
  asGuest();
  const { router } = renderRoute("/login?next=//evil.example");

  await fillAndSubmit("seojin", "password123");

  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
});

test.each([
  [
    "아이디 · 비밀번호가 틀리면",
    () => problem(401, "LOGIN_FAILED"),
    "아이디나 비밀번호를 확인해 주세요",
  ],
  [
    "5번 틀려 잠기면",
    () => problem(429, "TOO_MANY_REQUESTS"),
    "로그인을 5번 틀려 1분 뒤에 다시 할 수 있어요",
  ],
  [
    "입구가 요청을 막으면",
    () => problem(429, "RATE_LIMITED"),
    "요청이 많아요. 잠시 뒤 다시 시도해 주세요",
  ],
  [
    "서버가 실패하면",
    () => problem(500, "INTERNAL_ERROR"),
    "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  ],
])("%s 폼 안에 알리고 로그인 화면에 남는다", async (_, response, message) => {
  asGuest();
  loginAnswers(response);
  const { router } = renderRoute("/login?next=/home");

  await fillAndSubmit("seojin", "password123");

  const alert = await screen.findByRole("alert");
  expect(within(alert).getByText(message)).toBeDefined();
  expect(router.state.location.pathname).toBe("/login");
});

test("서버가 칸 오류를 주면 그 칸 아래에 그대로 띄운다", async () => {
  asGuest();
  loginAnswers(() =>
    problem(400, "VALIDATION_FAILED", {
      errors: [
        { field: "loginId", reason: "아이디는 64자까지 입력할 수 있어요." },
      ],
    }),
  );
  renderRoute("/login?next=/home");

  await fillAndSubmit("seojin", "password123");

  expect(
    await screen.findByText("아이디는 64자까지 입력할 수 있어요."),
  ).toBeDefined();
  expect(idField().getAttribute("aria-invalid")).toBe("true");
});

test("보내는 동안 로그인 버튼을 로딩 상태로 둔다", async () => {
  asGuest();
  let answer: () => void = () => {};
  server.use(
    http.post(
      "/api/v1/auth/login",
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(problem(401, "LOGIN_FAILED"));
        }),
    ),
  );
  renderRoute("/login?next=/home");

  await fillAndSubmit("seojin", "password123");

  await waitFor(() => expect(submit().getAttribute("aria-busy")).toBe("true"));
  answer();
  await screen.findByRole("alert");
  expect(submit().getAttribute("aria-busy")).not.toBe("true");
});

test("이미 로그인했으면 next 화면으로 보낸다", async () => {
  const { router } = renderRoute("/login?next=/issues/12");

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/12"),
  );
});

test("닫기를 누르면 랜딩으로 간다", async () => {
  asGuest();
  const { router } = renderRoute("/login?next=/home");
  await screen.findByRole("heading", { level: 1, name: "로그인" });

  fireEvent.click(screen.getByRole("link", { name: "닫기" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
});

test("가입 화면으로 가는 버튼이 next 를 넘긴다", async () => {
  asGuest();
  renderRoute("/login?next=/issues/12");

  await screen.findByRole("heading", { level: 1, name: "로그인" });
  expect(screen.getByText("아직 계정이 없나요?")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "회원가입" }).getAttribute("href"),
  ).toBe("/signup?next=/issues/12");
});
