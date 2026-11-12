import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  SAMPLE_ARTICLE,
  SAMPLE_EVENT,
  SAMPLE_ISSUE,
} from "@/components/landing/landingSample";
import { TrustSection } from "@/components/landing/TrustSection";

// 근거와 신뢰 — 프로토타입 v21 의 네 칸. UPDATE 칸(F10)은 사건마다 관련 기사(F08)로 바꿨다

test("네 칸이 01 ~ 04 차례로 놓이고 70ms 씩 늦게 떠오른다", () => {
  render(<TrustSection />);

  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "요약보다 근거를 먼저, 판단은 읽는 사람에게.",
    }),
  ).toBeDefined();
  const items = screen.getAllByRole("heading", { level: 3 });
  expect(items.map((h) => h.textContent)).toEqual([
    "01원문으로 바로",
    "02사건마다 관련 기사",
    "03AI가 쓴 건 AI 생성",
    "04모르는 말은 드래그해서",
  ]);
  const delays = items.map(
    (h) => (h.closest("[data-shown]") as HTMLElement).style.transitionDelay,
  );
  expect(delays).toEqual(["", "70ms", "140ms", "210ms"]);
});

test("칸마다 예시를 운영 데이터로 보인다", () => {
  render(<TrustSection />);
  const item = (n: number) =>
    within(
      screen.getAllByRole("heading", { level: 3 })[n].closest("[data-shown]")!
        .parentElement!,
    );

  expect(item(0).getByText(SAMPLE_ARTICLE.title)).toBeDefined();
  expect(item(0).getByText("언론사 원문 보기")).toBeDefined();
  expect(item(1).getByText(SAMPLE_EVENT.title)).toBeDefined();
  expect(
    item(1).getByText(`기사 ${SAMPLE_EVENT.articleCount}건`),
  ).toBeDefined();
  expect(item(2).getByText("AI 생성")).toBeDefined();
  // 01 칸 기사 제목(「8조원대」)과 금액이 어긋나지 않게, 금액이 없는 이슈 요약을 쓴다
  expect(item(2).getByText(SAMPLE_ISSUE.summary)).toBeDefined();
  // 고른 말 · 말풍선 표제어
  expect(item(3).getAllByText("탈취")).toHaveLength(2);
  expect(item(3).getByText("의미")).toBeDefined();
});
