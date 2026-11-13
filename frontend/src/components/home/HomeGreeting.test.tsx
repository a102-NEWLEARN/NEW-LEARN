import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Member } from "@/api/members";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { stubReducedMotion } from "@/test/media";
import { expectMotionSafe } from "@/test/motion";

const MEMBER: Member = {
  id: 1,
  loginId: "newlearn01",
  name: "김뉴런",
  categories: [{ code: "economy", name: "경제" }],
};
const LINE = "김뉴런님, 좋은 아침이에요 · 10월 23일 금요일";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T09:00:00+09:00"));
});
afterEach(() => vi.useRealTimers());

// 찍히는 글 — 화면 읽기에서 뺀 쪽
const typed = () =>
  document.querySelector<HTMLElement>("[data-typing]")?.textContent ?? null;
const caret = () => document.querySelector("[data-caret]");

test("인사 줄은 한 글자에 30ms 로 찍히고, 그동안에도 화면 읽기에는 전체 문장을 준다", () => {
  render(<HomeGreeting member={MEMBER} pending={false} />);

  expect(typed()).toBe("");
  expect(screen.getByText(LINE)).toBeDefined();

  act(() => vi.advanceTimersByTime(30 * 5));
  expect(typed()).toBe("김뉴런님,");
  expect(screen.getByText(LINE)).toBeDefined();
  expect(caret()).not.toBeNull();
  expectMotionSafe();
});

test("다 찍으면 문장만 남고, 커서는 잠깐 깜빡인 뒤 사라진다", () => {
  render(<HomeGreeting member={MEMBER} pending={false} />);

  act(() => vi.advanceTimersByTime(30 * [...LINE].length));
  expect(typed()).toBeNull();
  expect(screen.getByText(LINE)).toBeDefined();
  expect(caret()).not.toBeNull();

  act(() => vi.advanceTimersByTime(1000));
  expect(caret()).toBeNull();
});

test("동작 줄이기를 켜면 처음부터 전체 문장이고 커서가 없다", () => {
  stubReducedMotion();
  render(<HomeGreeting member={MEMBER} pending={false} />);

  expect(screen.getByText(LINE)).toBeDefined();
  expect(typed()).toBeNull();
  expect(caret()).toBeNull();
});
