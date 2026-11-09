/**
 * 공백(줄 바꿈 · NBSP · 전각 공백 · BOM)을 모두 뺀 NFC — 서버(MeaningService)가 고른 말을 비교하고 저장 키를 만드는 모양과 같다.
 * 「금리 인상」과 마인드맵 보기가 줄을 나누며 공백을 버린 「금리인상」이 같은 말이 된다 (docs/api-screen.md A26)
 */
export const compactTerm = (term: string) =>
  term.normalize("NFC").replace(/[\s\p{Z}\u{FEFF}]/gu, "");
