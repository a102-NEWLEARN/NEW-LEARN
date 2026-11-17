import axios from "axios";
import { toApiError } from "@/api/error";

// 화면은 API 를 같은 출처로 부른다. 개발 서버에서는 vite.config.ts 의 proxy 가 API 서버로 넘긴다.
// 화면용 API 는 모두 /api/v1 아래에 있다 (docs/api.md 1절)
export const api = axios.create({ baseURL: "/api/v1" });

// 오류는 모두 ApiError 로 바꿔 던진다. 화면은 status · code 로 갈라 처리한다
api.interceptors.response.use(undefined, (error: unknown) =>
  Promise.reject(toApiError(error)),
);
