import { http } from "msw/http";
import { problem } from "@/mocks/handlers";

// 개발 화면(npm run dev:mock)의 가짜 로그인 상태. 진짜 서버처럼 처음에는 손님이고 로그인(A15) · 가입(A14)하면
// 회원, 로그아웃(A16)하면 다시 손님이다. 아이디 · 비밀번호는 보지 않는다.
// 상태는 메모리에만 둔다 — 새로 고치거나(Ctrl+Shift+R 포함) 탭을 다시 열면 손님으로 돌아간다.
// 여기서 응답을 돌려주지 않으면 handlers.ts 의 같은 주소 응답으로 넘어간다. 테스트는 이것을 쓰지 않아 늘 회원이다

const unauthorized = (instance: string) =>
  problem(401, "UNAUTHORIZED", "로그인하지 않았다", instance);

/** 로그인 상태를 기억하는 응답. main.tsx 가 페이지를 열 때마다 새로 만든다 */
export function createSessionHandlers() {
  let loggedIn = false;

  return [
    http.get("/api/v1/members/me", () => {
      if (!loggedIn) return unauthorized("/api/v1/members/me");
    }),
    http.post("/api/v1/auth/login", () => {
      loggedIn = true;
    }),
    http.post("/api/v1/members", () => {
      loggedIn = true;
    }),
    http.post("/api/v1/auth/logout", () => {
      if (!loggedIn) return unauthorized("/api/v1/auth/logout");
      loggedIn = false;
    }),
  ];
}

/** 페이지를 열 때마다 손님이라 랜딩부터 시작한다. 라우터를 만들기 전에 주소를 / 로 바꾼다 */
export function startFromLanding() {
  if (window.location.pathname + window.location.search !== "/")
    window.history.replaceState(null, "", "/");
}
