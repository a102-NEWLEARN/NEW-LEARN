import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { Member, SignUpRequest } from "@/api/members";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

function problem(status: number, code: string, extra: object = {}) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: code,
      status,
      detail: code,
      instance: "/api/v1/members",
      code,
      ...extra,
    },
    { status },
  );
}

const newMember: Member = {
  id: 8,
  loginId: "newbie_1",
  name: "새뉴런",
  categories: [{ code: "economy", name: "경제" }],
};

// 손님 — A17 이 401 이면 손님이다. 가입한 뒤에는 회원으로 답한다
function asGuest() {
  let joined = false;
  server.use(
    http.get("/api/v1/members/me", () =>
      joined ? HttpResponse.json(newMember) : problem(401, "UNAUTHORIZED"),
    ),
    http.post("/api/v1/members", () => {
      joined = true;
      return HttpResponse.json(newMember, { status: 201 });
    }),
  );
}

// A14 가 이 응답을 준다. 보낸 본문을 모아 둔다
function signUpAnswers(response: () => Response) {
  const bodies: SignUpRequest[] = [];
  server.use(
    http.post("/api/v1/members", async ({ request }) => {
      bodies.push((await request.json()) as SignUpRequest);
      return response();
    }),
  );
  return bodies;
}

const nameField = () => screen.getByRole("textbox", { name: "이름" });
const idField = () => screen.getByRole("textbox", { name: "아이디" });
const passwordField = () => screen.getByLabelText("비밀번호");
const confirmField = () => screen.getByLabelText("비밀번호 확인");
// 보내는 동안에는 SEED 가 버튼 안에 진행 표시를 넣어 이름이 바뀐다
const submit = () => screen.getByRole("button", { name: /가입하기/ });

type Form = {
  name?: string;
  loginId?: string;
  password?: string;
  /** 없으면 비밀번호와 같게 */
  confirm?: string;
  /** 누를 관심 분야 칩 이름 */
  interests?: string[];
};

async function fill({
  name = "새뉴런",
  loginId = "newbie_1",
  password = "password123",
  confirm = password,
  interests = ["경제"],
}: Form = {}) {
  await screen.findByRole("heading", { level: 1, name: "회원가입" });
  fireEvent.change(nameField(), { target: { value: name } });
  fireEvent.change(idField(), { target: { value: loginId } });
  fireEvent.change(passwordField(), { target: { value: password } });
  fireEvent.change(confirmField(), { target: { value: confirm } });
  for (const interest of interests)
    fireEvent.click(await screen.findByRole("button", { name: interest }));
}

test("셸 없이 이름 · 아이디 · 비밀번호 · 확인 · 관심 분야 칸을 띄운다", async () => {
  asGuest();
  renderRoute("/signup?next=/home");

  expect(
    await screen.findByRole("heading", { level: 1, name: "회원가입" }),
  ).toBeDefined();
  expect(
    screen.getByText(
      "관심 분야를 고르면 홈에서 그 분야 이슈를 먼저 보여드려요.",
    ),
  ).toBeDefined();
  expect(nameField().getAttribute("autocomplete")).toBe("name");
  expect(idField().getAttribute("autocomplete")).toBe("username");
  expect(idField().getAttribute("placeholder")).toBe("4자 이상");
  expect(passwordField().getAttribute("autocomplete")).toBe("new-password");
  expect(confirmField().getAttribute("type")).toBe("password");
  expect(screen.getByRole("group", { name: "관심 분야" })).toBeDefined();
  expect(screen.queryByRole("navigation", { name: "사이드바" })).toBeNull();
  await waitFor(() => expect(document.title).toBe("회원가입 | NEW:LEARN"));
});

