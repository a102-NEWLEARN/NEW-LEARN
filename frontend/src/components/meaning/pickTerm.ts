// 드래그한 글에서 뜻을 찾을 말을 고른다 — F13 용어사전 말풍선 (docs/api-screen.md A26, Jira 187).
// 말풍선을 띄울지 여기 하나가 정한다. 띄우지 않을 것은 null 이다. 띄운 뒤 「의미」를 눌러야 GMS 를 부른다.
// 규칙으로 못 막는 말 조각(「리했」)이나 문맥에 근거가 없는 말은 서버의 모델이 「풀이 불가」로 답한다

/** 고른 말과, 모델 · 서버가 어느 자리의 말인지 알 수 있게 앞뒤 30자씩을 붙인 조각 */
export type Picked = { term: string; around: string };

// 서버(MeaningService)와 같은 공백 — 줄 바꿈 · NBSP · 전각 공백 · BOM (lib/compact.ts 와 같은 모음)
const SPACES = /[\s\p{Z}\u{FEFF}]+/u;
const EDGE = /[\s\p{Z}\u{FEFF}\p{P}]/u;
const LETTER = /\p{L}/u;
const HANGUL = /[가-힣]/u;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
// 문장이 끝나고 다음 문장이 이어진다 — 「…했다. 그리고」
const SENTENCE_BREAK = /[.!?。][\s\p{Z}]/u;

const MAX_LENGTH = 50;
const MAX_WORDS = 6;
const AROUND = 30;

/**
 * @param text 드래그 대상 글 전체(요소의 textContent)
 * @param start · end 고른 자리(text 의 글자 칸)
 * @param cut 화면에서 끝을 「…」로 줄인 글인가 — 마지막 글자가 줄임표다
 */
export function pickTerm(
  text: string,
  start: number,
  end: number,
  cut = false,
): Picked | null {
  const visible = cut && text.endsWith("…") ? text.length - 1 : text.length;
  // 줄임표에 닿은 낱말은 화면에서 잘린 것이다
  if (cut && end >= visible) return null;
  let from = Math.max(0, start);
  let to = Math.min(end, visible);
  while (from < to && EDGE.test(text[from])) from++;
  while (to > from && EDGE.test(text[to - 1])) to--;
  const term = text.slice(from, to);
  if (term === "" || !LETTER.test(term)) return null;
  if ([...term].length > MAX_LENGTH) return null;
  if (/[\r\n]/.test(term) || SENTENCE_BREAK.test(term)) return null;
  if (term.split(SPACES).length > MAX_WORDS) return null;
  const before = text[from - 1] ?? "";
  const after = text[to] ?? "";
  // 앞 글자에 붙은 한글 한 글자 — 「받은」의 「은」. 어절 맨 앞 한 글자(「빚을」의 「빚」)는 낱말일 수 있어 띄운다
  if ([...term].length === 1 && HANGUL.test(term) && LETTER.test(before))
    return null;
  // 영문 · 숫자 낱말의 중간을 잘랐다 — 「F13」의 「F1」
  if (LATIN_OR_DIGIT.test(before) && LATIN_OR_DIGIT.test(term[0])) return null;
  if (LATIN_OR_DIGIT.test(after) && LATIN_OR_DIGIT.test(term[term.length - 1]))
    return null;
  const around = text.slice(
    Math.max(0, from - AROUND),
    Math.min(visible, to + AROUND),
  );
  return { term, around };
}
