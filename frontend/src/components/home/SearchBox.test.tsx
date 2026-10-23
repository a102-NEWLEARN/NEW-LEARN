import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, onTestFinished, test, vi } from "vitest";
import { searchQuery } from "@/api/search";
import { SearchBox } from "@/components/home/SearchBox";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 검색창만 연다. 결과를 고르면 다른 주소로 가므로 그 밖의 주소에는 빈 화면을 둔다
function renderSearch(focusRequest?: number) {
  return renderRoute("/home?category=economy", [
    {
      path: "/home",
      element: (
        <>
          <SearchBox focusRequest={focusRequest} />
          <button type="button">바깥</button>
        </>
      ),
    },
    { path: "*", element: <p>다른 화면</p> },
  ]);
}

const input = () =>
  screen.getByRole("combobox", { name: "이슈, 사건, 기사 검색" });

const optionTitles = (group: HTMLElement) =>
  within(group)
    .getAllByRole("option")
    .map((option) => option.firstElementChild?.textContent);

async function openWith(text: string) {
  act(() => input().focus());
  fireEvent.change(input(), { target: { value: text } });
}

test("누르면 최근 업데이트된 이슈 5개를 연다", async () => {
  renderSearch();

  act(() => input().focus());

  expect(input().getAttribute("aria-expanded")).toBe("true");
  const recent = await screen.findByRole("group", {
    name: "최근 업데이트된 이슈",
  });
  expect(optionTitles(recent)).toEqual([
    "원/달러 환율 1,500원 돌파",
    "소버린 AI 경쟁",
    "중동 휴전 협상",
    "국회 예산안 처리",
    "의대 정원 조정",
  ]);
  expect(within(recent).getAllByRole("option")[0].textContent).toContain(
    "경제 · 사건 4 · 기사 12",
  );
  expect(screen.getByText("↑↓ 이동 · Enter 열기 · Esc 닫기")).toBeDefined();
});

test("글자를 치면 이슈 · 사건 · 기사로 나눠 보이고 맞는 글자를 칠한다", async () => {
  renderSearch();

  await openWith("공장");

  const issues = await screen.findByRole("group", { name: "이슈" });
  expect(optionTitles(issues)).toEqual(["한빛반도체 미국 공장 건설"]);
  expect(optionTitles(screen.getByRole("group", { name: "사건" }))).toEqual([
    "텍사스 공장 엔지니어 수급 우려 보도",
  ]);
  expect(optionTitles(screen.getByRole("group", { name: "기사" }))).toEqual([
    "한빛반도체, 텍사스 공장 착공식 열어",
    "美 공장 인력난에 국내 엔지니어 파견 검토",
  ]);
  const marks = screen.getByRole("listbox").querySelectorAll("mark");
  expect([...marks].map((mark) => mark.textContent)).toEqual([
    "공장",
    "공장",
    "공장",
    "공장",
  ]);
});

test("↑↓ 로 고르고 Enter 로 그 줄을 연다 — 사건은 그 이슈에서 사건을 고른 채", async () => {
  const { router } = renderSearch();

  await openWith("공장");
  await screen.findByRole("group", { name: "사건" });
  const options = screen.getAllByRole("option");
  // 처음에는 맨 앞 줄이 골라져 있다
  expect(input().getAttribute("aria-activedescendant")).toBe(options[0].id);
  fireEvent.keyDown(input(), { key: "ArrowDown" });
  fireEvent.keyDown(input(), { key: "ArrowDown" });
  fireEvent.keyDown(input(), { key: "ArrowUp" });

  expect(input().getAttribute("aria-activedescendant")).toBe(options[1].id);
  expect(options[1].getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(input(), { key: "Enter" });

  expect(router.state.location.pathname).toBe("/issues/12");
  expect(router.state.location.search).toBe("?event=120");
});

test("이슈 · 기사를 누르면 그 화면으로 간다", async () => {
  const { router } = renderSearch();

  await openWith("공장");
  fireEvent.click(
    await screen.findByRole("option", { name: /한빛반도체, 텍사스 공장/ }),
  );

  expect(router.state.location.pathname).toBe("/articles/401");
});

// 앞 검색어의 결과가 아직 보이는 동안(200ms 기다림 + 응답) — 그 결과를 고르면 안 된다
test("검색어를 바꾸고 바로 Enter 를 누르면 새 검색어의 맨 앞 결과를 연다", async () => {
  const { router } = renderSearch();
  await openWith("공장");
  await screen.findByRole("group", { name: "기사" });

  fireEvent.change(input(), { target: { value: "금리" } });
  fireEvent.keyDown(input(), { key: "Enter" });

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/13"),
  );
});

