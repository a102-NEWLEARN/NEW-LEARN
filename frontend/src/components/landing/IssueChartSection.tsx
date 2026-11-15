import { type CSSProperties, type ReactNode, useRef } from "react";
import { CHART, chartFrame } from "@/components/landing/issueChart";
import { LANDING_HEADER_HEIGHT } from "@/components/landing/LandingHeader";
import { useScrollProgress } from "@/components/landing/useScrollProgress";
import { formatEventDate } from "@/lib/date";

const PAD_X = "clamp(24px,3vw,32px)";

type CaptionProps = {
  /** 지금 보이는 문장인가 — 아니면 누르기에서 뺀다 */
  current: boolean;
  /** 둘째 문장은 첫 문장 자리에 겹친다 */
  layered?: boolean;
  style: CSSProperties;
  title: ReactNode;
  description: string;
};

function Caption({
  current,
  layered,
  style,
  title,
  description,
}: CaptionProps) {
  return (
    <div
      aria-hidden
      className={layered ? "absolute" : "relative"}
      style={{
        ...style,
        pointerEvents: current ? "auto" : "none",
        ...(layered
          ? {
              left: PAD_X,
              right: PAD_X,
              top: `calc(${LANDING_HEADER_HEIGHT}px + clamp(20px, 5vh, 56px))`,
            }
          : {}),
      }}
    >
      <p className="text-[clamp(24px,4.2vw,54px)] leading-[1.25] max-md:leading-[1.35] font-extrabold tracking-[-0.04em] text-fg-neutral">
        {title}
      </p>
      <p className="mx-auto mt-[20px] max-w-[720px] text-[clamp(15px,1.8vw,23px)] max-md:text-balance leading-[1.6] font-medium text-fg-neutral-muted">
        {description}
      </p>
    </div>
  );
}

const { events, cumulative, total, highlight: hi } = CHART;
const brand = (text: string) => <span className="text-fg-brand">{text}</span>;

const FIRST = {
  title: "뉴스는 넘쳐나는데,",
  description: "너무 많고 복잡해서, 한 이슈의 흐름을 한눈에 이해하기 어려워요.",
};
const SECOND = {
  title: `기사 ${total}건, 다 읽지 않아도 사건 ${events.length}개로 정리해 흐름을 보여줘요.`,
  // 예시 이슈는 10.30 ~ 11.08 — 열흘
  description: "하나의 이슈를 열흘 동안 다룬 기사들을 시간 순서로 정리했어요.",
};

