/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// 운영 Lighthouse 가 짚은 것 중 파일 하나로 고치는 것들 (Jira 218). 파일을 읽어 확인한다 — pwa/manifest.test.ts 와 같은 방식
const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => join(frontendDir, path);

test("robots.txt 가 있어 검색 로봇이 화면 HTML 대신 규칙을 받는다 — 화면 주소는 열고 API 만 막는다", () => {
  // 없으면 nginx 가 화면 주소처럼 index.html 을 내줘서 Lighthouse SEO 가 robots.txt 오류로 깎인다
  expect(existsSync(file("public/robots.txt"))).toBe(true);

  const rules = readFileSync(file("public/robots.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  expect(rules).toEqual(["User-agent: *", "Disallow: /api/"]);
});