// Enter 를 누른 채로 두거나 한글 입력기가 keydown 을 두 번 보낼 때 — 같은 주소가 두 번 쌓이면 뒤로 가기를 두 번 눌러야 한다
test("결과가 오기 전에 Enter 를 두 번 눌러도 한 번만 연다", async () => {
  const { router } = renderSearch();
  await openWith("공장");
  await screen.findByRole("group", { name: "기사" });

  fireEvent.change(input(), { target: { value: "금리" } });
  fireEvent.keyDown(input(), { key: "Enter" });
  fireEvent.keyDown(input(), { key: "Enter" });
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/13"),
  );

  await act(() => router.navigate(-1));
  expect(router.state.location.pathname).toBe("/home");
});

test("결과가 오기 전에 Esc 로 닫으면 결과가 와도 옮기지 않는다", async () => {
  const { router, queryClient } = renderSearch();
  await openWith("공장");
  await screen.findByRole("group", { name: "기사" });

  fireEvent.change(input(), { target: { value: "금리" } });
  fireEvent.keyDown(input(), { key: "Enter" });
  fireEvent.keyDown(input(), { key: "Escape" });
  await waitFor(() =>
    expect(
      queryClient.getQueryData(searchQuery("금리").queryKey),
    ).toBeDefined(),
  );
  await act(async () => {});

  expect(router.state.location.pathname).toBe("/home");
});

test("앞 검색어의 결과가 남아 있는 동안에는 그 줄을 고를 수 없고 칠하지도 않는다", async () => {
  renderSearch();
  await openWith("공장");
  await screen.findByRole("group", { name: "기사" });

  fireEvent.change(input(), { target: { value: "금리" } });

  expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  expect(input().getAttribute("aria-activedescendant")).toBeNull();
  expect(screen.getByRole("listbox").querySelectorAll("mark")).toHaveLength(0);
});

test("새 결과를 기다리는 동안에는 앞 결과를 고를 수 없고 앞 안내도 보이지 않는다", async () => {
  renderSearch();
  await openWith("없는말");
  await screen.findByText("'없는말'에 맞는 이슈·사건·기사가 없어요");

  fireEvent.change(input(), { target: { value: "공" } });

  expect(
    screen.queryByText("'없는말'에 맞는 이슈·사건·기사가 없어요"),
  ).toBeNull();
  expect(input().getAttribute("aria-activedescendant")).toBeNull();
});

test("결과가 오기 전에 ↓ 를 눌러도 결과가 오면 맨 앞 줄이 골라져 있다", async () => {
  renderSearch();
  await openWith("공장");

  fireEvent.keyDown(input(), { key: "ArrowDown" });
  const first = (await screen.findAllByRole("option"))[0];

  await waitFor(() =>
    expect(input().getAttribute("aria-activedescendant")).toBe(first.id),
  );
});

test("목록 이름은 비었을 때 「최근 업데이트된 이슈」, 글자를 치면 「검색 결과」다", async () => {
  renderSearch();
  act(() => input().focus());
  expect(
    screen.getByRole("listbox", { name: "최근 업데이트된 이슈" }),
  ).toBeDefined();

  fireEvent.change(input(), { target: { value: "공장" } });

  expect(screen.getByRole("listbox", { name: "검색 결과" })).toBeDefined();
});

test("묶음마다 보일 수를 넘으면 잘라 보이고 묶음 이름에 「4 / 5개」를 붙인다", async () => {
  renderSearch();

  await openWith("공");

  const events = await screen.findByRole("group", { name: "사건 4 / 5개" });
  expect(within(events).getAllByRole("option")).toHaveLength(4);
});

// 줄 id 가 순번이면 결과가 바뀌어도 aria-activedescendant 가 그대로라 스크린 리더가 새 줄을 읽지 않는다
test("결과가 바뀌면 골라진 줄의 id 도 바뀐다", async () => {
  renderSearch();
  await openWith("공장");
  await screen.findByRole("group", { name: "기사" });
  const before = input().getAttribute("aria-activedescendant");

  fireEvent.change(input(), { target: { value: "금리" } });
  await screen.findByRole("option", { name: "기준금리 동결 행진" });

  await waitFor(() =>
    expect(input().getAttribute("aria-activedescendant")).not.toBeNull(),
  );
  expect(input().getAttribute("aria-activedescendant")).not.toBe(before);
});

test("맞는 것이 없으면 그렇다고 안내한다", async () => {
  renderSearch();

  await openWith("없는말");

  const message = await screen.findByText(
    "'없는말'에 맞는 이슈·사건·기사가 없어요",
  );
  // 스크린 리더가 읽어 주게
  expect(message.getAttribute("role")).toBe("status");
});

