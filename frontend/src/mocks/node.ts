import { setupServer } from "msw/node";
import { handlers } from "@/mocks/handlers";

// 테스트용 가짜 API. src/test/setup.ts 가 켜고 끈다
export const server = setupServer(...handlers);
