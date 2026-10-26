import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { beforeEach, expect, test } from "vitest";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// /home 은 개발 확인 화면이라 헬스를 부른다 (App.test.tsx 와 같다)
beforeEach(() => {
  server.use(
    http.get("/actuator/health", () => HttpResponse.json({ status: "UP" })),
  );
});

const sidebar = () => screen.getByRole("navigation", { name: "사이드바" });

test("처음에는 접혀 있고 아이콘만 보인다", async () => {
  renderRoute("/home");

  const toggle = await within(sidebar()).findByRole("button", {
    name: "사이드바 펼치기",
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(within(sidebar()).queryByText("이슈 탐색")).toBeNull();
});

test("펼치기 · 접기 버튼으로 폈다 접는다", async () => {
  renderRoute("/home");

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" }),
  );
  const collapse = within(sidebar()).getByRole("button", {
    name: "사이드바 접기",
  });
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  expect(within(sidebar()).getByText("이슈 탐색")).toBeDefined();

  fireEvent.click(collapse);
  expect(
    within(sidebar()).getByRole("button", { name: "사이드바 펼치기" }),
  ).toBeDefined();
});

// 누른 버튼이 접힘 · 펼침에 따라 바뀌어도 키보드 포커스가 사라지지 않는다 (EXPERIENCE.md 「포커스는 늘 보인다」)
test("접고 펴도 포커스가 접기 · 펼치기 버튼에 남는다", async () => {
  renderRoute("/home");

  const expand = await within(sidebar()).findByRole("button", {
    name: "사이드바 펼치기",
  });
  expand.focus();
  fireEvent.click(expand);
  expect(document.activeElement).toBe(
    within(sidebar()).getByRole("button", { name: "사이드바 접기" }),
  );

  fireEvent.click(document.activeElement!);
  expect(document.activeElement).toBe(
    within(sidebar()).getByRole("button", { name: "사이드바 펼치기" }),
  );
});

test("접었다 펴도 열어 둔 분야가 그대로 열려 있다", async () => {
  renderRoute("/home");

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" }),
  );
  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "경제" }),
  );
  fireEvent.click(
    within(sidebar()).getByRole("button", { name: "사이드바 접기" }),
  );
  fireEvent.click(
    within(sidebar()).getByRole("button", { name: "사이드바 펼치기" }),
  );

  expect(
    (
      await within(sidebar()).findByRole("button", { name: "경제" })
    ).getAttribute("aria-expanded"),
  ).toBe("true");
});

test("처음 화면을 열 때는 포커스를 가져가지 않는다", async () => {
  renderRoute("/home");
  await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" });

  expect(document.activeElement).toBe(document.body);
});

test("Ctrl+\\ 로 폈다 접는다", async () => {
  renderRoute("/home");
  await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" });

  fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
  expect(
    within(sidebar()).getByRole("button", { name: "사이드바 접기" }),
  ).toBeDefined();

  fireEvent.keyDown(window, { key: "\\", metaKey: true });
  expect(
    within(sidebar()).getByRole("button", { name: "사이드바 펼치기" }),
  ).toBeDefined();
});

// macOS 한글 입력기는 그 자리 키를 「₩」로 낼 수 있다. 글자 대신 키 자리(Backslash)로도 본다
test("한글 입력기에서 ₩ 로 들어와도 단축키가 먹는다", async () => {
  renderRoute("/home");
  await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" });

  fireEvent.keyDown(window, { key: "₩", code: "Backslash", metaKey: true });

  expect(
    within(sidebar()).getByRole("button", { name: "사이드바 접기" }),
  ).toBeDefined();
});

test("접힌 레일에서 지금 화면(홈)을 표시한다", async () => {
  renderRoute("/home");

  const home = await within(sidebar()).findByRole("link", { name: "홈" });
  expect(home.getAttribute("href")).toBe("/home");
  expect(home.getAttribute("aria-current")).toBe("page");
});

test("분야별 이슈 아이콘을 누르면 사이드바를 편다", async () => {
  renderRoute("/home");

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "분야별 이슈 보기" }),
  );

  expect(within(sidebar()).getByText("이슈 탐색")).toBeDefined();
});

test.each(["빠른 이동", "관심 이슈", "나의 뉴스함"])(
  "%s — 곧 제공 안내를 띄운다",
  async (name) => {
    renderRoute("/home");

    fireEvent.click(await within(sidebar()).findByRole("button", { name }));

    expect(
      await screen.findByText("MVP 이후 제공 예정인 기능이에요"),
    ).toBeDefined();
  },
);
