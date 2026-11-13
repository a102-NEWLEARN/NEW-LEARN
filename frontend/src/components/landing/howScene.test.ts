import { expect, test } from "vitest";
import { howScene, STEP_TARGETS } from "@/components/landing/howScene";

// 스크롤 연출 ② — 진행도(0 ~ 1)에 따른 장면 (프로토타입 v21 LandingScreen 의 mp 계산)

test("처음에는 흩어진 기사 카드만 있고 0단계 문장이다", () => {
  const scene = howScene(0);

  expect(scene.step).toBe(0);
  expect(scene.gather).toBe(0);
  expect(scene.cardsFade).toBe(0);
  expect(scene.event).toBe(0);
  expect(scene.timeline).toBe(0);
  expect(scene.preview).toBe(0);
  expect(scene.track).toBe(0);
});

test("카드가 모이고(~0.2) 사라지며 사건 카드가 되고(0.24 ~) 타임라인이 차오른 뒤(0.46 ~) 미리보기가 나온다(0.72 ~)", () => {
  expect(howScene(0.2).gather).toBe(1);
  expect(howScene(0.21).event).toBe(0);
  expect(howScene(0.3).step).toBe(1);
  expect(howScene(0.3).event).toBeGreaterThan(0);
  expect(howScene(0.3).cardsFade).toBeCloseTo(1);
  expect(howScene(0.5).step).toBe(2);
  expect(howScene(0.5).timeline).toBeGreaterThan(0);
  expect(howScene(0.6).fill).toBeGreaterThan(0);
  expect(howScene(0.75).step).toBe(3);
  expect(howScene(0.75).preview).toBeGreaterThan(0);
  expect(howScene(0.75).view).toBe("flow");
  expect(howScene(0.9).view).toBe("map");
});

test("진행 막대는 0.24 에서 0.72 까지 차고, 끝에는 미리보기만 남는다", () => {
  expect(howScene(0.24).track).toBe(0);
  expect(howScene(0.48).track).toBeCloseTo(0.5);
  expect(howScene(0.72).track).toBe(1);
  const end = howScene(1);
  expect(end.preview).toBe(1);
  expect(end.step).toBe(3);
});

test("단계 번호를 누르면 그 단계가 한창인 자리로 간다", () => {
  expect(STEP_TARGETS.map((p) => howScene(p).step)).toEqual([1, 2, 3]);
});
