import { describe, expect, test } from "vitest";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import {
  boundsOf,
  layoutMindmap,
  LEAF_RADIUS,
  wrapText,
} from "@/components/article/mindmapLayout";

const branch = (type: BranchType, ...texts: string[]): MindmapBranch => ({
  type,
  items: texts.map((text) => ({ text })),
});
const leaves = (count: number) =>
  Array.from({ length: count }, (_, i) => `잎 ${i + 1}`);

describe("layoutMindmap — 정해진 자리 (프로토타입 v21 buildMindmapGraph)", () => {
  test("가지는 핵심 오른쪽 위 · 원인 왼쪽 위 · 반응 오른쪽 아래 · 전망 왼쪽 아래", () => {
    const layout = layoutMindmap("제목", [
      branch("CORE", "가"),
      branch("CAUSE", "나"),
      branch("REACTION", "다"),
      branch("OUTLOOK", "라"),
    ]);

    expect(layout.branches.map(({ type, x, y }) => [type, x, y])).toEqual([
      ["CORE", 220, -140],
      ["CAUSE", -220, -140],
      ["REACTION", 220, 140],
      ["OUTLOOK", -220, 140],
    ]);
  });

  test("잎은 가지에서 바깥쪽으로 230, 가지 높이를 가운데로 58 간격", () => {
    const [core] = layoutMindmap("제목", [
      branch("CORE", ...leaves(3)),
    ]).branches;

    expect(core.leaves.map(({ x, y }) => [x, y])).toEqual([
      [450, -198],
      [450, -140],
      [450, -82],
    ]);
  });

  test("왼쪽 가지의 잎은 왼쪽으로 간다", () => {
    const [cause] = layoutMindmap("제목", [branch("CAUSE", "가")]).branches;

    expect([cause.leaves[0].x, cause.leaves[0].y]).toEqual([-450, -140]);
  });

  test("없는 가지는 그리지 않고, 나머지 가지는 제자리에 둔다", () => {
    const layout = layoutMindmap("제목", [
      branch("CORE", "가"),
      branch("OUTLOOK", "라"),
    ]);

    expect(layout.branches.map(({ type, x, y }) => [type, x, y])).toEqual([
      ["CORE", 220, -140],
      ["OUTLOOK", -220, 140],
    ]);
  });

  test("잎이 많으면 가지가 위아래로 멀어져 위 · 아래 가지의 잎이 겹치지 않는다", () => {
    const layout = layoutMindmap("제목", [
      branch("CORE", ...leaves(8)),
      branch("REACTION", ...leaves(8)),
    ]);
    const [core, reaction] = layout.branches;

    // 잎 8개면 가지 높이는 7 × 29 + 72 = 275
    expect([core.y, reaction.y]).toEqual([-275, 275]);
    const lowestCore = Math.max(...core.leaves.map((leaf) => leaf.y));
    const highestReaction = Math.min(...reaction.leaves.map((leaf) => leaf.y));
    expect(highestReaction - lowestCore).toBeGreaterThanOrEqual(58);
  });

  test("잎과 가운데 제목은 정해진 글자 수에서 줄을 바꾼다", () => {
    const layout = layoutMindmap(
      "한빛반도체 텍사스 공장 착공식 첫 해 생산 목표 발표",
      [branch("CORE", "한빛반도체가 10월 6일 텍사스 공장 착공식을 열었다")],
    );

    expect(layout.root.lines).toEqual([
      "한빛반도체 텍사스 공장",
      "착공식 첫 해 생산 목표",
      "발표",
    ]);
    expect(layout.branches[0].leaves[0].lines).toEqual([
      "한빛반도체가 10월 6일",
      "텍사스 공장 착공식을",
      "열었다",
    ]);
  });
});

describe("wrapText", () => {
  test("짧으면 한 줄", () => {
    expect(wrapText("짧은 문장", 16, 3)).toEqual(["짧은 문장"]);
  });

  test("빈칸에서 끊고, 빈칸 없이 긴 낱말은 글자 수에서 자른다", () => {
    expect(wrapText("가나다라마바사아자차카 타", 5, 3)).toEqual([
      "가나다라마",
      "바사아자차",
      "카 타",
    ]);
  });

  test("줄 수를 넘으면 마지막 줄 끝을 「…」로 줄인다", () => {
    expect(wrapText("하나 둘 셋 넷 다섯 여섯 일곱", 5, 2)).toEqual([
      "하나 둘",
      "셋 넷…",
    ]);
  });
});

describe("boundsOf — 화면에 맞추기 · 가지 포커스에 쓰는 경계 상자", () => {
  const layout = layoutMindmap("제목", [
    branch("CORE", "오른쪽으로 길게 늘어진 잎 글"),
    branch("CAUSE", "왼쪽 잎"),
  ]);
  const [core, cause] = layout.branches;

  test("잎 글이 바깥쪽으로 차지하는 폭까지 넣는다", () => {
    const box = boundsOf(layout);
    const coreLeaf = core.leaves[0];

    expect(box.x1).toBeGreaterThan(coreLeaf.x + LEAF_RADIUS + 9);
    expect(box.x0).toBeLessThan(cause.leaves[0].x - LEAF_RADIUS - 9);
  });

  test("가지 하나만 넣으면 다른 가지는 빠진다", () => {
    const box = boundsOf(layout, "CORE");

    expect(box.x0).toBeGreaterThan(0);
    expect(box.x1).toBe(boundsOf(layout).x1);
  });
});
