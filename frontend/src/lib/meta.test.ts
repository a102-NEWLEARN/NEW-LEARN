import { expect, test } from "vitest";
import { metaLine } from "@/lib/meta";

const NBSP = "\u00a0";

test("빈 항목을 빼고 「 · 」로 잇는다", () => {
  expect(metaLine(["사건 4", false, null, undefined, "", "기사 12"])).toBe(
    `사건${NBSP}4${NBSP}· 기사${NBSP}12`,
  );
});

test("항목 안 · 점 앞은 줄바꿈 없는 칸이라 점 뒤에서만 꺾인다", () => {
  const line = metaLine(["2026.08.04 ~ 10.09", "사건 8"]);
  expect(line.split(" ")).toEqual([
    `2026.08.04${NBSP}~${NBSP}10.09${NBSP}·`,
    `사건${NBSP}8`,
  ]);
});
