import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HeadlineMarquee } from "@/components/landing/HeadlineMarquee";
import { HEADLINES } from "@/components/landing/landingSample";
import { expectMotionSafe } from "@/test/motion";

// 「같은 사건, 다른 제목」 — 기사 제목 띠 두 줄 (프로토타입 v21)

test("섹션 제목을 두고, 기사 제목 띠는 장식이라 화면 읽기에서 뺀다", () => {
  render(<HeadlineMarquee />);

  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "기사 한 편만으로는 사건의 전체 전개를 알기 어려워요.",
    }),
  ).toBeDefined();
  const rows = [...document.querySelectorAll("[data-marquee]")];
  expect(rows).toHaveLength(2);
  rows.forEach((row) => expect(row.closest("[aria-hidden]")).not.toBeNull());
});

test("두 줄이 제목을 반씩 나눠 끊김 없이 돈다 — 한 줄은 거꾸로, 더 느리게", () => {
  render(<HeadlineMarquee />);
  const [first, second] = [
    ...document.querySelectorAll<HTMLElement>("[data-marquee]"),
  ];

  // 끊김 없이 돌게 같은 제목을 두 번 잇는다
  const half = Math.ceil(HEADLINES.length / 2);
  expect(first.children).toHaveLength(half * 2);
  expect(second.children).toHaveLength((HEADLINES.length - half) * 2);
  expect(first.textContent).toContain(HEADLINES[0].title);
  expect(second.textContent).toContain(HEADLINES[half].title);

  expect(first.className).toMatch(/newlearn-marquee_70s_linear_infinite/);
  expect(second.className).toMatch(
    /newlearn-marquee_80s_linear_infinite_reverse/,
  );
  expectMotionSafe();
});
