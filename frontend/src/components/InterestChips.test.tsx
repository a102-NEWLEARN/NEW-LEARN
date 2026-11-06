import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { InterestChips } from "@/components/InterestChips";
import { renderWithProviders } from "@/test/render";

// 고른 값을 스스로 들고 있는 시험용 부모. 마지막 칩을 풀려고 하면 onKeepOne 을 부른다
function Harness({
  initial = [],
  error,
  onKeepOne = () => {},
}: {
  initial?: string[];
  error?: string;
  onKeepOne?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <InterestChips
        value={value}
        onValueChange={setValue}
        onKeepOne={onKeepOne}
        error={error}
      />
      <output aria-label="고른 분야">{value.join(",")}</output>
    </>
  );
}

const chip = (name: string) => screen.getByRole("button", { name });
// 스낵바도 status 라서 이름으로 고른다
const picked = () =>
  screen.getByRole("status", { name: "고른 분야" }).textContent;

test("A1 분야를 칩으로 두고 준비 중 분야를 끝에 붙인다", async () => {
  renderWithProviders(<Harness />);

  const group = screen.getByRole("group", { name: "관심 분야" });
  expect(group).toBeDefined();
  expect(screen.getByText("여러 개 고를 수 있어요")).toBeDefined();
  await screen.findByRole("button", { name: "정치" });
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual([
    "정치",
    "사회",
    "경제",
    "국제",
    "IT·과학",
    "스포츠 준비 중",
    "문화/연예 준비 중",
  ]);
  expect(chip("정치").getAttribute("aria-pressed")).toBe("false");
});

test("누르면 고르고 다시 누르면 푼다. 여러 개 고를 수 있다", async () => {
  renderWithProviders(<Harness />);
  await screen.findByRole("button", { name: "정치" });

  fireEvent.click(chip("경제"));
  fireEvent.click(chip("정치"));
  expect(chip("경제").getAttribute("aria-pressed")).toBe("true");
  expect(picked()).toBe("economy,politics");

  fireEvent.click(chip("경제"));
  expect(chip("경제").getAttribute("aria-pressed")).toBe("false");
  expect(picked()).toBe("politics");
});

test("마지막 남은 칩은 풀리지 않고 onKeepOne 을 부른다", async () => {
  const onKeepOne = vi.fn();
  renderWithProviders(<Harness initial={["economy"]} onKeepOne={onKeepOne} />);
  await screen.findByRole("button", { name: "경제" });

  fireEvent.click(chip("경제"));

  expect(chip("경제").getAttribute("aria-pressed")).toBe("true");
  expect(picked()).toBe("economy");
  expect(onKeepOne).toHaveBeenCalledOnce();
});

test("준비 중 분야는 고르지 않고 안내한다", async () => {
  renderWithProviders(<Harness />);
  const upcoming = await screen.findByRole("button", {
    name: "스포츠 준비 중",
  });

  expect(upcoming.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(upcoming);

  expect(await screen.findByText("스포츠는 준비 중이에요")).toBeDefined();
  expect(picked()).toBe("");
});

test("오류가 있으면 칩 묶음 아래에 띄우고 묶음 설명으로 잇는다", async () => {
  renderWithProviders(<Harness error="관심 분야를 1개 이상 골라 주세요." />);

  const group = screen.getByRole("group", { name: "관심 분야" });
  const message = screen.getByText("관심 분야를 1개 이상 골라 주세요.");
  expect(group.getAttribute("aria-describedby")).toBe(message.id);
});

test("바깥 제목을 받으면 제목 줄을 두지 않고 그 제목으로 묶음 이름을 짓는다", () => {
  renderWithProviders(
    <>
      <h2 id="outside">내 관심 분야</h2>
      <InterestChips
        value={[]}
        onValueChange={() => {}}
        onKeepOne={() => {}}
        labelledBy="outside"
      />
    </>,
  );

  expect(screen.getByRole("group", { name: "내 관심 분야" })).toBeDefined();
  expect(screen.queryByText("여러 개 고를 수 있어요")).toBeNull();
});

test("누르는 동안 칩이 살짝 줄어든다 — SEED 축소 값이라 동작 줄이기면 줄지 않는다", async () => {
  renderWithProviders(<Harness />);

  // EXPERIENCE 「호버 · 눌림」 — 칩은 축소, 색 전환과 같은 150ms
  const look = (
    await screen.findByRole("button", { name: "정치" })
  ).getAttribute("class");
  expect(look).toMatch(/active:\[scale:var\(--seed-scale-s97\)\]/);
  expect(look).toMatch(/transition-\[[^\]]*scale/);
});
