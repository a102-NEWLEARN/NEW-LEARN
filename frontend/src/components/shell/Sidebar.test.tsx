import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderRoute } from "@/test/render";

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

test("관심 이슈 — 곧 제공 안내를 띄운다", async () => {
  renderRoute("/home");

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "관심 이슈" }),
  );

  expect(
    await screen.findByText("MVP 이후 제공 예정인 기능이에요"),
  ).toBeDefined();
});

test("나의 뉴스함 — 나의 뉴스함 화면으로 가고, 그 화면이면 눌린 모양이다", async () => {
  const { router } = renderRoute("/home");

  const link = await within(sidebar()).findByRole("link", {
    name: "나의 뉴스함",
  });
  expect(link.getAttribute("aria-current")).toBeNull();
  fireEvent.click(link);

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/bookmarks"),
  );
  expect(
    within(sidebar())
      .getByRole("link", { name: "나의 뉴스함" })
      .getAttribute("aria-current"),
  ).toBe("page");
});

// 빠른 이동 — 어느 화면에서든 홈으로 가서 검색창에 포커스한다 (EXPERIENCE.md IA 통합 검색)
test("레일의 빠른 이동을 누르면 홈 검색창으로 간다", async () => {
  const { router } = renderRoute("/issues/12");

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "빠른 이동" }),
  );

  const search = await screen.findByRole("combobox", {
    name: "이슈, 사건, 기사 검색",
  });
  expect(router.state.location.pathname).toBe("/home");
  expect(document.activeElement).toBe(search);
});

test("펼친 사이드바의 빠른 이동도 홈 검색창으로 간다", async () => {
  const { router } = renderRoute("/issues/12");
  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" }),
  );

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "빠른 이동" }),
  );

  const search = await screen.findByRole("combobox", {
    name: "이슈, 사건, 기사 검색",
  });
  expect(router.state.location.pathname).toBe("/home");
  expect(document.activeElement).toBe(search);
});
