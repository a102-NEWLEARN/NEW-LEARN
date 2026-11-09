import { expect, test } from "vitest";
import { cardAt, rowAt } from "@/components/motion/appMotion";

// 프로토타입 v21 .grid > * · ul > li — 간격마다 늦게 나오다가 상한부터는 같이 나온다
test("카드는 45ms 간격이고 8번째(315ms)부터 같이 나온다", () => {
  expect([0, 1, 7, 8, 30].map((i) => cardAt(i).animationDelay)).toEqual([
    "0ms",
    "45ms",
    "315ms",
    "315ms",
    "315ms",
  ]);
});

test("목록 행은 30ms 간격이고 10번째(270ms)부터 같이 나온다", () => {
  expect([0, 1, 9, 10, 30].map((i) => rowAt(i).animationDelay)).toEqual([
    "0ms",
    "30ms",
    "270ms",
    "270ms",
    "270ms",
  ]);
});
