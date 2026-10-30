import type { BranchType } from "@/api/mindmap";

/** 가지 하나의 이름 · 자리 · 색 */
export type BranchInfo = {
  /** 마인드맵 보기 이름 (docs/api-screen.md 3절) */
  name: string;
  /** 흐름지도 보기 이름. 마인드맵 보기에서는 이름 아래 작은 글자로 함께 둔다 (프로토타입 v21 MM4) */
  question: string;
  /** 가운데에서 어느 쪽으로 — 가로 −1 왼쪽 · 1 오른쪽, 세로 −1 위 · 1 아래 */
  side: -1 | 1;
  vertical: -1 | 1;
  /** 색 클래스 — Tailwind 가 찾을 수 있게 글자 그대로 적는다 (DESIGN.md Colors 「기사 마인드맵 가지 4색」) */
  tone: {
    /** 가지 원 채움 · 고른 잎 채움 */
    fill: string;
    /** 가지 · 잎 원 테두리 */
    stroke: string;
    /** 이어 주는 선 */
    line: string;
    /** 가지 이름 글자 */
    text: string;
    /** 범례 칩 — 켜진 칩의 바탕 · 테두리 · 글자 */
    chip: string;
  };
};

// 가지 순서 — A9 가 보내는 순서와 같다 (docs/api-screen.md 3절)
export const BRANCH_ORDER: BranchType[] = [
  "CORE",
  "CAUSE",
  "REACTION",
  "OUTLOOK",
];

// 자리는 프로토타입 v21 buildMindmapGraph — 핵심 오른쪽 위 · 원인 왼쪽 위 · 반응 오른쪽 아래 · 전망 왼쪽 아래
export const BRANCHES: Record<BranchType, BranchInfo> = {
  CORE: {
    name: "핵심 내용",
    question: "무슨 일이?",
    side: 1,
    vertical: -1,
    tone: {
      fill: "fill-mindmap-core-fill",
      stroke: "stroke-mindmap-core-stroke",
      line: "stroke-mindmap-core-line",
      text: "fill-mindmap-core-text",
      chip: "bg-mindmap-core-fill border-mindmap-core-stroke text-mindmap-core-text",
    },
  },
  CAUSE: {
    name: "원인·배경",
    question: "왜 일어났나?",
    side: -1,
    vertical: -1,
    tone: {
      fill: "fill-mindmap-cause-fill",
      stroke: "stroke-mindmap-cause-stroke",
      line: "stroke-mindmap-cause-line",
      text: "fill-mindmap-cause-text",
      chip: "bg-mindmap-cause-fill border-mindmap-cause-stroke text-mindmap-cause-text",
    },
  },
  REACTION: {
    name: "반응",
    question: "누가 뭐라고 했나?",
    side: 1,
    vertical: 1,
    tone: {
      fill: "fill-mindmap-reaction-fill",
      stroke: "stroke-mindmap-reaction-stroke",
      line: "stroke-mindmap-reaction-line",
      text: "fill-mindmap-reaction-text",
      chip: "bg-mindmap-reaction-fill border-mindmap-reaction-stroke text-mindmap-reaction-text",
    },
  },
  OUTLOOK: {
    name: "전망",
    question: "앞으로는?",
    side: -1,
    vertical: 1,
    tone: {
      fill: "fill-mindmap-outlook-fill",
      stroke: "stroke-mindmap-outlook-stroke",
      line: "stroke-mindmap-outlook-line",
      text: "fill-mindmap-outlook-text",
      chip: "bg-mindmap-outlook-fill border-mindmap-outlook-stroke text-mindmap-outlook-text",
    },
  },
};
