import { expect, test } from "vitest";
import { fetchMindmap, type BranchType } from "@/api/mindmap";

// 가짜 API 가 docs/api-screen.md A9 · 3절 대로 답하는지 — 기사 마인드맵 화면이 이 응답에 기댄다

const ORDER: BranchType[] = ["CORE", "CAUSE", "REACTION", "OUTLOOK"];

test("마인드맵을 받는다 — 가운데 글자는 기사 제목, AI 생성 표시", async () => {
  const mindmap = await fetchMindmap(11901);

  expect(mindmap).toMatchObject({
    articleId: 11901,
    schemaVersion: "mindmap-v1",
    aiGenerated: true,
    title: "한빛반도체 텍사스 공장 착공식",
  });
  expect(mindmap.branches.map((branch) => branch.type)).toEqual(ORDER);
});

test("가지는 표 순서대로 한 번씩, 내용 있는 가지만 오고 잎은 한 개 이상이다", async () => {
  const mindmaps = await Promise.all(
    [11901, 11902, 11903, 401, 402, 403].map(fetchMindmap),
  );

  for (const { branches } of mindmaps) {
    const types = branches.map((branch) => branch.type);
    expect(types).toEqual(ORDER.filter((type) => types.includes(type)));
    expect(branches.every((branch) => branch.items.length > 0)).toBe(true);
  }
  // 가지 넷이 다 오지 않는 기사도 있다
  expect(mindmaps.some(({ branches }) => branches.length < 4)).toBe(true);
});

test("분석 중인 기사는 404 MINDMAP_NOT_FOUND 다", async () => {
  // 119번 사건의 마지막 기사는 마인드맵 분석 중(QUEUED)이다
  await expect(fetchMindmap(11905)).rejects.toMatchObject({
    status: 404,
    code: "MINDMAP_NOT_FOUND",
  });
});

test("없는 기사는 404 ARTICLE_NOT_FOUND 다", async () => {
  await expect(fetchMindmap(999)).rejects.toMatchObject({
    status: 404,
    code: "ARTICLE_NOT_FOUND",
  });
});

// 마인드맵 · 용어사전 시연용 — 어려운 경제 용어가 많은 기사 409 (Jira 166)
test("어려운 기사 409 는 가지 넷 모두 잎이 두 개 이상이다", async () => {
  const mindmap = await fetchMindmap(409);

  expect(mindmap.branches.map((branch) => branch.type)).toEqual(ORDER);
  expect(mindmap.branches.every((branch) => branch.items.length >= 2)).toBe(
    true,
  );
  expect(JSON.stringify(mindmap.branches)).toContain("양적긴축");
});
