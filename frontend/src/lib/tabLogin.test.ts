import { afterEach, expect, test, vi } from "vitest";
import {
  answerOtherTabs,
  clearTabLogin,
  markTabLogin,
  tabMayKeepLogin,
} from "@/lib/tabLogin";

// 「이 탭에서 로그인했다」 표시 — 탭을 닫으면 로그아웃하려고 둔다 (2026-11-17 사용자)

const CHANNEL = "newlearn.tab-login";
const opened: BroadcastChannel[] = [];

// 로그인한 다른 탭 하나 — 물으면 답한다
function otherLoggedInTab() {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => {
    if (event.data === "ask") channel.postMessage("here");
  };
  opened.push(channel);
}

afterEach(() => {
  opened.splice(0).forEach((channel) => channel.close());
  vi.restoreAllMocks();
});

test("이 탭에서 로그인했으면 로그인을 이어 간다", async () => {
  markTabLogin();

  await expect(tabMayKeepLogin()).resolves.toBe(true);
});

test("표시가 없고 로그인한 다른 탭도 없으면 이어 가지 않는다 — 화면을 다 닫았다 다시 연 것이다", async () => {
  clearTabLogin();

  await expect(tabMayKeepLogin()).resolves.toBe(false);
});

test("표시가 없어도 로그인한 다른 탭이 답하면 표시를 넘겨받아 이어 간다 — 기사를 새 탭으로 연 것이다", async () => {
  clearTabLogin();
  otherLoggedInTab();

  await expect(tabMayKeepLogin()).resolves.toBe(true);
  expect(sessionStorage.getItem("newlearn.tab-login")).toBe("1");
});

test("로그인한 탭은 다른 탭이 물으면 답하고, 표시가 없는 탭은 답하지 않는다", async () => {
  answerOtherTabs();
  const asker = new BroadcastChannel(CHANNEL);
  opened.push(asker);
  const answers: unknown[] = [];
  asker.onmessage = (event) => answers.push(event.data);

  clearTabLogin();
  asker.postMessage("ask");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(answers).toEqual([]);

  markTabLogin();
  asker.postMessage("ask");
  await vi.waitFor(() => expect(answers).toEqual(["here"]));
});

test("저장소를 못 쓰는 브라우저면 지금처럼 로그인을 막지 않는다", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });

  await expect(tabMayKeepLogin()).resolves.toBe(true);
});
