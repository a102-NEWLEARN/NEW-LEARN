import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import { compactTerm } from "@/lib/compact";

/** A26 — 드래그한 글이 어느 화면의 것인가 (docs/api-screen.md A26) */
export type MeaningTarget = "ARTICLE" | "ISSUE" | "EVENT";

export type MeaningRequest = {
  /** 드래그한 말 */
  term: string;
  /** 고른 말의 앞뒤 30자씩을 붙인 화면 글 조각 */
  around: string;
  contextType: MeaningTarget;
  contextId: number;
};

/** A26 응답 — 사전처럼 뜻 하나. 뜻 단위가 아니거나 문맥으로도 모르면 세 칸이 null */
export type MeaningResult = {
  /** 서버가 다듬은 term */
  query: string;
  /** 표제어 — 조사 · 어미를 뗀 기본형(「이자를」 → 「이자」) */
  word: string | null;
  /** 품사(「명사」). 모르면 null */
  pos: string | null;
  /** 그 글의 문맥에 맞는 뜻풀이 한 문장(AI 생성) */
  definition: string | null;
};

/** A26 — 그 글의 문맥에 맞는 뜻 하나를 받는다. 로그인 · CSRF 번호표가 필요하다(번호표는 axios 가 붙인다) */
export function fetchMeaning(request: MeaningRequest, signal?: AbortSignal) {
  return api
    .post<MeaningResult>("/dictionary/meaning", request, { signal })
    .then((res) => res.data);
}

// 서버 저장 키와 같은 자리(대상 · 공백 뺀 말)로 받아 둔다 — 같은 말을 다시 누르면 부르지 않는다.
// 뜻풀이는 그사이 바뀌지 않아 낡았다고 보지 않는다. 실패는 다시 부르지 않는다 — 기다림이 길고 하루 한도를 쓴다
export const meaningQuery = (request: MeaningRequest) =>
  queryOptions({
    queryKey: [
      "meaning",
      request.contextType,
      request.contextId,
      compactTerm(request.term),
    ],
    queryFn: ({ signal }) => fetchMeaning(request, signal),
    staleTime: Infinity,
    retry: false,
  });
