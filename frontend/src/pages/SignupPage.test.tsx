import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

// 단계 제목 — 화면 맨 위 제목(h1)이 단계마다 바뀐다
const STEP = {
  name: "이름을 알려 주세요.",
  account: "아이디와 비밀번호를 정해 주세요.",
  interests: "관심 분야를 골라 주세요.",
  purpose: "NEW:LEARN 을 어디에 쓰실 건가요?",
};
const onStep = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

const nameField = () => screen.getByRole("textbox", { name: "이름" });
const idField = () => screen.getByRole("textbox", { name: "아이디" });
const passwordField = () => screen.getByLabelText("비밀번호");
const confirmField = () => screen.getByLabelText("비밀번호 확인");
const nextButton = () => screen.getByRole("button", { name: "다음" });
// 보내는 동안에는 SEED 가 버튼 안에 진행 표시를 넣어 이름이 바뀐다
const submit = () => screen.getByRole("button", { name: /가입하기/ });
const progress = () =>
  screen
    .getByRole("progressbar", { name: "가입 진행" })
    .getAttribute("aria-valuetext");

type Form = {
  name?: string;
  loginId?: string;
  password?: string;
  /** 없으면 비밀번호와 같게 */
  confirm?: string;
  /** 누를 관심 분야 칩 이름 */
  interests?: string[];
};

// 이름부터 관심 분야까지 채우며 넘어가 마지막 사용 목적 단계에 선다
async function fillToLastStep({
  name = "새뉴런",
  loginId = "newbie_1",
  password = "password123",
  confirm = password,
  interests = ["경제"],
}: Form = {}) {
  await onStep(STEP.name);
  fireEvent.change(nameField(), { target: { value: name } });
  fireEvent.click(nextButton());
  await onStep(STEP.account);
  fireEvent.change(idField(), { target: { value: loginId } });
  fireEvent.change(passwordField(), { target: { value: password } });
  fireEvent.change(confirmField(), { target: { value: confirm } });
  fireEvent.click(nextButton());
  await onStep(STEP.interests);
  for (const interest of interests)
    fireEvent.click(await screen.findByRole("button", { name: interest }));
  fireEvent.click(nextButton());
  await onStep(STEP.purpose);
}

test("셸 없이 첫 단계로 이름 칸과 진행 막대를 띄운다", async () => {
  asGuest();
  renderRoute("/signup?next=/home");

  expect(await onStep(STEP.name)).toBeDefined();
  expect(screen.getByText("01.")).toBeDefined();
  expect(nameField().getAttribute("autocomplete")).toBe("name");
  expect(progress()).toBe("4단계 중 1단계");
  // 첫 단계에는 돌아갈 곳이 없다
  expect(screen.queryByRole("button", { name: "이전" })).toBeNull();
  // 셸(헤더) 없이 뜬다
  expect(screen.queryByRole("link", { name: "나의 뉴스함" })).toBeNull();
  await waitFor(() => expect(document.title).toBe("회원가입 | NEW:LEARN"));
});

