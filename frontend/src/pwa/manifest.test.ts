/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// 폰 홈 화면 설치에 필요한 것 — manifest 칸 · 아이콘 파일과 크기 · index.html 연결 (Jira 176)

// `new URL(…, import.meta.url)` 꼴은 Vite 가 정적 자산 주소로 바꿔 버려서 테스트 파일 위치에서 경로를 만든다
const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const file = (path: string) => join(frontendDir, path);

type Icon = { src: string; sizes: string; type: string; purpose: string };

const manifest = JSON.parse(
  readFileSync(file("public/manifest.webmanifest"), "utf8"),
) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  lang: string;
  icons: Icon[];
};

// PNG 머리(IHDR)의 가로 · 세로
function pngSize(path: string) {
  const bytes = readFileSync(path);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

test("앱 이름 · 시작 주소 · 주소창 없이 열기 · 색을 적는다", () => {
  expect(manifest).toMatchObject({
    name: "NEW:LEARN",
    short_name: "NEW:LEARN",
    // 손님은 /home 에서 로그인 화면으로 간다(RequireMember). 회원은 바로 홈
    start_url: "/home",
    scope: "/",
    display: "standalone",
    lang: "ko",
    theme_color: "#ffffff",
    background_color: "#ffffff",
  });
});

test("아이콘은 192 · 512 와 안드로이드가 잘라 쓰는 maskable 512 가 있다", () => {
  const kinds = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`);
  expect(kinds).toEqual(
    expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]),
  );
});

test("manifest 의 아이콘 파일이 있고 크기가 적은 대로다", () => {
  for (const icon of manifest.icons) {
    const path = file(`public${icon.src}`);
    expect(existsSync(path), icon.src).toBe(true);
    expect(pngSize(path), icon.src).toBe(icon.sizes);
  }
});

test("index.html 이 manifest · iOS 아이콘 · 주소창 색을 건다", () => {
  const html = readFileSync(file("index.html"), "utf8");

  expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
  expect(html).toContain(
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"',
  );
  expect(html).toContain('<meta name="theme-color" content="#ffffff"');
  expect(pngSize(file("public/icons/apple-touch-icon.png"))).toBe("180x180");
});

test("index.html 에 인라인 스크립트를 더하지 않는다 — CSP 가 해시가 맞는 것만 받는다", () => {
  const html = readFileSync(file("index.html"), "utf8");
  const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];

  expect(inline).toEqual([]);
});
