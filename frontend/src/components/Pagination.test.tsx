import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Pagination, pageItems } from "@/components/Pagination";

// 쪽은 0 부터 센다. 화면 글자는 1 부터다
test.each([
  [0, 1, [0]],
  [0, 5, [0, 1, 2, 3, 4]],
  [3, 7, [0, 1, 2, 3, 4, 5, 6]],
  [0, 20, [0, 1, 2, 3, 4, "gap", 19]],
  [3, 20, [0, 1, 2, 3, 4, "gap", 19]],
  [9, 20, [0, "gap", 8, 9, 10, "gap", 19]],
  [16, 20, [0, "gap", 15, 16, 17, 18, 19]],
  [19, 20, [0, "gap", 15, 16, 17, 18, 19]],
])(
  "pageItems(%i, %i) — 처음 · 끝 · 지금 쪽 앞뒤만 두고 나머지는 … 로 줄인다",
  (page, total, expected) => {
    expect(pageItems(page, total)).toEqual(expected);
  },
);

test("쪽 번호 · 이전 · 다음을 두고, 지금 쪽은 aria-current 다. 누르면 그 쪽(0 부터)을 알린다", () => {
  const onChange = vi.fn();
  render(
    <Pagination label="이슈 쪽" page={9} totalPages={20} onChange={onChange} />,
  );

  const nav = screen.getByRole("navigation", { name: "이슈 쪽" });
  const buttons = within(nav).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "",
    "1",
    "9",
    "10",
    "11",
    "20",
    "",
  ]);
  expect(within(nav).getAllByText("…")).toHaveLength(2);
  expect(
    within(nav)
      .getByRole("button", { name: "10쪽" })
      .getAttribute("aria-current"),
  ).toBe("page");

  fireEvent.click(within(nav).getByRole("button", { name: "20쪽" }));
  fireEvent.click(within(nav).getByRole("button", { name: "이전 쪽" }));
  fireEvent.click(within(nav).getByRole("button", { name: "다음 쪽" }));
  expect(onChange.mock.calls).toEqual([[19], [8], [10]]);
});

test("지금 쪽을 다시 누르면 알리지 않고, 첫 쪽 · 마지막 쪽에서는 이전 · 다음이 꺼진다", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <Pagination label="쪽" page={0} totalPages={3} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "1쪽" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "이전 쪽" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);

  rerender(
    <Pagination label="쪽" page={2} totalPages={3} onChange={onChange} />,
  );
  expect(
    (screen.getByRole("button", { name: "다음 쪽" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("한 쪽뿐이면 그리지 않는다", () => {
  render(<Pagination label="쪽" page={0} totalPages={1} onChange={vi.fn()} />);
  expect(screen.queryByRole("navigation")).toBeNull();
});
