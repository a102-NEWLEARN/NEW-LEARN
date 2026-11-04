import { fireEvent, screen, within } from "@testing-library/react";
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

// 레일에는 펼치기 · 빠른 이동만 둔다 — 홈은 헤더 로고, 나의 뉴스함은 헤더 버튼, 분야별 이슈는 펼치기와 겹친다.
// 관심 이슈는 마이페이지에 있다 (2026-11-04 사용자 결정, Jira 167)
test("접힌 레일에는 펼치기와 빠른 이동 두 버튼만 있다", async () => {
  renderRoute("/home");

  await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" });
  expect(
    within(sidebar())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["사이드바 펼치기", "빠른 이동"]);
  expect(within(sidebar()).queryAllByRole("link")).toHaveLength(0);
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

// 분야 이름 오른쪽에 A1 issueCount — 모바일 v1 · v21 Sidebar (Jira 163).
// 숫자는 눈으로 보는 보조라 화면 읽기에서 빼서 분야 버튼 이름은 「경제」 그대로다
test("펼친 사이드바의 분야 옆에 이슈 수를 보인다", async () => {
  renderRoute("/home");

  fireEvent.click(
    await within(sidebar()).findByRole("button", { name: "사이드바 펼치기" }),
  );
  const economy = await within(sidebar()).findByRole("button", {
    name: "경제",
  });
  const count = within(economy).getByText("4");
  expect(count.getAttribute("aria-hidden")).toBe("true");
});