test("Esc 로 닫고 ↓ 로 다시 연다", async () => {
  renderSearch();
  act(() => input().focus());
  await screen.findByRole("group", { name: "최근 업데이트된 이슈" });

  fireEvent.keyDown(input(), { key: "Escape" });
  expect(input().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("group")).toBeNull();

  fireEvent.keyDown(input(), { key: "ArrowDown" });
  expect(input().getAttribute("aria-expanded")).toBe("true");
});

test("목록 안의 줄이 아닌 곳을 눌러도 입력 칸이 포커스를 잃지 않는다", async () => {
  renderSearch();
  await openWith("공장");
  const label = await screen.findByText("이슈");

  // 기본 동작(포커스 옮기기)을 막았으면 dispatchEvent 가 false 를 돌려준다
  expect(fireEvent.mouseDown(label)).toBe(false);
  expect(
    fireEvent.mouseDown(screen.getByText("↑↓ 이동 · Enter 열기 · Esc 닫기")),
  ).toBe(false);
});

test("검색어 지우기 버튼은 입력 칸의 label 밖에 있다", async () => {
  renderSearch();
  await openWith("공장");

  expect(
    screen.getByRole("button", { name: "검색어 지우기" }).closest("label"),
  ).toBeNull();
});

test("바깥을 누르면 닫힌다", async () => {
  renderSearch();
  act(() => input().focus());
  await screen.findByRole("group", { name: "최근 업데이트된 이슈" });

  fireEvent.mouseDown(screen.getByRole("button", { name: "바깥" }));

  expect(input().getAttribute("aria-expanded")).toBe("false");
});

test("✕ 로 지우면 최근 이슈로 돌아가고 포커스는 입력 칸에 남는다", async () => {
  renderSearch();
  await openWith("공장");
  await screen.findByRole("group", { name: "이슈" });

  fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));

  expect((input() as HTMLInputElement).value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(
    await screen.findByRole("group", { name: "최근 업데이트된 이슈" }),
  ).toBeDefined();
});

test("검색이 실패하면 목록 안에 안내와 다시 시도를 둔다", async () => {
  server.use(
    http.get("/api/v1/search", () => HttpResponse.json(null, { status: 400 }), {
      once: true,
    }),
  );
  renderSearch();
  await openWith("공장");

  expect(
    await screen.findByText("검색 결과를 불러오지 못했어요"),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await screen.findByRole("group", { name: "이슈" })).toBeDefined();
});

test("포커스 요청을 받으면 입력 칸에 포커스하고 목록을 연다", async () => {
  renderSearch(1);

  expect(document.activeElement).toBe(input());
  expect(input().getAttribute("aria-expanded")).toBe("true");
});

test("Tab 으로 검색창 밖에 나가면 닫힌다", async () => {
  renderSearch();
  act(() => input().focus());
  await screen.findByRole("group", { name: "최근 업데이트된 이슈" });

  act(() => screen.getByRole("button", { name: "바깥" }).focus());

  expect(input().getAttribute("aria-expanded")).toBe("false");
});

test("글자를 칠 때마다 부르지 않고 멈춘 뒤 한 번만 A13 을 부른다", async () => {
  const asked: string[] = [];
  const count = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/search")
      asked.push(url.searchParams.get("q") ?? "");
  };
  server.events.on("request:start", count);
  onTestFinished(() => {
    server.events.removeListener("request:start", count);
  });
  renderSearch();

  // 사람이 치는 속도처럼 글자 사이에 50ms — 200ms 를 기다리지 않으면 「공」도 부른다
  await openWith("공");
  await new Promise((resolve) => setTimeout(resolve, 50));
  fireEvent.change(input(), { target: { value: "공장" } });
  await screen.findByRole("group", { name: "기사" });

  expect(asked).toEqual(["공장"]);
});

test("Esc 는 목록만 닫고 바깥(서랍 같은 것)으로 넘기지 않는다", async () => {
  const outer = vi.fn();
  window.addEventListener("keydown", outer);
  onTestFinished(() => window.removeEventListener("keydown", outer));
  renderSearch();
  act(() => input().focus());
  await screen.findByRole("group", { name: "최근 업데이트된 이슈" });

  fireEvent.keyDown(input(), { key: "Escape" });

  expect(input().getAttribute("aria-expanded")).toBe("false");
  expect(outer).not.toHaveBeenCalled();
});

test("최근 이슈를 못 불러오면 목록 안에 안내와 다시 시도를 둔다", async () => {
  server.use(
    http.get("/api/v1/issues", () => HttpResponse.json(null, { status: 400 }), {
      once: true,
    }),
  );
  renderSearch();
  act(() => input().focus());

  expect(
    await screen.findByText("최근 이슈를 불러오지 못했어요"),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(
    await screen.findByRole("group", { name: "최근 업데이트된 이슈" }),
  ).toBeDefined();
});