test("칸을 비우고 다음을 누르면 그 단계 오류만 띄우고 머문다", async () => {
  asGuest();
  renderRoute("/signup");

  await onStep(STEP.name);
  fireEvent.click(nextButton());

  expect(await screen.findByText("이름을 입력해 주세요.")).toBeDefined();
  expect(nameField().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(nameField());
  // 뒤 단계 칸은 아직 검사하지 않는다
  expect(screen.queryByText("아이디를 입력해 주세요.")).toBeNull();
  expect(progress()).toBe("4단계 중 1단계");
});

test("이름을 쓰고 다음을 누르면 아이디 단계로 넘어가 아이디 칸에 포커스한다", async () => {
  asGuest();
  renderRoute("/signup");

  await onStep(STEP.name);
  fireEvent.change(nameField(), { target: { value: "새뉴런" } });
  fireEvent.click(nextButton());

  expect(await onStep(STEP.account)).toBeDefined();
  expect(screen.getByText("02.")).toBeDefined();
  expect(progress()).toBe("4단계 중 2단계");
  expect(idField().getAttribute("autocomplete")).toBe("username");
  expect(idField().getAttribute("placeholder")).toBe("4자 이상");
  expect(passwordField().getAttribute("autocomplete")).toBe("new-password");
  expect(confirmField().getAttribute("type")).toBe("password");
  await waitFor(() => expect(document.activeElement).toBe(idField()));
});

test("짧은 아이디 · 비밀번호, 다른 확인 값이면 그 문구를 띄운다", async () => {
  asGuest();
  renderRoute("/signup");

  await onStep(STEP.name);
  fireEvent.change(nameField(), { target: { value: "새뉴런" } });
  fireEvent.click(nextButton());
  await onStep(STEP.account);
  fireEvent.change(idField(), { target: { value: "abc" } });
  fireEvent.change(passwordField(), { target: { value: "short" } });
  fireEvent.change(confirmField(), { target: { value: "shorter" } });
  fireEvent.click(nextButton());

  expect(
    await screen.findByText("아이디는 4자 이상으로 입력해 주세요."),
  ).toBeDefined();
  expect(
    screen.getByText("비밀번호는 8자 이상으로 입력해 주세요."),
  ).toBeDefined();
  expect(screen.getByText("비밀번호가 서로 달라요.")).toBeDefined();
  await waitFor(() => expect(document.activeElement).toBe(idField()));
  expect(progress()).toBe("4단계 중 2단계");
});

test("이전을 누르면 앞 단계로 돌아가고 쓴 값이 남는다", async () => {
  asGuest();
  renderRoute("/signup");

  await onStep(STEP.name);
  fireEvent.change(nameField(), { target: { value: "새뉴런" } });
  fireEvent.click(nextButton());
  await onStep(STEP.account);
  fireEvent.click(screen.getByRole("button", { name: "이전" }));

  expect(await onStep(STEP.name)).toBeDefined();
  expect(progress()).toBe("4단계 중 1단계");
  expect((nameField() as HTMLInputElement).value).toBe("새뉴런");
});

test("관심 분야를 고르지 않고 다음을 누르면 칩 묶음으로 포커스한다", async () => {
  asGuest();
  renderRoute("/signup");

  await onStep(STEP.name);
  fireEvent.change(nameField(), { target: { value: "새뉴런" } });
  fireEvent.click(nextButton());
  await onStep(STEP.account);
  fireEvent.change(idField(), { target: { value: "newbie_1" } });
  fireEvent.change(passwordField(), { target: { value: "password123" } });
  fireEvent.change(confirmField(), { target: { value: "password123" } });
  fireEvent.click(nextButton());
  await onStep(STEP.interests);
  fireEvent.click(nextButton());

  expect(
    await screen.findByText("관심 분야를 1개 이상 골라 주세요."),
  ).toBeDefined();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("group", { name: "관심 분야" }),
    ),
  );
  expect(progress()).toBe("4단계 중 3단계");
});

test("마지막 남은 관심 분야를 풀려고 하면 안내한다", async () => {
  asGuest();
  renderRoute("/signup");

  await fillToLastStep({ interests: ["경제"] });
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await onStep(STEP.interests);
  fireEvent.click(screen.getByRole("button", { name: "경제" }));

  expect(
    await screen.findByText("관심 분야를 1개 이상 골라 주세요."),
  ).toBeDefined();
  // 다른 분야를 고르면 안내를 지운다
  fireEvent.click(screen.getByRole("button", { name: "정치" }));
  expect(screen.queryByText("관심 분야를 1개 이상 골라 주세요.")).toBeNull();
});

test("사용 목적은 하나만 고르고, 다시 누르면 푼다", async () => {
  asGuest();
  renderRoute("/signup");

  await fillToLastStep();
  expect(progress()).toBe("4단계 중 4단계");
  expect(screen.getByText("고르지 않고 가입해도 돼요.")).toBeDefined();
  const pressed = (name: string) =>
    screen.getByRole("button", { name }).getAttribute("aria-pressed");

  fireEvent.click(screen.getByRole("button", { name: "취업 준비" }));
  expect(pressed("취업 준비")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "시사 공부" }));
  expect(pressed("취업 준비")).toBe("false");
  expect(pressed("시사 공부")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "시사 공부" }));
  expect(pressed("시사 공부")).toBe("false");
});

test("가입하면 다듬은 값을 보내고, 알림을 띄우고 next 화면으로 간다", async () => {
  localStorage.setItem("newlearn.coach.home", "done");
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

  await fillToLastStep({
    name: "  새뉴런 ",
    loginId: " newbie_1 ",
    password: " password123",
    interests: ["경제", "IT·과학"],
  });
  fireEvent.click(screen.getByRole("button", { name: "취업 준비" }));
  fireEvent.click(submit());

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/12"),
  );
  expect(router.state.location.search).toBe("?event=3");
  // 이름 · 아이디는 앞뒤 빈칸을 지우고, 비밀번호는 쓴 그대로 보낸다.
  // 사용 목적은 A14 에 칸이 없어 보내지 않는다
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
  // 「다시 보지 않기」로 닫은 화면 안내도 새 회원에게 다시 띄운다 (Jira 204)
  expect(localStorage.getItem("newlearn.coach.home")).toBeNull();
});

test("사용 목적을 고르지 않아도 가입한다", async () => {
  asGuest();
  const bodies = signUpAnswers(() =>
    HttpResponse.json(newMember, { status: 201 }),
  );
  renderRoute("/signup");

  await fillToLastStep();
  fireEvent.click(submit());

  await waitFor(() => expect(bodies).toHaveLength(1));
});

