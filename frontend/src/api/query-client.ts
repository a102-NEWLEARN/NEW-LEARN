import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isSessionExpired, toApiError } from "@/api/error";
import { meQuery } from "@/api/members";

/**
 * 4xx 는 다시 불러도 결과가 같아서 다시 부르지 않는다.
 * 5xx · 연결 실패는 잠깐의 문제일 수 있어 한 번만 다시 부른다 — 오래 기다리지 않고 *다시 시도* 를 보이게
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const { status } = toApiError(error);
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  // 세션이 끝난 401 은 어느 조회 · 저장에서 받든 「내 정보」를 손님(null)으로 바꾼다.
  // 그러면 가드(RequireMember)가 /login?next=<지금 주소> 로 보내고, 로그인하면 돌아온다 (EXPERIENCE.md 이동 규칙).
  // 화면은 401 에 따로 안내를 띄우지 않는다 — 곧 로그인 화면으로 바뀐다
  const signOutIfExpired = (error: unknown) => {
    if (isSessionExpired(error)) client.setQueryData(meQuery.queryKey, null);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: signOutIfExpired }),
    mutationCache: new MutationCache({ onError: signOutIfExpired }),
    defaultOptions: { queries: { retry: shouldRetry } },
  });
  return client;
}
