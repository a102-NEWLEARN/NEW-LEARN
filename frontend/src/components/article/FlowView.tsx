import { type MouseEvent, useEffect, useId, useState } from "react";
import type { MindmapBranch } from "@/api/mindmap";
import { AiBadge } from "@/components/AiBadge";
import { BRANCHES, type BranchInfo } from "@/components/article/branches";
import {
  isTextDragClick,
  meaningProps,
} from "@/components/meaning/meaningProps";
import {
  enterAt,
  FADE_IN,
  GROW_X,
  GROW_Y,
  HOVER_SPRING,
  POP_ONCE,
  RIPPLE_LOOP,
  RIPPLE_ONCE,
  RISE,
  SPRING_IN,
  TRAVEL_X,
  TRAVEL_Y,
  travel,
} from "@/components/motion/screenMotion";

// 열 때 나오는 차례(ms) — 머리 줄, 그다음 가지 열이 앞(왼쪽 · 위)부터 300ms 간격으로 이야기처럼 나온다.
// 열 안에서는 번호 원(튀어나오며 파문) → 질문 → 잎 카드(60ms 간격). 번호 원이 나오면 다음 번호로 선이 자라고
// 그 끝을 따라 점이 달려가서, 점이 닿을 즈음 다음 번호 원이 튀어나온다 (프로토타입 v21 MindmapFlowMap 을 키웠다)
const COLUMN_AT = (index: number) => 150 + index * 300;
const QUESTION_AFTER = 100;
const CARD_AFTER = 160;
const CARD_GAP = 60;
// 잎이 많아도 다 나오기까지 2초가 안 걸리게 — 다섯째 카드부터는 넷째와 같이 나온다
const CARD_STAGGER_MAX = 4;
const LINE_AFTER = 60;
const RIPPLE_AFTER = 200;
// 선이 다 자란(300ms) 즈음 화살표가 나타난다
const ARROW_AFTER = LINE_AFTER + 260;
// 머리 줄 점의 파문 — 다 나온 뒤부터 3초마다 번진다
const HEADER_PULSE_AT = 1800;

type FlowViewProps = {
  /** 이 기사 — 잎 글을 드래그하면 이 기사의 문맥으로 뜻을 찾는다(F13 용어사전) */
  articleId: number;
  /** 머리 줄 글자 — A9 title */
  title: string;
  /** A9 가지 — 내용이 있는 것만 온다 */
  branches: MindmapBranch[];
  /** A9 aiGenerated — 맨 위 첫 줄에 AI 생성 표시를 붙인다 */
  aiGenerated?: boolean;
};

// 강조한 잎 — 가지 종류와 가지 안 순서
const leafKey = (type: string, index: number) => `${type}:${index}`;

