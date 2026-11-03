import { expect, test } from "vitest";
import { dictionaryQuery, fetchDictionary } from "@/api/dictionary";

// 가짜 A19 — 금리 · 사과 · 구원^투수만 안다. 그 밖의 말은 빈 결과다 (docs/api-screen.md A19 모양)

test("표제어마다 첫 뜻풀이 하나와 출처를 받는다", async () => {
  const result = await fetchDictionary("사과");

  expect(result.query).toBe("사과");
  expect(result.items).toHaveLength(4);
  expect(result.items[2]).toEqual({
    word: "사과",
    pos: "명사",
    definition: "사과나무의 열매.",
  });
  expect(result.source).toBe("국립국어원 표준국어대사전");
});

test("품사가 없는 표제어는 pos 가 null 이고, 표제어의 ^ 는 그대로 온다", async () => {
  const result = await fetchDictionary("구원투수");

  expect(result.items).toEqual([
    {
      word: "구원^투수",
      pos: null,
      definition: "앞서 던지던 투수가 위기에 몰렸을 때 대신 나와 던지는 투수.",
    },
  ]);
});

test("서버가 다듬은 검색어를 query 로 돌려준다", async () => {
  const result = await fetchDictionary("  금리 ");

  expect(result.query).toBe("금리");
  expect(result.items.map((item) => item.word)).toEqual(["금리"]);
});

test("모르는 말이면 items 가 빈다", async () => {
  await expect(fetchDictionary("없는말")).resolves.toEqual({
    query: "없는말",
    items: [],
    source: "국립국어원 표준국어대사전",
  });
});

test("앞뒤 공백 · 유니코드 조합만 다른 말은 같은 결과로 친다", () => {
  // 「금」을 첫소리 · 가운뎃소리 · 끝소리로 나눠 쓴 것(NFD)
  const decomposed = "금리".normalize("NFD");

  expect(dictionaryQuery(` ${decomposed} `).queryKey).toEqual(
    dictionaryQuery("금리").queryKey,
  );
});
