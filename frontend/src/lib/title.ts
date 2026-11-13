// 제목 앞에 붙은 말머리 하나 — 「[속보]」 · 「[단독]」 · 「【속보】」
const HEAD_TAG = /^\s*(?:\[[^\]]*\]|【[^】]*】)\s*/;

/**
 * 제목 앞의 말머리를 뺀다. 여러 개가 붙어 있으면 다 빼고, 말머리만 있는 제목은 그대로 둔다.
 * 마인드맵 가운데 원(14자 3줄)에서 말머리가 자리를 먹지 않게 쓴다. 기사 머리 h1 은 원래 제목 그대로다
 * (2026-11-12 사용자 QA, Jira 197)
 */
export function withoutHeadTag(title: string) {
  let rest = title;
  while (HEAD_TAG.test(rest)) rest = rest.replace(HEAD_TAG, "");
  return rest.trim() === "" ? title : rest;
}
