import { expect, test } from "vitest";
import { uniqueById, uniqueCount } from "@/lib/uniqueById";

const item = (id: number, title = `기사 ${id}`) => ({ id, title });

test("겹치는 두 쪽을 이어 붙이면 같은 id 는 한 번씩만 남는다", () => {
  // 첫 쪽을 받은 뒤 앞에 새 기사가 들어와 다음 쪽이 밀린 모양 — 3 · 2 가 다시 온다
  const pages = [
    [item(5), item(4), item(3), item(2)],
    [item(3), item(2), item(1)],
  ];

  expect(
    uniqueById(pages)
      .flat()
      .map(({ id }) => id),
  ).toEqual([5, 4, 3, 2, 1]);
});

test("쪽 모양을 남긴다 — 뒤 쪽에는 앞에서 안 나온 것만 남는다", () => {
  expect(
    uniqueById([
      [item(5), item(4), item(3)],
      [item(4), item(3), item(2), item(1)],
      [item(1), item(0)],
    ]).map((page) => page.map(({ id }) => id)),
  ).toEqual([[5, 4, 3], [2, 1], [0]]);
});

test("처음 나온 것을 그대로 둔다 — 다시 온 것의 내용이 달라도 바꾸지 않는다", () => {
  const first = item(3, "처음 받은 제목");

  const [[kept], rest] = uniqueById([[first], [item(3, "다시 온 제목")]]);

  expect(kept).toBe(first);
  expect(rest).toEqual([]);
});

test("겹치지 않으면 그대로다", () => {
  const pages = [
    [item(4), item(3)],
    [item(2), item(1)],
  ];

  expect(uniqueById(pages)).toEqual(pages);
  expect(uniqueById([])).toEqual([]);
});

test("uniqueCount 는 받은 쪽들에서 서로 다른 id 의 수를 센다", () => {
  expect(
    uniqueCount({
      pages: [
        { items: [item(5), item(4), item(3)] },
        { items: [item(3), item(2)] },
      ],
    }),
  ).toBe(4);
  expect(uniqueCount(undefined)).toBe(0);
});
