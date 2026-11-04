import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { StepProgress } from "./StepProgress";

test("몇 단계 중 몇 단계인지 진행 막대로 읽히고 그만큼 찬다", () => {
  render(<StepProgress step={2} total={4} label="가입 진행" />);

  const bar = screen.getByRole("progressbar", { name: "가입 진행" });
  expect(bar.getAttribute("aria-valuemin")).toBe("1");
  expect(bar.getAttribute("aria-valuemax")).toBe("4");
  expect(bar.getAttribute("aria-valuenow")).toBe("2");
  expect(bar.getAttribute("aria-valuetext")).toBe("4단계 중 2단계");
  expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%");
});
