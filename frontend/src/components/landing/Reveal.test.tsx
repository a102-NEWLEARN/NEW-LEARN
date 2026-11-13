import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Reveal } from "@/components/landing/Reveal";
import { stubOnScreen } from "@/test/frames";
import { stubReducedMotion } from "@/test/media";
import { enterDelay, expectMotionSafe } from "@/test/motion";

// 랜딩 섹션이 화면에 들어오면 떠오른다 — 프로토타입 v21 Reveal

afterEach(() => vi.unstubAllGlobals());

const box = () => screen.getByText("내용").parentElement!;

test("화면에 들어오기 전에는 숨어 있다가, 들어오면 16px 아래에서 떠오른다", () => {
  stubOnScreen(false);
  const { unmount } = render(
    <Reveal delay={70}>
      <p>내용</p>
    </Reveal>,
  );
  expect(box().dataset.shown).toBe("false");
  expect(box().style.transitionDelay).toBe("70ms");
  expectMotionSafe(box().parentElement!);
  unmount();

  stubOnScreen(true);
  render(
    <Reveal>
      <p>내용</p>
    </Reveal>,
  );
  expect(box().dataset.shown).toBe("true");
  expect(Number.isNaN(enterDelay(box()))).toBe(true);
});

test("화면에 들어왔는지 알 수 없으면 바로 보인다 — 오래된 브라우저", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  render(
    <Reveal>
      <p>내용</p>
    </Reveal>,
  );

  expect(box().dataset.shown).toBe("true");
});

test("동작 줄이기를 켜면 처음부터 보인다", () => {
  stubOnScreen(false);
  stubReducedMotion();
  render(
    <Reveal>
      <p>내용</p>
    </Reveal>,
  );

  expect(box().dataset.shown).toBe("true");
});
