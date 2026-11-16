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

test("사용 분석 스크립트(analytics.js)는 defer 로 불러 첫 화면 그리기를 막지 않는다", () => {
  // <head> 의 보통 script 는 받고 돌 때까지 화면 그리기를 멈춘다. defer 는 HTML 을 다 읽은 뒤
  // 화면 코드(module script)보다 먼저 차례대로 돈다 — 화면 쪽 track() 은 gtag 가 없어도 넘어간다
  const html = readFileSync(file("index.html"), "utf8");
  const tags = html.match(/<script[^>]*\bsrc="\/analytics\.js"[^>]*>/g) ?? [];

  expect(tags).toHaveLength(1);
  expect(tags[0]).toMatch(/\sdefer[\s>]/);
});

test("nginx 가 응답 머리에 문자셋(utf-8)을 붙인다 — <meta charset> 이 첫 1024바이트 밖으로 밀려서", () => {
  // SEED 테마 script(빌드 때 플러그인이 넣는다)가 <meta charset> 앞에 들어가 Lighthouse charset 항목이 깎였다
  const conf = readFileSync(file("nginx.conf"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"));

  expect(conf).toContain("charset utf-8;");
});
