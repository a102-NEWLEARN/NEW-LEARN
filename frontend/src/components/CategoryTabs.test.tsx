import { act, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { type CategoryTab, CategoryTabs } from "@/components/CategoryTabs";
import { renderWithProviders } from "@/test/render";

const tabs: CategoryTab[] = [
  { code: "economy", name: "경제", marked: true },
  { code: "politics", name: "정치" },
  { code: "society", name: "사회" },
];

// 실제 화면처럼 고른 탭을 바깥 상태로 쥔다
function Harness({ onChange }: { onChange?: (code: string) => void }) {
  const [value, setValue] = useState("economy");
  return (
    <CategoryTabs
      label="분야"
      tabs={tabs}
      value={value}
      onValueChange={(code) => {
        onChange?.(code);
        setValue(code);
      }}
    >
      <p>{value} 내용</p>
    </CategoryTabs>
  );
}

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true");

test("고른 탭 하나만 aria-selected 이고 그 탭의 내용만 보인다", () => {
  renderWithProviders(<Harness />);

  const list = screen.getByRole("tablist", { name: "분야" });
  expect(within(list).getAllByRole("tab")).toHaveLength(3);
  expect(selectedTab()?.textContent).toContain("경제");
  expect(screen.getByRole("tabpanel").textContent).toBe("economy 내용");
});

test("탭을 누르면 그 분야로 바뀐다", () => {
  const onChange = vi.fn();
  renderWithProviders(<Harness onChange={onChange} />);

  fireEvent.click(screen.getByRole("tab", { name: "정치" }));

  expect(onChange).toHaveBeenCalledWith("politics");
  expect(selectedTab()?.textContent).toBe("정치");
  expect(screen.getByRole("tabpanel").textContent).toBe("politics 내용");
});

test("→ 키로 다음 탭을 고른다", () => {
  renderWithProviders(<Harness />);

  // SEED 는 탭에 포커스가 있을 때만 방향키를 받는다
  act(() => selectedTab()!.focus());
  fireEvent.keyDown(selectedTab()!, { key: "ArrowRight" });

  expect(selectedTab()?.textContent).toBe("정치");
  expect(document.activeElement).toBe(selectedTab());
});

test("관심 분야 탭은 이름에 「관심 분야」가 붙는다", () => {
  renderWithProviders(<Harness />);

  expect(screen.getByRole("tab", { name: "경제, 관심 분야" })).toBeDefined();
});

test("준비 중 분야는 탭이 아닌 버튼이고, 누르면 안내만 하고 고른 탭은 그대로다", async () => {
  const onChange = vi.fn();
  renderWithProviders(<Harness onChange={onChange} />);

  const sports = screen.getByRole("button", { name: "스포츠 준비 중" });
  expect(
    screen.getByRole("button", { name: "문화/연예 준비 중" }),
  ).toBeDefined();
  fireEvent.click(sports);

  expect(await screen.findByText("스포츠는 준비 중이에요")).toBeDefined();
  expect(onChange).not.toHaveBeenCalled();
  expect(selectedTab()?.textContent).toContain("경제");
});