test("빈 칸으로 보내면 칸마다 오류를 띄우고 첫 칸에 포커스하며 보내지 않는다", async () => {
  asGuest();
  const bodies = signUpAnswers(() => HttpResponse.json(newMember));
  renderRoute("/signup");

  await screen.findByRole("heading", { level: 1, name: "회원가입" });
  fireEvent.click(submit());

  expect(await screen.findByText("이름을 입력해 주세요.")).toBeDefined();
  expect(screen.getByText("아이디를 입력해 주세요.")).toBeDefined();
  expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeDefined();
  expect(screen.getByText("비밀번호가 서로 달라요.")).toBeDefined();
  expect(screen.getByText("관심 분야를 1개 이상 골라 주세요.")).toBeDefined();
  expect(nameField().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(nameField());
  expect(bodies).toEqual([]);
});

test("짧은 아이디 · 비밀번호, 다른 확인 값이면 그 문구를 띄운다", async () => {
  asGuest();
  renderRoute("/signup");

  await fill({ loginId: "abc", password: "short", confirm: "shorter" });
  fireEvent.click(submit());

  expect(
    await screen.findByText("아이디는 4자 이상으로 입력해 주세요."),
  ).toBeDefined();
  expect(
    screen.getByText("비밀번호는 8자 이상으로 입력해 주세요."),
  ).toBeDefined();
  expect(screen.getByText("비밀번호가 서로 달라요.")).toBeDefined();
  expect(document.activeElement).toBe(idField());
});

test("관심 분야만 비었으면 칩 묶음으로 포커스한다", async () => {
  asGuest();
  renderRoute("/signup");

  await fill({ interests: [] });
  fireEvent.click(submit());

  expect(
    await screen.findByText("관심 분야를 1개 이상 골라 주세요."),
  ).toBeDefined();
  expect(document.activeElement).toBe(
    screen.getByRole("group", { name: "관심 분야" }),
  );
});

test("마지막 남은 관심 분야를 풀려고 하면 안내한다", async () => {
  asGuest();
  renderRoute("/signup");

  await fill({ interests: ["경제"] });
  fireEvent.click(screen.getByRole("button", { name: "경제" }));

  expect(
    await screen.findByText("관심 분야를 1개 이상 골라 주세요."),
  ).toBeDefined();
  // 다른 분야를 고르면 안내를 지운다
  fireEvent.click(screen.getByRole("button", { name: "정치" }));
  expect(screen.queryByText("관심 분야를 1개 이상 골라 주세요.")).toBeNull();
});

test("가입하면 다듬은 값을 보내고, 알림을 띄우고 next 화면으로 간다", async () => {
  asGuest();
  const bodies: SignUpRequest[] = [];
  server.use(
    http.post("/api/v1/members", async ({ request }) => {
      bodies.push((await request.json()) as SignUpRequest);
      return HttpResponse.json(newMember, { status: 201 });
    }),
  );
  const { router, queryClient } = renderRoute(
    "/signup?next=/issues/12%3Fevent%3D3",
  );

  await fill({
    name: "  새뉴런 ",
    loginId: " newbie_1 ",
    password: " password123",
    interests: ["경제", "IT·과학"],
  });
  fireEvent.click(submit());

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/12"),
  );
  expect(router.state.location.search).toBe("?event=3");
  // 이름 · 아이디는 앞뒤 빈칸을 지우고, 비밀번호는 쓴 그대로 보낸다
  expect(bodies).toEqual([
    {
      name: "새뉴런",
      loginId: "newbie_1",
      password: " password123",
      categoryCodes: ["economy", "it_science"],
    },
  ]);
  expect(queryClient.getQueryData(["members", "me"])).toEqual(newMember);
  expect(await screen.findByText("가입을 마쳤어요")).toBeDefined();
});

test("이미 로그인했으면 next 화면으로 보낸다", async () => {
  const { router } = renderRoute("/signup?next=/me");

  await waitFor(() => expect(router.state.location.pathname).toBe("/me"));
});

test("서버가 칸 오류를 주면 그 칸 아래에 그대로 띄운다", async () => {
  asGuest();
  signUpAnswers(() =>
    problem(400, "VALIDATION_FAILED", {
      errors: [
        {
          field: "loginId",
          reason: "아이디는 영문 소문자 · 숫자 · _ 로 4~20자여야 해요",
        },
        {
          field: "categoryCodes",
          reason: "관심 분야를 1개 이상 골라 주세요",
        },
      ],
    }),
  );
  renderRoute("/signup");

  await fill({ loginId: "Newbie" });
  fireEvent.click(submit());

  expect(
    await screen.findByText(
      "아이디는 영문 소문자 · 숫자 · _ 로 4~20자여야 해요",
    ),
  ).toBeDefined();
  expect(screen.getByText("관심 분야를 1개 이상 골라 주세요")).toBeDefined();
  expect(document.activeElement).toBe(idField());
});

test("아이디가 겹치면 아이디 칸 아래에 띄운다", async () => {
  asGuest();
  signUpAnswers(() => problem(409, "LOGIN_ID_TAKEN"));
  renderRoute("/signup");

  await fill();
  fireEvent.click(submit());

  expect(await screen.findByText("이미 쓰는 아이디예요")).toBeDefined();
  expect(idField().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(idField());
});

test.each([
  [
    "429",
    () => problem(429, "RATE_LIMITED"),
    "요청이 많아요. 잠시 뒤 다시 시도해 주세요",
  ],
  [
    "500",
    () => problem(500, "INTERNAL_ERROR"),
    "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  ],
])("%s 이면 폼 안에 안내를 띄우고 머문다", async (_, response, message) => {
  asGuest();
  signUpAnswers(response);
  const { router } = renderRoute("/signup");

  await fill();
  fireEvent.click(submit());

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(message);
  expect(router.state.location.pathname).toBe("/signup");
});

test("로그인 화면으로 가는 버튼이 next 를 넘긴다", async () => {
  asGuest();
  renderRoute("/signup?next=/issues/12");

  await screen.findByRole("heading", { level: 1, name: "회원가입" });
  const form = screen.getByRole("form", { name: "회원가입" });
  expect(within(form).getByText("이미 계정이 있나요?")).toBeDefined();
  expect(
    within(form).getByRole("link", { name: "로그인" }).getAttribute("href"),
  ).toBe("/login?next=/issues/12");
});
