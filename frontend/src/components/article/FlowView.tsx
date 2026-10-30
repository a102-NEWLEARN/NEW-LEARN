import { type MouseEvent, useEffect, useState } from "react";
import type { MindmapBranch } from "@/api/mindmap";
import { BRANCHES } from "@/components/article/branches";

type FlowViewProps = {
  /** 머리 줄 글자 — A9 title */
  title: string;
  /** A9 가지 — 내용이 있는 것만 온다 */
  branches: MindmapBranch[];
};

// 강조한 잎 — 가지 종류와 가지 안 순서
const leafKey = (type: string, index: number) => `${type}:${index}`;

// 기사 마인드맵의 흐름지도 보기 — 가지를 「무슨 일이? → 왜 일어났나? → 누가 뭐라고 했나? → 앞으로는?」 순서로
// 읽는 목록 (프로토타입 v21 MindmapFlowMap · FlowCard, Jira S15P31A102-58).
// 자리가 1024px 이상이면 가지 하나가 한 열인 가로, 아니면 세로다. 컨테이너 쿼리라 넓이를 재는 코드가 없다.
// 잎을 누르면 강조만 한다 — 노드 상세는 F05(추후). 다시 누르기 · 빈 곳 · Esc 로 푼다 (EXPERIENCE.md 보기 탭)
export function FlowView({ title, branches }: FlowViewProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Esc — 강조를 푼다. 먼저 받은 쪽이 preventDefault 했거나 다른 창(dialog) 안에서 누른 Esc 는
  // 그쪽 몫이다 (MindmapGraph 와 같다)
  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing || key.defaultPrevented)
        return;
      if ((key.target as Element | null)?.closest?.('[role="dialog"]')) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  // 잎 카드 밖을 누르면 강조를 푼다
  const releaseOnEmpty = (click: MouseEvent) => {
    if ((click.target as Element).closest("button")) return;
    setSelected(null);
  };

  return (
    // 빈 곳 누르기는 마우스로 강조를 푸는 지름길이다 — 키보드는 Esc · 다시 누르기로 푼다
    <div
      role="group"
      aria-label="기사 흐름지도"
      onClick={releaseOnEmpty}
      className="@container min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-[860px] px-x4 pt-x7 pb-x16 md:px-x8 @min-[1024px]:max-w-[1280px]">
        {/* 머리 줄 — 바로 위 h1 과 같은 글이라 낭독에서 뺀다 (마인드맵 보기의 가운데 원과 같다) */}
        <div aria-hidden className="flex items-center gap-x3_5">
          <span className="size-x4 shrink-0 rounded-full bg-bg-brand-accent shadow-[0_0_0_4px_var(--seed-color-bg-layer-default),0_0_0_5.5px_var(--seed-color-stroke-neutral-weak)]" />
          <span className="flex min-w-0 flex-col gap-x0_5">
            <span className="t2-bold text-fg-neutral-subtle">기사 핵심</span>
            <span className="t7-bold text-fg-neutral">{title}</span>
          </span>
        </div>
        <ol className="mt-x7 grid gap-y-x8 @min-[1024px]:grid-cols-4 @min-[1024px]:gap-x-x7">
          {branches.map(({ type, items }, index) => {
            const { name, question, tone } = BRANCHES[type];
            const last = index === branches.length - 1;
            return (
              // 세로 — 번호 원 | 질문 · 이름, 그 아래 잎 카드. 가로 — 번호 줄 · 질문 · 잎 카드를 위에서 아래로
              <li
                key={type}
                className="relative grid grid-cols-[30px_minmax(0,1fr)] gap-x-x4 gap-y-x3 @min-[1024px]:flex @min-[1024px]:flex-col @min-[1024px]:gap-x2_5"
              >
                {/* 세로 — 번호 원 아래에서 다음 번호 원 4px 앞까지 (가지 사이 간격 32px) */}
                {!last && (
                  <span
                    aria-hidden
                    className="absolute top-[34px] bottom-[-28px] left-[14px] border-l-2 border-stroke-neutral-weak @min-[1024px]:hidden"
                  />
                )}
                <div className="relative">
                  <span
                    aria-hidden
                    className={`t4-bold relative z-[1] flex size-[30px] items-center justify-center rounded-full text-palette-static-white tabular-nums ${tone.step}`}
                  >
                    {index + 1}
                  </span>
                  {!last && <ArrowToNext />}
                </div>
                <div className="flex min-w-0 flex-col gap-x0_5">
                  <h2 className="t6-bold text-fg-neutral">{question}</h2>
                  <p className={`t3-bold ${tone.label}`}>
                    {`${name} · ${items.length}개`}
                  </p>
                </div>
                <div className="col-start-2 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x2_5 @min-[1024px]:grid-cols-1">
                  {items.map(({ text }, itemIndex) => {
                    const key = leafKey(type, itemIndex);
                    const on = selected === key;
                    return (
                      <LeafCard
                        key={key}
                        text={text}
                        tone={tone}
                        outlook={type === "OUTLOOK"}
                        on={on}
                        dimmed={selected !== null && !on}
                        onPress={() => setSelected(on ? null : key)}
                      />
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// 가로일 때 다음 열로 잇는 선과 화살표 — 번호 원 오른쪽에서 열 사이 간격(28px)까지
function ArrowToNext() {
  return (
    <>
      <span
        aria-hidden
        className="absolute top-[14px] right-[-20px] left-[38px] hidden border-t-2 border-stroke-neutral-weak @min-[1024px]:block"
      />
      <span
        aria-hidden
        className="absolute top-[10px] right-[-20px] hidden size-[8px] rotate-45 border-t-2 border-r-2 border-stroke-neutral-weak @min-[1024px]:block"
      />
    </>
  );
}

type LeafCardProps = {
  text: string;
  tone: (typeof BRANCHES)[keyof typeof BRANCHES]["tone"];
  /** 전망 가지의 잎 — 점선 원과 「전망·해석」 */
  outlook: boolean;
  on: boolean;
  dimmed: boolean;
  onPress: () => void;
};

// 잎 카드 — 문장 전체를 둔다. 상세 창이 없어서 자르면 끝까지 읽을 길이 없다
function LeafCard({ text, tone, outlook, on, dimmed, onPress }: LeafCardProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-dimmed={dimmed || undefined}
      onClick={onPress}
      className={`flex w-full flex-col items-start gap-x2 rounded-r3_5 border px-x4 py-x3_5 text-left transition-[border-color,background-color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring motion-reduce:transition-none ${
        on
          ? tone.cardOn
          : `border-stroke-neutral-weak bg-bg-layer-default ${tone.cardHover}`
      } ${dimmed ? "opacity-55 hover:opacity-100" : ""}`}
    >
      <span className="flex items-start gap-x2_5">
        <span
          aria-hidden
          data-leaf-mark
          className={`mt-[6px] size-[12px] shrink-0 rounded-full border-[2.5px] ${tone.mark} ${
            outlook ? "border-dashed" : ""
          } ${on ? tone.dot : "bg-bg-layer-default"}`}
        />
        <span className="t5-medium text-fg-neutral">{text}</span>
      </span>{" "}
      {outlook && (
        <span className="t2-bold ml-[22px] rounded-r1_5 border border-dashed border-stroke-neutral-weak px-x1_5 text-fg-neutral-muted">
          전망·해석
        </span>
      )}
    </button>
  );
}
