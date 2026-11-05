const NBSP = " ";

/**
 * 「2026.08.04 ~ 10.09 · 사건 8 · 기사 31」 같은 개수 · 날짜 줄. 빈 항목은 뺀다.
 * 항목 안과 점 앞은 줄바꿈 없는 칸이라 좁은 화면에서도 점 뒤에서만 꺾인다 —
 * 「기사 / 12」처럼 숫자만 넘어가거나 줄이 「·」로 시작하지 않는다 (DESIGN.md Typography, 2026-11-05 UI 점검)
 */
export function metaLine(parts: (string | false | null | undefined)[]) {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replaceAll(" ", NBSP))
    .join(`${NBSP}· `);
}
