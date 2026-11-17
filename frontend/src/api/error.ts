import axios from "axios";

/** VALIDATION_FAILED 일 때 칸 하나가 틀린 까닭. `reason` 은 화면에 그대로 보일 한국어 문장이다 */
export type FieldError = { field: string; reason: string };

/** API 오류 응답 본문 — RFC 9457 Problem Details + `code` (docs/api.md 2절) */
export type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  /** 개발자용 설명. 화면에 그대로 보이지 않는다 */
  detail: string;
  instance: string;
  code: string;
  errors?: FieldError[];
};

type ApiErrorInit = {
  status: number | null;
  code: string | null;
  errors?: FieldError[];
  message?: string;
  cause?: unknown;
};

// 화면은 이 오류 하나만 받는다. status · code 로 갈라 문구와 할 일을 정한다 (EXPERIENCE.md State Patterns)
export class ApiError extends Error {
  /** HTTP 상태. 서버에 닿지 못했으면 null */
  readonly status: number | null;
  /** docs/api.md 2절의 오류 코드. 서버가 Problem Details 를 주지 않았으면 null */
  readonly code: string | null;
  readonly errors: FieldError[];

  constructor({ status, code, errors = [], message, cause }: ApiErrorInit) {
    super(message ?? code ?? `API 오류 (${status ?? "연결 실패"})`, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

function isProblemDetail(data: unknown): data is ProblemDetail {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as ProblemDetail).code === "string"
  );
}

/** axios 오류든 아니든 ApiError 로 바꾼다 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) {
      return new ApiError({
        status: null,
        code: null,
        message: error.message,
        cause: error,
      });
    }
    const problem = isProblemDetail(response.data) ? response.data : null;
    return new ApiError({
      status: response.status,
      code: problem?.code ?? null,
      errors: problem?.errors ?? [],
      message: problem?.detail ?? error.message,
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ApiError({ status: null, code: null, message, cause: error });
}

/** 요청이 서버에 닿지 못했나 — 응답 없는 axios 오류만. 화면 코드가 터진 오류는 아니다 */
export function isNetworkError(error: unknown): boolean {
  const cause = error instanceof ApiError ? error.cause : error;
  return axios.isAxiosError(cause) && !cause.response;
}

/**
 * 세션이 끝났나 — 로그인이 필요한 API(A18 · A20 ~ A25)가 준 401 `UNAUTHORIZED` (docs/api.md 2절).
 * 같은 401 이라도 로그인 화면의 `LOGIN_FAILED`(A15)는 아니다. A16 로그아웃 · A17 내 정보의 401 은 auth.ts · members.ts 가 먼저 삼킨다
 */
export function isSessionExpired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    error.code !== "LOGIN_FAILED"
  );
}
