import { useRef } from "react";
import { BRANCHES } from "@/components/article/branches";
import {
  SAMPLE_ARTICLE,
  SAMPLE_BRANCHES,
} from "@/components/landing/landingSample";
import { PreviewDetail } from "@/components/landing/PreviewDetail";
import { useCycle } from "@/components/landing/useCycle";
import { useOnScreen } from "@/components/landing/useOnScreen";
import { enterAt } from "@/components/motion/screenMotion";

/** 강조한 잎이 바뀌는 간격 (프로토타입 v21) */
const CYCLE_MS = 2600;
const LEAVES = SAMPLE_BRANCHES.flatMap((branch, b) =>
  branch.items.map((text) => ({ branch: branch.type, text, b })),
);

// 흐름지도 미리보기 — 기사 핵심 점 · 제목 아래 가지 넷을 번호 · 질문으로 잇고, 가지마다 잎 둘을 칩으로 둔다.
// 2.6초마다 강조한 잎이 바뀌고 아래에 그 잎을 보인다. 칩에 마우스 · 포커스가 오거나 누르면 그 잎에서 멈춘다. 화면 밖이면 넘기지 않는다
// (프로토타입 v21 LandingFlowPreview)
export function FlowPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const { active, hold, release } = useCycle(LEAVES.length, CYCLE_MS, onScreen);
  const current = LEAVES[active];

  return (
    <div ref={ref} className="pt-x1">
      <div className="flex items-center gap-x2 text-[13px]">
        <span className="font-bold text-fg-neutral">기사 흐름지도</span>
        <span className="min-w-0 truncate text-fg-neutral-muted">
          {SAMPLE_ARTICLE.publisher} · {SAMPLE_ARTICLE.title}
        </span>
      </div>
      <div className="mt-[14px] flex items-center gap-[10px]">
        <span className="ml-[7px] size-[14px] shrink-0 rounded-full bg-bg-brand-accent shadow-[0_0_0_4px_var(--color-bg-layer-default),0_0_0_5.5px_var(--color-stroke-neutral-weak)]" />
        <span className="ml-[6px] text-[16px] font-extrabold tracking-[-0.02em] text-fg-neutral">
          {SAMPLE_ARTICLE.title}
        </span>
      </div>
      <ol className="mt-x2">
        {SAMPLE_BRANCHES.map((branch, b) => {
          const { name, question, tone } = BRANCHES[branch.type];
          return (
            <li
              key={branch.type}
              className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-x3 py-x2 motion-safe:animate-[newlearn-rise-in_380ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]"
              style={enterAt(120 + b * 110)}
            >
              {b < SAMPLE_BRANCHES.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-[40px] -bottom-x2 left-[13px] w-[2px] bg-stroke-neutral-weak"
                />
              )}
              <span
                className={`relative inline-flex size-[28px] items-center justify-center rounded-full text-[13px] font-extrabold text-palette-static-white ${tone.step}`}
              >
                {b + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-x2">
                  <span className="text-[14px] font-extrabold text-fg-neutral">
                    {question}
                  </span>
                  <span className={`text-[12px] font-semibold ${tone.label}`}>
                    {name}
                  </span>
                </div>
                <div className="mt-[6px] flex flex-wrap gap-[6px]">
                  {branch.items.map((text) => {
                    const index = LEAVES.findIndex(
                      (leaf) => leaf.b === b && leaf.text === text,
                    );
                    const on = index === active;
                    return (
                      <button
                        key={text}
                        type="button"
                        aria-pressed={on}
                        onClick={() => hold(index)}
                        onMouseEnter={() => hold(index)}
                        onMouseLeave={release}
                        onFocus={() => hold(index)}
                        onBlur={release}
                        className={`inline-flex h-[30px] max-w-full items-center gap-[6px] rounded-[8px] border-[1.5px] px-[10px] text-[12px] text-fg-neutral transition-[background-color,border-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring ${
                          on
                            ? `font-bold ${tone.cardOn}`
                            : "border-stroke-neutral-weak bg-bg-layer-default font-semibold"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`size-[8px] shrink-0 rounded-full border-2 ${tone.mark} ${
                            branch.type === "OUTLOOK"
                              ? "border-dashed"
                              : "border-solid"
                          } ${on ? tone.dot : "bg-bg-layer-default"}`}
                        />
                        <span className="truncate">{text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-x2 min-h-[72px]">
        <PreviewDetail
          key={active}
          branch={current.branch}
          text={current.text}
        />
      </div>
    </div>
  );
}
