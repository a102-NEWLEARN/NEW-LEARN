import { api } from "@/api/client";
import { ApiError } from "@/api/error";
import type { Member } from "@/api/members";
import { clearTabLogin, markTabLogin } from "@/lib/tabLogin";

export type LoginRequest = { loginId: string; password: string };

/**
 * A15 로그인. 성공하면 회원 정보를 받고, 세션 쿠키와 새 CSRF 번호표가 붙는다.
 * 오류는 401 LOGIN_FAILED · 400 VALIDATION_FAILED · 429 TOO_MANY_REQUESTS — 언제 나는지는 docs/api-screen.md A15
 */
export function login(body: LoginRequest) {
  return api.post<Member>("/auth/login", body).then((res) => {
    // 이 탭에서 로그인했다 — 탭을 다 닫았다 열면 로그아웃한다(lib/tabLogin)
    markTabLogin();
    return res.data;
  });
}

/**
 * A16 로그아웃 — 세션을 끝내고 새 CSRF 번호표를 받는다. 세션이 없으면 401 인데, 끊으려던 세션이 이미 없다는 뜻이라
 * 로그아웃한 것으로 본다 (docs/api.md 2절). 403(CSRF 번호표)은 세션이 남았을 수 있어 그대로 던진다
 */
export function logout() {
  return api
    .post<void>("/auth/logout")
    .then(() => clearTabLogin())
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401)
        return clearTabLogin();
      throw error;
    });
}
