import { expect, test } from "vitest";
import { guestPath, loginPath, nextPath, signupPath } from "@/lib/login-path";

// 로그인 화면의 *로그인 없이 시작하기* — 회원 화면에서 왔으면 다시 로그인 화면으로 돌아오지 않게 홈으로 (Jira 205)
test("로그인 없이 시작하면 돌아올 곳으로 가되, 회원 화면이면 홈으로 간다", () => {
  expect(guestPath("/issues/12?event=3")).toBe("/issues/12?event=3");
  expect(guestPath("/articles/11901?view=map")).toBe(
    "/articles/11901?view=map",
  );
  expect(guestPath(null)).toBe("/home");
  expect(guestPath("/bookmarks")).toBe("/home");
  expect(guestPath("/me")).toBe("/home");
  // 라우터는 대소문자 · 끝 / 를 가리지 않고 회원 화면으로 맞춘다
  expect(guestPath("/ME/")).toBe("/home");
  expect(guestPath("/bookmarks/?x=1")).toBe("/home");
  expect(guestPath("//evil.example")).toBe("/home");
});

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
  // 점 구간을 정리하면 // 로 시작한다 — <Link> 는 그대로 바깥 주소로 그린다 (리뷰, Jira 205)
  ["점 구간을 지나 // 가 되는 다른 사이트", "/.//evil.example"],
  ["점 둘을 지나 // 가 되는 다른 사이트", "/..//evil.example"],
  ["%2e 를 지나 // 가 되는 다른 사이트", "/%2e//evil.example"],
  ["로그인 화면 자신", "/login?next=/home"],
  ["가입 화면", "/signup?next=/home"],
])("돌아올 곳이 %s 이면 홈으로 간다", (_, raw) => {
  expect(nextPath(raw)).toBe("/home");
});
