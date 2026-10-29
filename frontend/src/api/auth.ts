import { api } from "@/api/client";
import type { Member } from "@/api/members";

export type LoginRequest = { loginId: string; password: string };

/**
 * A15 로그인. 성공하면 회원 정보를 받고, 세션 쿠키와 새 CSRF 번호표가 붙는다.
 * 오류는 401 LOGIN_FAILED · 400 VALIDATION_FAILED · 429 TOO_MANY_REQUESTS — 언제 나는지는 docs/api-screen.md A15
 */
export function login(body: LoginRequest) {
  return api.post<Member>("/auth/login", body).then((res) => res.data);
}

/** A16 로그아웃 — 세션을 끝내고 새 CSRF 번호표를 받는다. 세션이 없으면 401 UNAUTHORIZED */
export function logout() {
  return api.post<void>("/auth/logout").then(() => undefined);
}