test("이미 로그인했으면 next 화면으로 보낸다", async () => {
  const { router } = renderRoute("/signup?next=/me");

  await waitFor(() => expect(router.state.location.pathname).toBe("/me"));
});

test("서버가 칸 오류를 주면 그 칸이 있는 단계로 돌아가 칸 아래에 그대로 띄운다", async () => {
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

  await fillToLastStep({ loginId: "Newbie" });
  fireEvent.click(submit());

  // 틀린 칸 중 앞 단계인 아이디 단계로 돌아간다
  expect(await onStep(STEP.account)).toBeDefined();
  expect(
    screen.getByText("아이디는 영문 소문자 · 숫자 · _ 로 4~20자여야 해요"),
  ).toBeDefined();
  await waitFor(() => expect(document.activeElement).toBe(idField()));
  // 관심 분야 오류는 그 단계로 가면 보인다
  fireEvent.change(idField(), { target: { value: "newbie" } });
  fireEvent.click(nextButton());
  await onStep(STEP.interests);
  expect(screen.getByText("관심 분야를 1개 이상 골라 주세요")).toBeDefined();
});

test("아이디가 겹치면 아이디 단계로 돌아가 아이디 칸 아래에 띄운다", async () => {
  asGuest();
  signUpAnswers(() => problem(409, "LOGIN_ID_TAKEN"));
  renderRoute("/signup");

  await fillToLastStep();
  fireEvent.click(submit());

  expect(await onStep(STEP.account)).toBeDefined();
  expect(screen.getByText("이미 쓰는 아이디예요")).toBeDefined();
  expect(idField().getAttribute("aria-invalid")).toBe("true");
  await waitFor(() => expect(document.activeElement).toBe(idField()));
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
])(
  "%s 이면 마지막 단계에 안내를 띄우고 머문다",
  async (_, response, message) => {
    asGuest();
    signUpAnswers(response);
    const { router } = renderRoute("/signup");

    await fillToLastStep();
    fireEvent.click(submit());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(router.state.location.pathname).toBe("/signup");
    expect(
      screen.getByRole("heading", { level: 1, name: STEP.purpose }),
    ).toBeDefined();
  },
);

test("로그인 화면으로 가는 버튼은 첫 단계에만 있고 next 를 넘긴다", async () => {
  asGuest();
  renderRoute("/signup?next=/issues/12");

  await onStep(STEP.name);
  expect(screen.getByText("이미 계정이 있나요?")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "로그인" }).getAttribute("href"),
  ).toBe("/login?next=/issues/12");

  fireEvent.change(nameField(), { target: { value: "새뉴런" } });
  fireEvent.click(nextButton());
  await onStep(STEP.account);
  expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
});

test("로그인 화면으로 갈 때는 기록을 쌓지 않고 바꿔 끼운다", async () => {
  asGuest();
  const { router } = renderRoute("/signup?next=/home");
  await onStep(STEP.name);

  fireEvent.click(screen.getByRole("link", { name: "로그인" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.historyAction).toBe("REPLACE");
});

// 닫기는 들어오기 전 화면, 곧 돌아올 곳(next)으로 — 가입 권유 창에서 온 손님이 닫으면 보던 화면으로 돌아온다
// (EXPERIENCE.md 로그인 · 가입 폼, Jira 205)
test("닫기를 누르면 들어오기 전 화면으로 돌아간다", async () => {
  asGuest();
  const { router } = renderRoute("/home");
  await screen.findByRole("heading", {
    level: 1,
    name: "오늘의 이슈를 탐색해 보세요",
  });
  await act(() => router.navigate("/signup?next=/home"));
  await onStep(STEP.name);

  fireEvent.click(screen.getByRole("link", { name: "닫기" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
});

test("돌아올 곳이 없으면 닫기는 랜딩으로 가고, 로그인 화면에도 넘기지 않는다", async () => {
  asGuest();
  const { router } = renderRoute("/signup");
  await onStep(STEP.name);
  expect(
    screen.getByRole("link", { name: "로그인" }).getAttribute("href"),
  ).toBe("/login");

  fireEvent.click(screen.getByRole("link", { name: "닫기" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
});

test("가입하면 손님으로 받아 둔 응답을 버린다", async () => {
  asGuest();
  const { router, queryClient } = renderRoute("/signup?next=/home");
  const articleKey = ["articles", 999];
  queryClient.setQueryData(articleKey, { id: 999, bookmarked: false });
  await fillToLastStep();

  fireEvent.click(submit());

  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
  expect(queryClient.getQueryData(articleKey)).toBeUndefined();
});
