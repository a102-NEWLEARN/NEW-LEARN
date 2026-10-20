/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Vitest 는 CSS import 를 빈 글자로 바꾼다(?raw 도 같다). 그래서 파일을 직접 읽는다
const readText = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const themeCss = readText("./newlearn-theme.css");
const indexHtml = readText("../index.html");

// 기대값의 출처는 DESIGN.md Colors 절이다
// (_bmad-output/planning-artifacts/ux-designs/ux-S15P31A102-2026-10-15/DESIGN.md).
// DESIGN.md 색을 바꾸면 이 표와 newlearn-theme.css 를 같이 고친다.
const changedSeedRoles = {
  "fg-brand": "#087F72",
  "fg-brand-contrast": "#066B61",
  "fg-neutral": "#222B30",
  "fg-neutral-muted": "#66717A",
  "bg-brand-solid": "#087F72",
  "bg-brand-solid-pressed": "#066B61",
  "bg-brand-weak": "#E7FAF5",
  "bg-brand-weak-pressed": "#D0F5EC",
  "bg-layer-default": "#FFFFFF",
  "bg-neutral-muted": "#FAFBFC",
  "bg-neutral-solid": "#222B30",
  "stroke-brand-solid": "#087F72",
  "stroke-brand-weak": "#28CDAA",
  "stroke-neutral-weak": "#E7ECEF",
};

const newRoles = {
  "fg-brand-accent": "#28CDAA",
  "bg-brand-accent": "#28CDAA",
  "bg-accent-lime": "#C7F36C",
};

// SEED 레시피 중 역할 변수 대신 당근 팔레트(carrot-200)를 직접 쓰는 곳
const carrotSelectors = [
  ".seed-action-button--variant_brandOutline",
  ".seed-progress-circle__root--tone_brand",
  '.seed-reaction-button:is([aria-pressed="true"], [data-pressed])[data-loading]',
  ".seed-checkmark__root--variant_ghost-tone_brand",
];

// CSS 글자에서 사용자 정의 속성을 모아 var() 를 끝까지 따라가 실제 값을 돌려준다
function resolveCustomProperty(css: string, name: string): string | undefined {
  const declarations = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!declarations.has(match[1]))
      declarations.set(match[1], match[2].trim());
  }
  let value = declarations.get(name);
  for (let depth = 0; value?.startsWith("var(") && depth < 10; depth++) {
    value = declarations.get(value.slice(4, -1).trim());
  }
  return value?.toUpperCase();
}

describe("NEW:LEARN 테마 — DESIGN.md 색과 같다", () => {
  test.each(Object.entries(changedSeedRoles))(
    "SEED 역할 %s 를 %s 로 덮어쓴다",
    (role, hex) => {
      expect(resolveCustomProperty(themeCss, `--seed-color-${role}`)).toBe(hex);
    },
  );

  test.each(Object.entries(newRoles))("새 역할 %s 는 %s 다", (role, hex) => {
    expect(resolveCustomProperty(themeCss, `--nl-color-${role}`)).toBe(hex);
    expect(themeCss).toContain(`--color-${role}: var(--nl-color-${role});`);
  });

  test.each(carrotSelectors)(
    "당근 팔레트를 직접 쓰는 %s 를 덮는다",
    (selector) => {
      const ruleStart = themeCss.indexOf(selector);
      expect(ruleStart).toBeGreaterThanOrEqual(0);
      const rule = themeCss.slice(ruleStart, themeCss.indexOf("}", ruleStart));
      expect(rule).toContain("var(--seed-color-bg-brand-weak-pressed)");
    },
  );

  test("테마 파일은 당근 팔레트를 쓰지 않는다", () => {
    expect(themeCss).not.toMatch(/var\(--seed-color-palette-carrot/);
  });

  test("라이트 테마로 고정한다", () => {
    expect(indexHtml).toMatch(/<html[^>]*data-seed-color-mode="light-only"/);
  });
});
