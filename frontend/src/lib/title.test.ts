import { expect, test } from "vitest";
import { withoutHeadTag } from "@/lib/title";

// 마인드맵 가운데 원은 14자 3줄이라 「[속보]」 같은 말머리가 자리를 먹는다 — 앞에 붙은 것만 뺀다 (2026-11-12 사용자 QA, Jira 197)
test("제목 앞의 [ ] · 【 】 말머리를 뺀다 — 여러 개가 붙어 있어도 다 뺀다", () => {
  expect(
    withoutHeadTag('[속보] 임광현 "긴급 소방 재원 미래기금 활용…국회와 협의"'),
  ).toBe('임광현 "긴급 소방 재원 미래기금 활용…국회와 협의"');
  expect(withoutHeadTag("[단독][종합] 한은, 양적긴축 속도 조절")).toBe(
    "한은, 양적긴축 속도 조절",
  );
  expect(withoutHeadTag("【속보】 한은 기준금리 동결")).toBe(
    "한은 기준금리 동결",
  );
});

test("가운데 · 끝의 괄호와 말머리 없는 제목은 그대로 둔다", () => {
  expect(withoutHeadTag("삼성 [단독] 인터뷰")).toBe("삼성 [단독] 인터뷰");
  expect(withoutHeadTag("한빛반도체 텍사스 공장 착공")).toBe(
    "한빛반도체 텍사스 공장 착공",
  );
});

test("말머리만 있는 제목은 비우지 않고 그대로 둔다", () => {
  expect(withoutHeadTag("[속보]")).toBe("[속보]");
});
