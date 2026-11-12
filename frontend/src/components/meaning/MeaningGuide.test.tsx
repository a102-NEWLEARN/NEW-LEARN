import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MeaningGuide } from "@/components/meaning/MeaningGuide";

const GUIDE = "모르는 단어는 드래그하면 뜻을 알려줘요!";
const icon = () => screen.getByRole("button", { name: "용어사전 안내" });
const bubble = () => screen.queryByRole("note", { name: "용어사전 안내" });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

// F13 용어사전은 드래그해야 열려서 있는 줄 모르는 사람이 많다 — ! 아이콘 아래 안내를 처음부터 띄우고 X 로 닫는다.
// 닫으면 아이콘만 남고 누르면 다시 뜬다. 닫은 것은 이 브라우저에 기억한다 (2026-11-12 사용자 QA, Jira 197)
test("처음에는 ! 아이콘 아래 안내 말풍선이 떠 있다", () => {
  render(<MeaningGuide />);

  expect(bubble()!.textContent).toContain(GUIDE);
  expect(icon().getAttribute("aria-expanded")).toBe("true");
});

test("X 로 닫으면 말풍선만 사라지고 아이콘은 남는다 — 포커스는 아이콘으로", () => {
  render(<MeaningGuide />);

  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));

  expect(bubble()).toBeNull();
  expect(icon().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(icon());
});

test("한 번 닫으면 다른 화면 · 새로 고침에서도 아이콘만 보인다", () => {
  const { unmount } = render(<MeaningGuide />);
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  unmount();

  render(<MeaningGuide />);

  expect(bubble()).toBeNull();
  expect(icon()).toBeDefined();
});

test("닫은 뒤 아이콘을 누르면 다시 뜨고, 한 번 더 누르면 닫힌다", () => {
  localStorage.setItem("newlearn.meaningGuide.closed", "1");
  render(<MeaningGuide />);

  fireEvent.click(icon());
  expect(bubble()!.textContent).toContain(GUIDE);

  fireEvent.click(icon());
  expect(bubble()).toBeNull();
});

test("브라우저 저장소를 못 써도 화면은 그려지고 안내가 뜬다 — 닫기도 이 화면에서는 먹는다", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<MeaningGuide />);

  expect(bubble()).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  expect(bubble()).toBeNull();
});
