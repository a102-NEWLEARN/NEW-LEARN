import { focusManager } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { HomePage } from "@/pages/HomePage";
import { renderRoute } from "@/test/render";

// 셸 없이 홈만 연다. 주소(?category=)를 보려고 라우터를 쓴다
function renderHome(path = "/home") {
  return renderRoute(path, [{ path: "/home", element: <HomePage /> }]);
}

// 인사는 지금 시각을 본다. Date 만 고정하고 MSW · React Query 타이머는 그대로 둔다
function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => vi.useRealTimers());

function guestWith(status: number, code: string) {
  server.use(
    http.get("/api/v1/members/me", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: code,
          status,
          detail: code,
          instance: "/api/v1/members/me",
          code,
        },
        { status },
      ),
    ),
  );
}

test("제목 · 안내 한 줄 · 검색창을 보인다", async () => {
  renderHome();

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "오늘의 이슈를 탐색해 보세요",
    }),
  ).toBeDefined();
  expect(
    screen.getByText(
      "검색하거나, 아래 추천 이슈에서 사건의 흐름을 따라가 보세요.",
    ),
  ).toBeDefined();
  expect(
    screen.getByRole("combobox", { name: "이슈, 사건, 기사 검색" }),
  ).toBeDefined();
});

test.each([
  ["2026-10-23T10:59:00+09:00", "김뉴런님, 좋은 아침이에요 · 10월 23일 금요일"],
  ["2026-10-23T11:00:00+09:00", "김뉴런님, 좋은 오후예요 · 10월 23일 금요일"],
  [
    "2026-10-23T18:00:00+09:00",
    "김뉴런님, 오늘 하루도 수고했어요 · 10월 23일 금요일",
  ],
])("회원이면 이름과 한국 시간대 인사를 붙인다 (%s)", async (now, text) => {
  setNow(now);
  renderHome();

  expect(await screen.findByText(text)).toBeDefined();
});

test("손님(A17 401)이면 날짜만 보인다", async () => {
  setNow("2026-10-23T09:00:00+09:00");
  guestWith(401, "UNAUTHORIZED");
  renderHome();

  expect(await screen.findByText("10월 23일 금요일")).toBeDefined();
  expect(screen.queryByText(/님,/)).toBeNull();
});

test("A17 회원 정보로 추천 이슈 제목과 관심 분야 탭을 정한다", async () => {
  renderHome();

  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "김뉴런님을 위한 추천 이슈",
    }),
  ).toBeDefined();
  expect(
    (await screen.findAllByRole("tab"))[0].getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getAllByRole("tab")[0].textContent).toBe("경제, 관심 분야");
});

test("손님이면 추천 이슈 제목에 이름이 없다", async () => {
  guestWith(401, "UNAUTHORIZED");
  renderHome();

  expect(
    await screen.findByRole("heading", { level: 2, name: "추천 이슈" }),
  ).toBeDefined();
});

test("A17 이 다른 오류로 실패해도 홈을 막지 않고 손님 문구로 보인다", async () => {
  setNow("2026-10-23T09:00:00+09:00");
  guestWith(500, "INTERNAL_ERROR");
  renderHome();

  expect(await screen.findByText("10월 23일 금요일")).toBeDefined();
  expect(
    await screen.findByRole("list", { name: "새로운 이슈" }),
  ).toBeDefined();
});

test("창에 돌아와도 A17 을 다시 부르지 않아 탭 순서가 그대로다", async () => {
  // SEED Tabs 는 방향키 순서를 탭을 처음 그릴 때만 읽는다. 순서가 바뀌면 방향키가 엇나간다
  let calls = 0;
  const count = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname === "/api/v1/members/me") calls += 1;
  };
  server.events.on("request:start", count);
  onTestFinished(() => {
    server.events.removeListener("request:start", count);
    focusManager.setFocused(undefined);
  });
  renderHome();
  await screen.findByRole("tablist", { name: "분야" });

  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(calls).toBe(1);
});
