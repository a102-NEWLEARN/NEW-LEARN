import { http } from "msw/http";
import { problem } from "@/mocks/handlers";

// 개발 화면(npm run dev:mock)의 가짜 로그인 상태. 진짜 서버처럼 처음에는 손님이고 로그인(A15) · 가입(A14)하면
// 회원, 로그아웃(A16)하면 다시 손님이다. 아이디 · 비밀번호는 보지 않는다.
// 새로 고쳐도 남게 sessionStorage 에 둔다 — 탭을 닫으면 손님으로 돌아간다.
// 여기서 응답을 돌려주지 않으면 handlers.ts 의 같은 주소 응답으로 넘어간다. 테스트는 이것을 쓰지 않아 늘 회원이다
const KEY = "newlearn:mock-session";

const loggedIn = () => sessionStorage.getItem(KEY) !== null;
const unauthorized = (instance: string) =>
  problem(401, "UNAUTHORIZED", "로그인하지 않았다", instance);

export const sessionHandlers = [
  http.get("/api/v1/members/me", () => {
    if (!loggedIn()) return unauthorized("/api/v1/members/me");
  }),
  http.post("/api/v1/auth/login", () => {
    sessionStorage.setItem(KEY, "member");
  }),
  http.post("/api/v1/members", () => {
    sessionStorage.setItem(KEY, "member");
  }),
  http.post("/api/v1/auth/logout", () => {
    if (!loggedIn()) return unauthorized("/api/v1/auth/logout");
    sessionStorage.removeItem(KEY);
  }),
];
