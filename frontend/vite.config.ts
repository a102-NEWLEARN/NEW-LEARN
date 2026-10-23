/// <reference types="vitest/config" />
import { seedDesignPlugin } from "@seed-design/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { msw } from "msw/vite";
import {
  defaultClientConditions,
  defineConfig,
  loadEnv,
  type Plugin,
} from "vite";

// SEED 컴포넌트 CSS 가 Tailwind 보다 먼저 읽혀도 층 순서가 맞게 순서 선언을 head 맨 앞에 넣는다
// (SEED Design 의 Tailwind CSS 4 설정 안내)
function injectLayerOrder(): Plugin {
  return {
    name: "inject-layer-order",
    transformIndexHtml() {
      return [
        {
          tag: "style",
          children:
            "@layer theme, base, seed-base, components, seed-components, utilities;",
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  // 호스트에서 띄우면 저장소 루트 .env 의 BACKEND_PORT 로 API 를 찾는다.
  // compose 의 frontend 컨테이너는 API_PROXY_TARGET 으로 backend 컨테이너를 받는다.
  const env = loadEnv(mode, "..", "");
  const apiTarget =
    env.API_PROXY_TARGET ?? `http://localhost:${env.BACKEND_PORT ?? "8080"}`;

  return {
    plugins: [
      injectLayerOrder(),
      react(),
      tailwindcss(),
      // NEW:LEARN 은 라이트 테마만 쓴다 (DESIGN.md). 이 플러그인이 <html data-seed-color-mode> 를
      // 옵션 값으로 덮어쓰므로 index.html 이 아니라 여기서 고정한다
      seedDesignPlugin({ colorMode: "light-only" }),
      // 가짜 API(MSW) 의 서비스 워커를 개발 서버에서만 내준다. 빌드 결과에는 들어가지 않는다.
      // 켜는 곳은 src/main.tsx (npm run dev:mock)
      msw(),
    ],
    resolve: {
      conditions: ["seed-layered", ...defaultClientConditions],
      tsconfigPaths: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/actuator": { target: apiTarget, changeOrigin: true },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // 테스트는 UTC 로 돈다. 한국 PC 에서도 한국 시간 처리(src/lib/date.ts)가 빠지면 잡히게
      env: { TZ: "UTC" },
      // @seed-design/react 가 CSS 를 import 해서 Node 가 그대로 못 읽는다 — Vite 가 처리하게 한다
      server: { deps: { inline: [/@seed-design\//] } },
    },
  };
});
