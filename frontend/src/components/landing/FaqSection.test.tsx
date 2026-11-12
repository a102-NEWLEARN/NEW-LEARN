import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FaqSection } from "@/components/landing/FaqSection";

// 자주 묻는 질문 — 프로토타입 v21 의 펼침 목록, 사실은 MVP 에 맞춘다

const questions = () =>
  screen.getAllByRole("button").map((button) => ({
    name: button.textContent,
    open: button.getAttribute("aria-expanded"),
  }));

test("질문 넷 가운데 첫 질문이 펼쳐져 있다", () => {
  render(<FaqSection />);

  expect(
    screen.getByRole("heading", { level: 2, name: "자주 묻는 질문" }),
  ).toBeDefined();
  expect(questions()).toEqual([
    { name: "어떤 기사를 볼 수 있나요?", open: "true" },
    { name: "AI는 기사를 어떻게 정리하나요?", open: "false" },
    { name: "같은 사건을 다룬 기사는 어떻게 묶이나요?", open: "false" },
    { name: "모르는 낱말은 어떻게 찾나요?", open: "false" },
  ]);
  expect(screen.getByText(/스포츠 · 문화\/연예는 준비 중이에요/)).toBeDefined();
});

test("다른 질문을 누르면 그 답이 펼쳐지고 앞의 답은 접힌다. 펼친 질문을 다시 누르면 접힌다", () => {
  render(<FaqSection />);

  fireEvent.click(
    screen.getByRole("button", { name: "AI는 기사를 어떻게 정리하나요?" }),
  );
  expect(questions().map((q) => q.open)).toEqual([
    "false",
    "true",
    "false",
    "false",
  ]);
  expect(
    screen.getByText(/핵심 내용 · 원인·배경 · 반응 · 전망 네 갈래/),
  ).toBeDefined();
  expect(screen.queryByText(/다섯 분야/)).toBeNull();

  fireEvent.click(
    screen.getByRole("button", { name: "AI는 기사를 어떻게 정리하나요?" }),
  );
  expect(questions().every((q) => q.open === "false")).toBe(true);
});

test("답은 MVP 에 있는 기능만 말한다 — UPDATE · 원문 근거 문장은 없다", () => {
  render(<FaqSection />);
  screen.getAllByRole("button").forEach((button) => {
    if (button.getAttribute("aria-expanded") === "false")
      fireEvent.click(button);
    expect(document.body.textContent).not.toMatch(/UPDATE|근거 문장/);
  });
});
