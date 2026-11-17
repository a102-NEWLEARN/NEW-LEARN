import { expect, test } from "vitest";
import { fetchMeaning, meaningQuery } from "@/api/dictionary";

// 가짜 A26 — 아는 말은 뜻 하나, 모르는 말은 세 칸이 null (docs/api-screen.md A26 모양)

test("뜻 하나를 사전 모양으로 받는다 — 표제어는 기본형", async () => {
  const result = await fetchMeaning({
    term: "이자를",
    around: "가계의 이자를 줄인다",
    contextType: "ARTICLE",
    contextId: 409,
  });

  expect(result).toEqual({
    query: "이자를",
    word: "이자",
    pos: "명사",
    definition: expect.any(String),
  });
});

test("풀이할 수 없는 말은 세 칸이 null 이다", async () => {
  await expect(
    fetchMeaning({
      term: "리했",
      around: "정리했다",
      contextType: "ARTICLE",
      contextId: 409,
    }),
  ).resolves.toEqual({
    query: "리했",
    word: null,
    pos: null,
    definition: null,
  });
});

test("같은 대상의 공백만 다른 말은 같은 키다", () => {
  const base = { around: "x", contextType: "ARTICLE" as const, contextId: 1 };
  expect(meaningQuery({ ...base, term: "금리 인상" }).queryKey).toEqual(
    meaningQuery({ ...base, term: "금리인상" }).queryKey,
  );
  expect(meaningQuery({ ...base, term: "금리" }).queryKey).not.toEqual(
    meaningQuery({ ...base, term: "금리", contextId: 2 }).queryKey,
  );
});
