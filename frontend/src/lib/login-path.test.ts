import { expect, test } from "vitest";
import { loginPath, nextPath, signupPath } from "@/lib/login-path";

test("로그인 화면 주소에 돌아올 곳을 넣는다 — / 는 읽기 좋게 그대로 둔다", () => {
  expect(loginPath("/home")).toBe("/login?next=/home");
  expect(loginPath("/issues/12?event=3&view=map")).toBe(
    "/login?next=/issues/12%3Fevent%3D3%26view%3Dmap",
  );
});

test("가입 화면 주소에도 돌아올 곳을 넣는다", () => {
  expect(signupPath("/issues/12?event=3")).toBe(
    "/signup?next=/issues/12%3Fevent%3D3",
  );
});

test("돌아올 곳은 이 사이트 안의 주소 그대로다", () => {
  expect(nextPath("/home")).toBe("/home");
  expect(nextPath("/issues/12?event=3#map")).toBe("/issues/12?event=3#map");
});

test.each([
  ["없음", null],
  ["빈 값", ""],
  ["다른 사이트", "https://evil.example"],
  ["// 로 시작하는 다른 사이트", "//evil.example"],
  ["\\ 로 바뀌는 다른 사이트", "/\\evil.example"],
  ["로그인 화면 자신", "/login?next=/home"],
  ["가입 화면", "/signup?next=/home"],
])("돌아올 곳이 %s 이면 홈으로 간다", (_, raw) => {
  expect(nextPath(raw)).toBe("/home");
});
