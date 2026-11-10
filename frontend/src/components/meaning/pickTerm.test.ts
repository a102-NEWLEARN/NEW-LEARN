import { describe, expect, test } from "vitest";
import { pickTerm } from "@/components/meaning/pickTerm";
import { compactTerm } from "@/lib/compact";

// 드래그 규칙 표 (docs/plans/2026-11-09-dictionary-meaning-bubble.md 「드래그 규칙」) — 표의 줄마다 하나
const pick = (text: string, selected: string, cut = false, nth = 0) => {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(selected, at + 1);
  if (at < 0) throw new Error(`글에 없다: ${selected}`);
  return pickTerm(text, at, at + selected.length, cut);
};

const SENTENCE = "계획은 이 답을 받은 뒤 씁니다. 정리했습니다.";

describe("띄우지 않는다", () => {
  test.each([
    ["띄어쓰기만", SENTENCE, " "],
    ["문장부호만", SENTENCE, "."],
    ["숫자만", "금리를 2026년에 3.5% 로 올렸다", "3.5%"],
    ["앞 글자에 붙은 한 글자 — 받은 의 은", SENTENCE, "은 "],
    ["어미 한 글자 — 했습니다 의 다", SENTENCE, "다"],
    ["영문 · 숫자 낱말의 중간 — F13 의 F1", "F13 과제를 마쳤다", "F1"],
    ["영문 낱말의 중간 — Apple 의 ppl", "Apple 실적", "ppl"],
    ["50자 넘음", "가".repeat(60), "가".repeat(51)],
    ["6어절 넘음", "가 나 다 라 마 바 사 아", "가 나 다 라 마 바 사"],
    ["문장 경계를 넘음", SENTENCE, "씁니다. 정리"],
    ["줄바꿈", "기준금리\n동결", "기준금리\n동결"],
  ])("%s", (_, text, selected) => {
    expect(pick(text, selected)).toBeNull();
  });

  test("줄임표에 닿은 낱말 — 화면에서 잘렸다", () => {
    expect(
      pick("한국은행이 기준금리를 동결하며 이자…", "이자", true),
    ).toBeNull();
  });
});

describe("띄운다", () => {
  test("앞뒤에 딸린 공백 · 문장부호를 잘라 낸다", () => {
    expect(pick("기준 금리, 동결", " 금리, ")?.term).toBe("금리");
  });

  test("어절 맨 앞 한 글자 — 빚을 의 빚", () => {
    expect(pick("가계 빚을 줄인다", "빚")?.term).toBe("빚");
  });

  test("조사가 붙은 어절 그대로 — 표제어는 서버의 모델이 정리한다", () => {
    expect(pick("가계 이자를 낮춘다", "이자를")?.term).toBe("이자를");
  });

  test.each(["F13", "GDP", "F-35"])("영문 낱말 통째 — %s", (word) => {
    expect(pick(`${word} 사업이 늦어졌다`, word)?.term).toBe(word);
  });

  test("말 조각 — 규칙으로는 못 막아 서버가 풀이 불가로 답한다", () => {
    expect(pick(SENTENCE.replace("씁니다", "정리했다"), "리했")?.term).toBe(
      "리했",
    );
  });

  test("한 글자라도 앞이 글자가 아니면 띄운다 — 금·은 의 은", () => {
    expect(pick("금·은 값이 올랐다", "은")?.term).toBe("은");
  });

  test("조각은 앞뒤 30자씩이고 줄임표는 넣지 않는다", () => {
    const text = `${"가".repeat(40)}이자${"나".repeat(40)}…`;
    expect(pick(text, "이자", true)?.around).toBe(
      `${"가".repeat(30)}이자${"나".repeat(30)}`,
    );
    const short = "가계 대출 이자 부담이 커졌다…";
    expect(pick(short, "이자", true)?.around).toBe(
      "가계 대출 이자 부담이 커졌다",
    );
  });
});

test("저장 키 — 공백을 뺀 NFC 라 공백 · 유니코드 조합만 다른 말은 같다", () => {
  expect(compactTerm("금리 인상")).toBe("금리인상");
  expect(compactTerm("금리 인상".normalize("NFD"))).toBe("금리인상");
});
