import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { BRANCHES } from "@/components/article/branches";

// 기사 마인드맵 보기의 배치 — 가운데 기사 제목, 네 방향 가지, 가지 바깥쪽 잎.
// 자리는 프로토타입 v21 buildMindmapGraph 의 목표 좌표다. 프로토타입은 force 로 그 자리를 찾아가지만
// 여기서는 바로 놓는다 — 열 때마다 같은 모양이다 (2026-10-30 사용자 결정). 그리는 일은 MindmapGraph 가 한다

/** 가운데 민트 원 · 그것을 감싼 흰 원 */
export const ROOT_RADIUS = 28;
export const ROOT_RING = 35;
export const BRANCH_RADIUS = 20;
export const LEAF_RADIUS = 9;
/** 잎 원과 잎 글 사이 · 가지 원과 가지 이름 사이 */
export const LEAF_TEXT_GAP = 9;
export const BRANCH_LABEL_GAP = 12;
/** 글자 크기와 줄 높이(px) — 가운데 제목 16 · 가지 이름 14 · 질문 12 · 잎 13 */
export const ROOT_FONT = 16;
export const ROOT_LINE = 22;
export const LEAF_FONT = 13;
export const LEAF_LINE = 18;
export const BRANCH_NAME_FONT = 14;
export const BRANCH_QUESTION_FONT = 12;

const BRANCH_X = 220;
const LEAF_DX = 230;
const LEAF_GAP = 58;
/** 한 줄 글자 수 · 줄 수 — 넘으면 마지막 줄 끝을 「…」로 줄인다. 전체 글은 화면이 aria-label · title 에 둔다 */
const ROOT_CHARS = 14;
const LEAF_CHARS = 14;
const MAX_LINES = 3;

export type PlacedLeaf = {
  key: string;
  text: string;
  lines: string[];
  x: number;
  y: number;
};

export type PlacedBranch = {
  type: BranchType;
  x: number;
  y: number;
  /** 가로 −1 왼쪽 · 1 오른쪽 — 잎과 잎 글이 이쪽으로 뻗는다 */
  side: -1 | 1;
  leaves: PlacedLeaf[];
};

export type MindmapLayout = {
  root: { lines: string[] };
  branches: PlacedBranch[];
};

export type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * 빈칸에서 줄을 바꾼다. 빈칸 없이 한 줄보다 긴 낱말은 글자 수에서 자른다.
 * 줄 수를 넘으면 마지막 줄 끝을 「…」로 줄인다
 */
export function wrapText(text: string, maxChars: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    let rest = word;
    while (rest) {
      const room = line ? maxChars - line.length - 1 : maxChars;
      if (rest.length <= room) {
        line = line ? `${line} ${rest}` : rest;
        rest = "";
      } else if (line) {
        lines.push(line);
        line = "";
      } else {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const last = lines[maxLines - 1];
  const cut =
    last.length < maxChars ? `${last}…` : `${last.slice(0, maxChars - 1)}…`;
  return [...lines.slice(0, maxLines - 1), cut];
}

/** 가지 높이 — 잎이 많을수록 가운데에서 멀어져 위 · 아래 가지의 잎이 겹치지 않는다 */
const branchHeight = (leafCount: number) =>
  Math.max(140, (leafCount - 1) * 29 + 72);

/** A9 가지 목록을 자리에 놓는다. 없는 가지는 그리지 않고, 나머지 가지는 제자리를 지킨다 */
export function layoutMindmap(
  title: string,
  branches: MindmapBranch[],
): MindmapLayout {
  return {
    root: { lines: wrapText(title, ROOT_CHARS, MAX_LINES) },
    branches: branches.map(({ type, items }) => {
      const { side, vertical } = BRANCHES[type];
      const x = side * BRANCH_X;
      const y = vertical * branchHeight(items.length);
      return {
        type,
        x,
        y,
        side,
        leaves: items.map(({ text }, j) => ({
          key: `${type}-${j}`,
          text,
          lines: wrapText(text, LEAF_CHARS, MAX_LINES),
          x: x + side * LEAF_DX,
          y: y + (j - (items.length - 1) / 2) * LEAF_GAP,
        })),
      };
    }),
  };
}

const longest = (lines: string[]) =>
  Math.max(0, ...lines.map((line) => line.length));

/** 가지 이름 두 줄(분류명 · 질문)의 폭. 한글 한 글자를 글자 크기만큼으로 어림한다 */
export const branchLabelWidth = (type: BranchType) =>
  Math.max(
    BRANCHES[type].name.length * BRANCH_NAME_FONT,
    BRANCHES[type].question.length * BRANCH_QUESTION_FONT,
  );

function union(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

function branchBoxes(branch: PlacedBranch): Box[] {
  const { x, y, side, type } = branch;
  // 가지 이름은 가운데 쪽에 둔다
  const labelEdge = x - side * (BRANCH_RADIUS + BRANCH_LABEL_GAP);
  const labelFar = labelEdge - side * branchLabelWidth(type);
  return [
    {
      x0: Math.min(x - BRANCH_RADIUS, labelFar),
      y0: y - BRANCH_RADIUS - 6,
      x1: Math.max(x + BRANCH_RADIUS, labelFar),
      y1: y + BRANCH_RADIUS + 6,
    },
    ...branch.leaves.map((leaf) => {
      const textStart = leaf.x + side * (LEAF_RADIUS + LEAF_TEXT_GAP);
      const textEnd = textStart + side * longest(leaf.lines) * LEAF_FONT;
      const half = Math.max(LEAF_RADIUS, (leaf.lines.length * LEAF_LINE) / 2);
      return {
        x0: Math.min(leaf.x - LEAF_RADIUS, textEnd),
        y0: leaf.y - half,
        x1: Math.max(leaf.x + LEAF_RADIUS, textEnd),
        y1: leaf.y + half,
      };
    }),
  ];
}

/**
 * 그린 것이 다 들어가는 상자 — 글자 폭까지 어림해 넣는다. 화면에 맞추기 · 가지 포커스가 쓴다.
 * 가지를 주면 그 가지와 잎만 넣는다
 */
export function boundsOf(layout: MindmapLayout, only?: BranchType): Box {
  if (only) {
    const branch = layout.branches.find((item) => item.type === only);
    if (branch) return union(branchBoxes(branch));
  }
  const titleHalf = (longest(layout.root.lines) * ROOT_FONT) / 2;
  const root: Box = {
    x0: -Math.max(ROOT_RING, titleHalf),
    y0: -ROOT_RING,
    x1: Math.max(ROOT_RING, titleHalf),
    y1: ROOT_RING + 8 + layout.root.lines.length * ROOT_LINE,
  };
  return union([root, ...layout.branches.flatMap(branchBoxes)]);
}
