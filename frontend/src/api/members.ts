import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import { ApiError } from "@/api/error";

/** 회원 정보 — A14 · A15 · A17 · A18 의 응답 (docs/api-screen.md 1절 「회원 정보」) */
export type Member = {
  id: number;
  loginId: string;
  name: string;
  /** 관심 분야. 홈 추천 이슈 탭 · 마이페이지 관심사 설정에 쓴다 */
  categories: { code: string; name: string }[];
};

/** A14 가입 요청. 칸마다 규칙은 docs/api-screen.md A14 */
export type SignUpRequest = {
  loginId: string;
  password: string;
  name: string;
  /** 관심 분야 코드 */
  categoryCodes: string[];
};

/**
 * A14 가입. 성공하면 201 과 회원 정보를 받고 곧바로 로그인된다.
 * 규칙에 안 맞으면 400 VALIDATION_FAILED — errors 에 칸과 화면에 보일 문장이 온다. 아이디가 이미 있으면 409 LOGIN_ID_TAKEN
 */
export function signUp(body: SignUpRequest) {
  return api.post<Member>("/members", body).then((res) => res.data);
}

/** A18 관심 분야를 보낸 목록으로 통째로 바꾸고 바뀐 회원 정보를 받는다. 0개이거나 없는 코드면 400 VALIDATION_FAILED */
export function changeCategories(categoryCodes: string[]) {
  return api
    .put<Member>("/members/me/categories", { categoryCodes })
    .then((res) => res.data);
}

/**
 * A17 내 정보. 로그인하지 않았으면 401 인데, 이것은 「손님」이라는 뜻이라 null 로 돌려준다 (docs/api-screen.md A17).
 * 세션 쿠키는 화면이 읽지 못해서 이 응답으로 회원인지 가린다. 이 401 은 로그인 화면으로 보내지 않는다
 */
export function fetchMe(): Promise<Member | null> {
  return api
    .get<Member>("/members/me")
    .then((res) => res.data)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    });
}

// 한 번 받으면 다시 부르지 않는다. 창에 돌아올 때마다 다시 불러 관심 분야가 바뀌면 홈 탭 순서가 바뀌는데,
// SEED Tabs 는 방향키 순서를 처음 그릴 때만 읽어서 엇나간다. 로그인(LoginPage) · 로그아웃(MyPage)하면 이 쿼리를 직접 바꾸고,
// 관심 분야를 바꿀 때(S15P31A102-69)도 그렇게 한다
export const meQuery = queryOptions({
  queryKey: ["members", "me"],
  queryFn: fetchMe,
  staleTime: Infinity,
});