// 기사 마인드맵의 흐름지도 보기 — 가지를 「무슨 일이? → 왜 일어났나? → 누가 뭐라고 했나? → 앞으로는?」 순서로
// 읽는 목록 (프로토타입 v21 MindmapFlowMap · FlowCard, Jira S15P31A102-58).
// 자리가 1024px 이상이면 가지 하나가 한 열인 가로, 아니면 세로다. 컨테이너 쿼리라 넓이를 재는 코드가 없다.
// 잎을 누르면 강조만 한다 — 노드 상세는 F05(추후). 다시 누르기 · 빈 곳 · Esc 로 푼다 (EXPERIENCE.md 보기 탭)
export function FlowView({
  articleId,
  title,
  branches,
  aiGenerated = false,
}: FlowViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const idPrefix = useId();

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

  // 잎 카드 밖을 누르면 강조를 푼다. 글을 드래그한 끝의 클릭(용어사전)은 누르기가 아니다
  const releaseOnEmpty = (click: MouseEvent) => {
    if ((click.target as Element).closest("button")) return;
    if (isTextDragClick(click)) return;
    setSelected(null);
  };

  return (
    // 빈 곳 누르기는 마우스로 강조를 푸는 지름길이다 — 키보드는 Esc · 다시 누르기로 푼다
    <div
      role="group"
      aria-label="기사 흐름지도"
      onClick={releaseOnEmpty}
      // 좁은 화면은 화면 전체가 스크롤한다(기사 화면) — 이 칸은 따로 스크롤하지 않는다
      className="@container min-h-0 flex-1 overflow-y-auto max-md:overflow-visible"
    >
      {/* 좁은 화면 — 좌우 20px, 맨 아래 96px (DESIGN.md Layout & Spacing 「스크롤 끝」) */}
      <div className="mx-auto w-full max-w-[860px] px-x5 pt-x6 pb-[96px] md:px-x8 md:pt-x7 md:pb-x16 @min-[1024px]:max-w-[1280px]">
        {/* AI 생성 표시 — 탭 줄 오른쪽 끝이 아니라 그린 내용 맨 위 첫 줄. 기사 머리 가까이 두면 기사를 AI 가 쓴 것처럼 읽힌다
            (2026-11-12 사용자, Jira 195) */}
        {aiGenerated && (
          <div className={`mb-x4 ${RISE}`} style={enterAt(0)}>
            <AiBadge />
          </div>
        )}
        {/* 머리 줄 — 바로 위 h1 과 같은 글이라 낭독에서 뺀다 (마인드맵 보기의 가운데 원과 같다).
            자리가 좁으면(640px 미만) h1 이 바로 위에 보여서 같은 제목을 또 두지 않는다 */}
        <div
          aria-hidden
          className={`flex items-center gap-x3_5 @max-[640px]:hidden ${RISE}`}
          style={enterAt(0)}
        >
          {/* 기사 핵심 점 — 튀어나온 뒤 3초마다 파문이 번진다 (마인드맵 보기의 가운데 원과 같다) */}
          <span className="relative size-x4 shrink-0">
            <span
              className={`absolute inset-0 rounded-full border-2 border-bg-brand-accent ${RIPPLE_LOOP}`}
              style={enterAt(HEADER_PULSE_AT)}
            />
            <span
              className={`block size-x4 rounded-full bg-bg-brand-accent shadow-[0_0_0_4px_var(--seed-color-bg-layer-default),0_0_0_5.5px_var(--seed-color-stroke-neutral-weak)] ${SPRING_IN}`}
              style={enterAt(0)}
            />
          </span>
          <span className="flex min-w-0 flex-col gap-x0_5">
            <span className="t2-bold text-fg-neutral-subtle">기사 핵심</span>
            <span className="t7-bold text-fg-neutral">{title}</span>
          </span>
        </div>
        <ol className="mt-x7 grid gap-y-x10 @max-[640px]:mt-0 @min-[1024px]:grid-cols-4 @min-[1024px]:gap-x-x7">
          {branches.map(({ type, items }, index) => {
            const { name, question, tone } = BRANCHES[type];
            const last = index === branches.length - 1;
            const headId = `${idPrefix}-${type}`;
            const at = COLUMN_AT(index);
            return (
              // 세로 — 번호 원 | 질문 · 이름, 그 아래 잎 카드. 가로 — 번호 줄 · 질문 · 잎 카드를 위에서 아래로
              <li
                key={type}
                className="relative grid grid-cols-[30px_minmax(0,1fr)] gap-x-x4 gap-y-x3 @min-[1024px]:flex @min-[1024px]:flex-col @min-[1024px]:gap-x2_5"
              >
                {/* 세로 — 번호 원 아래에서 다음 번호 원 4px 앞까지 (가지 사이 간격 40px).
                    위에서 아래로 자라고 그 끝을 따라 가지색 점이 달려간다 */}
                {!last && (
                  <>
                    <span
                      aria-hidden
                      className={`absolute top-[34px] bottom-[-36px] left-[14px] border-l-2 border-stroke-neutral-weak @min-[1024px]:hidden ${GROW_Y}`}
                      style={enterAt(at + LINE_AFTER)}
                    />
                    <span
                      aria-hidden
                      className={`absolute left-[11px] size-[8px] rounded-full @min-[1024px]:hidden ${tone.dot} ${TRAVEL_Y}`}
                      style={travel(
                        "34px",
                        "calc(100% + 28px)",
                        at + LINE_AFTER,
                      )}
                    />
                  </>
                )}
                <div className="relative">
                  {/* 번호 원이 튀어나오며 둘레에 파문이 한 번 번진다 */}
                  <span
                    aria-hidden
                    className={`absolute top-0 left-0 size-[30px] rounded-full border-2 ${tone.mark} ${RIPPLE_ONCE}`}
                    style={enterAt(at + RIPPLE_AFTER)}
                  />
                  <span
                    aria-hidden
                    className={`t4-bold relative z-[1] flex size-[30px] items-center justify-center rounded-full text-palette-static-white tabular-nums ${tone.step} ${SPRING_IN}`}
                    style={enterAt(at)}
                  >
                    {index + 1}
                  </span>
                  {!last && <ArrowToNext at={at} dot={tone.dot} />}
                </div>
                <div
                  className={`flex min-w-0 flex-col gap-x0_5 ${RISE}`}
                  style={enterAt(at + QUESTION_AFTER)}
                >
                  <h2 id={`${headId}-q`} className="t6-bold text-fg-neutral">
                    {question}
                  </h2>
                  <p id={`${headId}-n`} className={`t3-bold ${tone.label}`}>
                    {`${name} · ${items.length}개`}
                  </p>
                </div>
                {/* 잎 카드 묶음 — Tab 으로 카드만 옮겨 다녀도 어느 가지인지 읽히게 (마인드맵 보기의 가지 묶음과 같다).
                    칸은 260px 이상이되 자리가 그보다 좁으면 자리만큼 (320px 화면에서 가로로 넘치지 않게) */}
                <div
                  role="group"
                  aria-labelledby={`${headId}-q ${headId}-n`}
                  className="col-start-2 grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-x3 @min-[1024px]:grid-cols-1"
                >
                  {items.map(({ text }, itemIndex) => {
                    const key = leafKey(type, itemIndex);
                    const on = selected === key;
                    return (
                      <LeafCard
                        key={key}
                        articleId={articleId}
                        text={text}
                        tone={tone}
                        outlook={type === "OUTLOOK"}
                        on={on}
                        dimmed={selected !== null && !on}
                        enterDelay={
                          at +
                          CARD_AFTER +
                          Math.min(itemIndex, CARD_STAGGER_MAX) * CARD_GAP
                        }
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

// 가로일 때 다음 열로 잇는 선과 화살표 — 번호 원 오른쪽에서 열 사이 간격(28px)까지.
// 번호 원이 나온 뒤 선이 왼쪽에서 오른쪽으로 자라며 그 끝을 따라 가지색 점이 달려가고, 다 자라면 화살표가 나타난다
function ArrowToNext({ at, dot }: { at: number; dot: string }) {
  return (
    <>
      <span
        aria-hidden
        className={`absolute top-[10px] z-[1] hidden size-[8px] rounded-full @min-[1024px]:block ${dot} ${TRAVEL_X}`}
        style={travel("38px", "calc(100% + 12px)", at + LINE_AFTER)}
      />
      <span
        aria-hidden
        className={`absolute top-[14px] right-[-20px] left-[38px] hidden border-t-2 border-stroke-neutral-weak @min-[1024px]:block ${GROW_X}`}
        style={enterAt(at + LINE_AFTER)}
      />
      <span
        aria-hidden
        className={`absolute top-[10px] right-[-20px] hidden size-[8px] rotate-45 border-t-2 border-r-2 border-stroke-neutral-weak @min-[1024px]:block ${FADE_IN}`}
        style={enterAt(at + ARROW_AFTER)}
      />
    </>
  );
}

type LeafCardProps = {
  articleId: number;
  text: string;
  tone: BranchInfo["tone"];
  /** 전망 가지의 잎 — 점선 원과 「전망·해석」 */
  outlook: boolean;
  on: boolean;
  dimmed: boolean;
  /** 열 때 떠오르는 차례(ms) */
  enterDelay: number;
  onPress: () => void;
};

// 잎 카드 — 문장 전체를 둔다. 상세 창이 없어서 자르면 끝까지 읽을 길이 없다.
// 색 전환은 동작 줄이기에서도 남긴다 (EXPERIENCE.md Interaction Primitives). 포커스 윤곽선은 카드라 바깥으로 띄운다.
// 마우스를 올리면 살짝 들리고 원이 커진다. 누르는 동안 살짝 줄어든다 — 누르는 면이 하나인 카드라서다 (EXPERIENCE.md 「호버 · 눌림」)
// 글은 드래그해 고를 수 있다(용어사전) — 버튼 안 글은 브라우저가 고르지 못하게 해서 select-text 를 준다.
// 드래그 끝에 따라오는 클릭은 강조로 치지 않는다
function LeafCard({
  articleId,
  text,
  tone,
  outlook,
  on,
  dimmed,
  enterDelay,
  onPress,
}: LeafCardProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-dimmed={dimmed || undefined}
      onClick={(click) => {
        if (!isTextDragClick(click)) onPress();
      }}
      style={enterAt(enterDelay)}
      className={`group flex w-full flex-col items-start gap-x2 rounded-r3_5 border px-x4 py-x3_5 text-left select-text transition-[border-color,background-color,opacity,scale,translate] duration-[var(--seed-duration-d4)] ease-[var(--seed-timing-function-easing)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring motion-safe:hover:-translate-y-[2px] motion-safe:active:scale-[0.98] ${RISE} ${
        on
          ? tone.cardOn
          : `border-stroke-neutral-weak bg-bg-layer-default ${tone.cardHover}`
      } ${dimmed ? "opacity-55 hover:opacity-100" : ""}`}
    >
      <span className="flex items-start gap-x2_5">
        {/* 강조하면 원이 가지색으로 차며 한 번 튀고 둘레에 파문이 번진다 */}
        <span className="relative mt-[6px] size-[12px] shrink-0">
          {on && (
            <span
              aria-hidden
              className={`absolute inset-0 rounded-full border-2 ${tone.mark} ${RIPPLE_ONCE}`}
            />
          )}
          <span
            aria-hidden
            data-leaf-mark
            className={`block size-[12px] rounded-full border-[2.5px] transition-colors ${HOVER_SPRING} motion-safe:group-hover:scale-125 ${tone.mark} ${
              outlook ? "border-dashed" : ""
            } ${on ? `${tone.dot} ${POP_ONCE}` : "bg-bg-layer-default"}`}
          />
        </span>
        {/* 빈칸 없는 긴 영문 · 주소도 카드 안에서 줄을 바꾼다 */}
        <span
          className="t5-medium [overflow-wrap:anywhere] text-fg-neutral select-text"
          {...meaningProps("ARTICLE", articleId)}
        >
          {text}
        </span>
      </span>{" "}
      {outlook && (
        <span className="t2-bold ml-[22px] rounded-r1_5 border border-dashed border-stroke-neutral-weak px-x1_5 text-fg-neutral-muted">
          전망·해석
        </span>
      )}
    </button>
  );
}
