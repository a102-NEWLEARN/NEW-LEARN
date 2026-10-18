import axios from "axios";

// 화면은 API 를 같은 출처로 부른다. 개발 서버에서는 vite.config.ts 의 proxy 가 API 서버로 넘긴다.
export const api = axios.create({ baseURL: "/" });