// 스크롤 연출 ① — 화면에 붙은 채(330svh) 내리는 만큼: 「뉴스는 넘쳐나는데,」 → 가운데 모인 막대가 펼쳐져 사건별 누적 기사 수
// 계단이 되고 → 「기사 354건, 다 읽지 않아도 사건 12개로 정리해 흐름을 보여줘요.」 → 기사가 가장 많은 사건을 점선 · 알약으로
// 강조한다 (프로토타입 v21 · 예시 이슈 80, 2026-11-12 Jira 32). 프로토타입의 UPDATE 강조(F10, MVP 밖)는 바꿨다.
// 화면 문장 · 막대 그림은 스크롤에 따라 바뀌어 화면 읽기에서 빼고, 같은 뜻의 두 문장 · 강조 사건을 처음부터 다 읽히는 숨은 글로 둔다 —
// 화면 읽기는 스크롤과 상관없이 차례로 읽는다. 동작 줄이기면 붙이지 않고 마지막 장면을 보인다
export function IssueChartSection() {
  const ref = useRef<HTMLElement>(null);
  const { progress, pinned } = useScrollProgress(ref);
  const frame = chartFrame(progress);
  const hiBar = frame.bars[hi];
  const hiEvent = events[hi];

  return (
    <section
      ref={ref}
      aria-label="이슈에 쌓인 기사"
      className="relative border-t border-stroke-neutral-weak bg-bg-layer-default"
      style={{ height: pinned ? "330svh" : undefined }}
    >
      <div className="sr-only">
        <h2>{FIRST.title}</h2>
        <p>{FIRST.description}</p>
        <p>{SECOND.title}</p>
        <p>{SECOND.description}</p>
        <p>
          기사가 가장 많은 사건은 {formatEventDate(hiEvent.occurredAt)}{" "}
          {hiEvent.title}, 기사 {hiEvent.articleCount}건이에요.
        </p>
      </div>
      <div
        className={
          pinned
            ? "sticky top-0 flex h-svh flex-col overflow-hidden"
            : "flex flex-col pb-x16"
        }
      >
        <div
          className="relative shrink-0 text-center"
          style={{
            padding: `calc(${LANDING_HEADER_HEIGHT}px + clamp(20px, 5vh, 56px)) ${PAD_X} 0`,
            minHeight: `calc(${LANDING_HEADER_HEIGHT}px + clamp(190px, 30vh, 260px))`,
          }}
        >
          <Caption
            current={frame.step === 0}
            style={{
              opacity: 1 - frame.captionOut,
              transform: `translateY(${-32 * frame.captionOut}px)`,
            }}
            title={FIRST.title}
            description={FIRST.description}
          />
          <Caption
            current={frame.step === 1}
            layered
            style={{
              opacity: frame.captionIn,
              transform: `translateY(${32 * (1 - frame.captionIn)}px)`,
            }}
            title={
              <>
                {brand(`기사 ${total}건`)}, 다 읽지 않아도 <br />
                {brand(`사건 ${events.length}개`)}로 정리해 {brand("흐름")}을
                보여줘요.
              </>
            }
            description={SECOND.description}
          />
        </div>
        <div
          aria-hidden
          data-chart
          // 붙이지 않을 때는 높이를 정해 둔다 — flex-1 의 기준 크기(0)가 높이를 이겨 차트가 접힌다
          className={`relative mx-auto w-full max-w-[1180px] ${pinned ? "flex-1" : "h-[420px]"}`}
        >
          <div className="absolute inset-x-[clamp(28px,8vw,128px)] top-[28px] bottom-0">
            {frame.highlight > 0.02 && (
              <>
                <div
                  className="absolute -top-[28px] bottom-0 z-[2] border-l-[1.5px] border-dotted border-fg-neutral-subtle"
                  style={{ left: `${hiBar.left}%`, opacity: frame.highlight }}
                />
                <div
                  className="absolute -inset-x-[4%] z-[2] border-t-[1.5px] border-dotted border-fg-neutral-subtle"
                  style={{
                    bottom: `${hiBar.height}%`,
                    opacity: frame.highlight,
                  }}
                />
              </>
            )}
            {frame.bars.map((bar, i) => {
              const lit = i === hi && frame.highlight > 0.02;
              const last = i === events.length - 1;
              // 좁은 화면(막대 폭 30px 안팎)에서는 마지막 막대의 숫자 · 날짜만 남긴다. 그 숫자는 막대 위 바깥에 오른쪽 맞춤
              const narrowHidden = last ? "" : "max-md:hidden";
              // 너무 낮은 막대(첫 사건 12건 ≈ 3%)는 숫자를 막대 위, 날짜 위에 올린다 — 안에 두면 바닥선 아래로 삐져나온다
              const short = (cumulative[i] / total) * 86 < 12;
              return (
                <div
                  key={events[i].id}
                  data-bar
                  className={`absolute bottom-0 transition-[background-color,box-shadow] duration-[400ms] ${
                    lit
                      ? "bg-bg-brand-weak shadow-[inset_0_3px_0_var(--color-bg-brand-accent)]"
                      : "bg-bg-neutral-weak"
                  }`}
                  style={{
                    left: `${bar.left}%`,
                    width: `${bar.width}%`,
                    height: `${bar.height}%`,
                  }}
                >
                  <div
                    className={`absolute right-[8px] left-[clamp(8px,1vw,16px)] ${short ? "bottom-[calc(100%+24px)]" : "top-[clamp(8px,1.2vw,16px)]"} ${narrowHidden} ${
                      last
                        ? "max-md:top-auto max-md:right-0 max-md:bottom-[calc(100%+6px)] max-md:left-auto max-md:text-right"
                        : ""
                    }`}
                    style={{ opacity: frame.labels }}
                  >
                    <div
                      className={`leading-[1.15] font-extrabold tracking-[-0.03em] whitespace-nowrap tabular-nums ${
                        last
                          ? "text-[clamp(18px,2vw,30px)] text-fg-neutral"
                          : "text-[clamp(14px,1.4vw,21px)]"
                      } ${lit ? "text-fg-brand" : last ? "" : "text-fg-neutral-subtle"}`}
                    >
                      {cumulative[i]}건
                    </div>
                    <div
                      className={`mt-x1 truncate text-[12px] font-semibold max-md:hidden ${
                        lit ? "text-fg-brand" : "text-fg-neutral-subtle"
                      }`}
                    >
                      {events[i].label}
                    </div>
                  </div>
                  <div
                    className={`absolute right-[clamp(6px,1vw,14px)] bottom-[10px] text-[clamp(11px,1.1vw,15px)] font-semibold text-fg-neutral-subtle tabular-nums ${narrowHidden}`}
                    style={{ opacity: frame.labels }}
                  >
                    {formatEventDate(events[i].occurredAt)}
                  </div>
                </div>
              );
            })}
            {frame.highlight > 0.02 && (
              <>
                {/* 강조 알약 — 점선 세로줄 옆, 차트 위쪽 빈자리(앞쪽 막대가 낮다)에 단다. 막대 숫자를 가리지 않고,
                    좁으면 줄을 바꾼다. 좁은 화면은 앞쪽 62% 안에만 두어 마지막 막대 위 숫자를 가리지 않는다 */}
                <div
                  data-highlight
                  className="absolute top-[4%] z-[3] flex max-w-[var(--pill-max)] flex-wrap max-md:max-w-[62%] items-center gap-x2 gap-y-x1 rounded-[18px] border border-stroke-neutral-weak bg-bg-layer-default py-[9px] pr-x4 pl-[10px] text-[clamp(13px,1.2vw,16px)] font-semibold text-fg-neutral shadow-[0_10px_28px_rgba(17,24,39,.10)]"
                  style={{
                    left: `${hiBar.left}%`,
                    ["--pill-max" as string]: `calc(${100 - hiBar.left}% - 14px)`,
                    opacity: frame.highlight,
                    transform: `translate(14px, ${10 * (1 - frame.highlight)}px)`,
                  }}
                >
                  <span className="rounded-full bg-bg-brand-weak px-[9px] py-[2px] text-[12px] font-bold text-fg-brand">
                    사건
                  </span>
                  <span className="text-fg-neutral-muted tabular-nums">
                    {formatEventDate(hiEvent.occurredAt)}
                  </span>
                  <span>
                    <b className="text-fg-brand">{hiEvent.title}</b> · 기사{" "}
                    {hiEvent.articleCount}건
                  </span>
                </div>
                <span
                  className="absolute z-[3] size-[16px]"
                  style={{
                    left: `${hiBar.left}%`,
                    bottom: `${hiBar.height}%`,
                    opacity: frame.highlight,
                    transform: "translate(-50%, 50%)",
                  }}
                >
                  <span className="absolute top-0 left-[7px] h-[16px] w-[2px] bg-fg-brand" />
                  <span className="absolute top-[7px] left-0 h-[2px] w-[16px] bg-fg-brand" />
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
