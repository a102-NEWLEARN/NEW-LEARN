import { QueryClient } from "@tanstack/react-query";
import { toApiError } from "@/api/error";

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
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
