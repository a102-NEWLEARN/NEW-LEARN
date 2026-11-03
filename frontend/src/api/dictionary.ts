import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";

/** A19 용어사전 결과 한 칸 — 표제어마다 첫 뜻풀이 하나 (docs/api-screen.md A19) */
export type DictionaryItem = {
  /** 사전 표기 그대로. 띄어 써도 되는 자리에 `^` 가 남는다(「구원^투수」) */
  word: string;
  /** 품사(「명사」). 사전이 「품사 없음」으로 주는 구 표제어는 null */
  pos: string | null;
  definition: string;
};

export type DictionaryResult = {
  /** 서버가 다듬은 검색어 — 앞뒤 공백을 지우고 NFC */
  query: string;
  /** 사전 검색의 첫 쪽(표제어 10개까지). 없으면 빈 배열 */
  items: DictionaryItem[];
  /** 출처 「국립국어원 표준국어대사전」. 사전 글은 CC BY-SA 라 결과와 함께 꼭 보인다 */
  source: string;
};

/** A19 — 표준국어대사전에서 q 를 찾는다. 로그인 없이 부른다 */
export function fetchDictionary(q: string) {
  return api
    .get<DictionaryResult>("/dictionary", { params: { q } })
    .then((res) => res.data);
}

// 서버처럼 앞뒤 공백을 지우고 NFC 로 맞춰 키를 만든다 — 같은 말을 다시 찾으면 받아 둔 결과를 쓴다.
// 뜻풀이는 그사이 바뀌지 않아 낡았다고 보지 않는다. 다만 결과 없음은 바로 낡은 것으로 보고 다시 부른다 —
// 서버도 틀린 키의 빈 본문을 굳히지 않으려고 결과 없음은 저장하지 않는다(docs/api-screen.md A19).
// 실패는 저장되지 않고 다시 부르지도 않는다 — 사용자가 다시 보내면 된다
export const dictionaryQuery = (q: string) => {
  const word = q.trim().normalize("NFC");
  return queryOptions({
    queryKey: ["dictionary", word],
    queryFn: () => fetchDictionary(word),
    staleTime: (query) =>
      query.state.data && query.state.data.items.length > 0 ? Infinity : 0,
    retry: false,
  });
};
