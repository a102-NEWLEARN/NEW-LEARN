import { Fragment, useRef, useState } from "react";
import { FlowPreview } from "@/components/landing/FlowPreview";
import {
  howScene,
  STEP_TARGETS,
  VIEW_TARGETS,
} from "@/components/landing/howScene";
import { clamp01, lerp } from "@/components/landing/issueChart";
import {
  LANDING_HEADER_HEIGHT,
  scrollBehavior,
} from "@/components/landing/LandingHeader";
import {
  SAMPLE_EVENT,
  SAMPLE_EVENT_ARTICLES,
  SAMPLE_EVENTS,
} from "@/components/landing/landingSample";
import { MindmapPreview } from "@/components/landing/MindmapPreview";
import { useScrollProgress } from "@/components/landing/useScrollProgress";
import { useElementSize } from "@/components/issue/useElementSize";
import { formatEventDate, formatFullDate } from "@/lib/date";

/** 이슈 흐름 그림 — 예시 이슈의 앞 사건 여섯 */
const TIMELINE = [...SAMPLE_EVENTS]
  .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  .slice(0, 6);
/** 흩어진 기사 카드 — 가운데에서 가로 · 세로(px) · 기울기(도) (프로토타입 값) */
const SCATTER = [
  [-34, -180, -2.4],
  [36, -90, 1.8],
  [-22, 0, -1.2],
  [44, 90, 2.2],
  [-10, 180, -1.6],
] as const;
/** 단계 이름과 「…로 이동」 꼴(받침에 따라 로 · 으로) */
const STEPS = [
  ["사건 추출", "사건 추출로"],
  ["사건 연결", "사건 연결로"],
  ["흐름지도·마인드맵", "흐름지도·마인드맵으로"],
] as const;

// 단계마다 문장 — 프로토타입의 「달라진 주장에는 UPDATE」(F10) · 「원문 근거 문장」(F05)은 MVP 밖이라 지웠다
const CAPTIONS: readonly [
  eyebrow: string,
  title: string[],
  description: string,
][] = [
  [
    "같은 사건, 여러 언론사의 기사",
    [`기사 ${SAMPLE_EVENT.articleCount}건이`],
    "언론사마다 제목과 관점은 달라도, 모두 바이낸스 해킹이라는 같은 사건을 다룬 기사예요.",
  ],
  [
    "1단계 · 사건 추출",
    ["사건 하나로", "묶이고"],
    "AI가 기사에서 사건을 추출하고, 같은 사건을 다룬 기사는 하나로 묶어요. 사건을 누르면 그 기사들을 발행 순으로 볼 수 있어요.",
  ],
  [
    "2단계 · 사건 연결",
    ["이슈의 흐름 위에", "놓여요"],
    "사건을 날짜순으로 이어 이슈 흐름을 만들어요. 큰 줄기는 메인 흐름, 곁가지는 서브 흐름으로 나눠 보여줘요.",
  ],
  [
    "3단계 · 흐름지도 / 마인드맵",
    ["기사 하나도", "한눈에 펼쳐요"],
    "기사를 무슨 일이? · 왜 일어났나? · 누가 뭐라고 했나? · 앞으로는? 순서의 흐름지도와 마인드맵으로 보여줘요. AI가 만든 내용에는 ‘AI 생성’ 표시가 붙어요.",
  ],
];

const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";

// 스크롤 연출 ② 「어떻게 정리하나요」 — 화면에 붙은 채(410svh) 내리는 만큼: 흩어진 기사 카드 다섯이 겹쳐 모이고 →
// 사건 카드 하나가 되고(1단계 사건 추출) → 이슈 흐름 위에 놓이고(2단계 사건 연결) → 기사 흐름지도 · 마인드맵 미리보기가
// 나온다(3단계). 왼쪽은 단계 막대와 문장, 오른쪽은 그림 (프로토타입 v21 · 예시 사건 1450 · 기사 55961, 2026-11-12 Jira 32).
// 단계 번호와 보기 버튼을 누르면 그 자리로 내린다. 동작 줄이기면 붙이지 않고 마지막 장면(3단계 · 마인드맵)을 보이며, 그때 보기 버튼은
// 미리보기를 바로 바꾸고 단계 번호는 누르지 않는 표시다(옮길 장면이 없다). 화면 문장은 스크롤에 따라 바뀌어 화면 읽기에서 빼고,
// 네 단계 문장을 처음부터 다 읽히는 숨은 목록으로 둔다 — 화면 읽기는 스크롤과 상관없이 차례로 읽는다
export function HowSection() {
  const ref = useRef<HTMLElement>(null);
  const { progress, pinned } = useScrollProgress(ref);
  const s = howScene(progress);
  // 붙이지 않을 때 보기 버튼으로 고른 미리보기
  const [chosenView, setChosenView] = useState<"flow" | "map">("map");
  const view = pinned ? s.view : chosenView;
  const jump = (target: number) => {
    const section = ref.current;
    if (!section || !pinned) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: top + target * (section.offsetHeight - window.innerHeight),
      behavior: scrollBehavior(),
    });
  };
  // 미리보기(폭 560)는 그림 칸의 폭 · 높이에 맞춰 줄인다. 높이는 흐름지도 525 · 마인드맵 440 어림(프로토타입은 근거 인용 칸까지 615).
  // 잴 수 없으면(jsdom) 프로토타입처럼 화면 높이로 어림한다
  const visual = useRef<HTMLDivElement>(null);
  const size = useElementSize(visual);
  const height = size.height || Math.min(520, 0.62 * window.innerHeight);
  const previewScale = Math.max(
    0.45,
    Math.min(
      0.92,
      (size.width || 560) / 560,
      (height - 58) / (view === "map" ? 440 : 525),
    ),
  );

  return (
    <section
      ref={ref}
      id="how"
      aria-labelledby="landing-how"
      className="relative border-t border-stroke-neutral-weak bg-bg-layer-default"
      style={{ height: pinned ? "410svh" : undefined }}
    >
      <h2 id="landing-how" className="sr-only">
        어떻게 정리하나요
      </h2>
      <ol aria-label="정리하는 차례" className="sr-only">
        {CAPTIONS.map(([eyebrow, title, description]) => (
          <li key={eyebrow}>
            {eyebrow} — {title.join(" ")}. {description}
          </li>
        ))}
      </ol>
      <div
        className={
          pinned
            ? "sticky top-0 flex h-svh items-center overflow-hidden"
            : "flex items-center py-x16"
        }
      >
        <div
          className="mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-x1 px-[clamp(20px,7vw,128px)] md:grid-cols-[minmax(0,1fr)_minmax(0,520px)] md:gap-[56px]"
          style={{ paddingTop: LANDING_HEADER_HEIGHT }}
        >
          <div className="relative min-w-0">
            <ol
              aria-label="정리 단계"
              className="relative mb-x8 h-[66px] max-w-[440px] max-md:mb-x4"
            >
              <span
                aria-hidden
                className="absolute top-[13px] right-[14px] left-[14px] h-[3px] rounded-[2px] bg-stroke-neutral-weak"
              />
              <span
                aria-hidden
                className="absolute top-[13px] left-[14px] h-[3px] rounded-[2px] bg-bg-brand-accent"
                style={{ width: `calc((100% - 28px) * ${s.track})` }}
              />
              {STEPS.map(([label, toLabel], i) => {
                const reached = s.step >= i + 1;
                const on = s.step === i + 1;
                const circle = `inline-flex size-[29px] items-center justify-center rounded-full border-[2.5px] text-[13px] font-extrabold transition-[background-color,border-color,color,box-shadow] duration-[250ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring ${
                  reached
                    ? "border-bg-brand-accent bg-bg-brand-accent text-palette-static-white"
                    : "border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral-subtle"
                } ${on ? "shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-bg-brand-accent)_18%,transparent)]" : ""}`;
                return (
                  <li
                    key={label}
                    aria-current={on ? "step" : undefined}
                    className="absolute top-0 flex flex-col gap-x2"
                    style={{
                      left: `${[0, 50, 100][i]}%`,
                      transform: `translateX(${["0%", "-50%", "-100%"][i]})`,
                      alignItems: ["flex-start", "center", "flex-end"][i],
                    }}
                  >
                    {pinned ? (
                      <button
                        type="button"
                        aria-label={`${i + 1}단계 ${toLabel} 이동`}
                        onClick={() => jump(STEP_TARGETS[i])}
                        className={circle}
                      >
                        {i + 1}
                      </button>
                    ) : (
                      <span className={circle}>{i + 1}</span>
                    )}
                    <span
                      className={`text-[14px] font-bold whitespace-nowrap transition-colors duration-[250ms] ${
                        on
                          ? "text-fg-brand"
                          : reached
                            ? "text-fg-neutral"
                            : "text-fg-neutral-subtle"
                      }`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="relative min-h-[clamp(200px,32vh,320px)]">
              {CAPTIONS.map(([eyebrow, title, description], i) => (
                <div
                  key={i}
                  aria-hidden
                  className={i ? "absolute inset-x-0 top-0" : "relative"}
                  style={{
                    opacity: s.step === i ? 1 : 0,
                    transform:
                      s.step === i
                        ? "none"
                        : `translateY(${i < s.step ? -28 : 28}px)`,
                    transition: `opacity 380ms ${EASE_OUT}, transform 520ms ${EASE_OUT}`,
                    pointerEvents: s.step === i ? "auto" : "none",
                  }}
                >
                  <p className="text-[clamp(17px,1.5vw,20px)] font-extrabold text-fg-brand">
                    {eyebrow}
                  </p>
                  <p className="mt-[14px] text-[clamp(32px,4.8vw,64px)] leading-[1.18] font-extrabold tracking-[-0.045em] text-fg-neutral">
                    {title.map((line, k) => (
                      <Fragment key={line}>
                        {k > 0 && <br />}
                        {line}
                      </Fragment>
                    ))}
                  </p>
                  <p className="mt-[20px] max-w-[460px] text-[17px] leading-[1.7] text-fg-neutral-muted max-md:mt-x3 max-md:text-[15px]">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div
            ref={visual}
            className="relative h-[min(520px,62vh)] min-w-0 max-md:h-[min(420px,52vh)]"
          >
            {s.cardsFade < 1 &&
              SAMPLE_EVENT_ARTICLES.map((article, i) => {
                const [x0, y0, r0] = SCATTER[i % SCATTER.length];
                const x = lerp(x0, 0, s.gather);
                const y = lerp(y0, (i - 2) * 9, s.gather);
                const r = lerp(r0, 0, s.gather);
                const scale = lerp(
                  1,
                  1 - (SAMPLE_EVENT_ARTICLES.length - 1 - i) * 0.02,
                  s.gather,
                );
                return (
                  <div
                    key={article.id}
                    data-card
                    className="absolute top-[42%] left-1/2 w-[min(420px,88%)] rounded-[14px] border border-stroke-neutral-weak bg-bg-layer-default px-[18px] pt-[13px] pb-[14px] shadow-[0_8px_24px_rgba(17,24,39,.08)]"
                    style={{
                      transform: `translate(-50%,-50%) translate(${x}px,${y}px) rotate(${r}deg) scale(${scale})`,
                      opacity: 1 - s.cardsFade,
                      zIndex: i,
                    }}
                  >
                    <div className="flex items-center gap-x2 text-[12px] font-bold">
                      <span className="text-fg-neutral">
                        {article.publisher}
                      </span>
                      <span className="font-medium text-fg-neutral-subtle tabular-nums">
                        발행 {formatEventDate(article.publishedAt)}
                      </span>
                      <span
                        className="ml-auto size-[8px] rounded-[2px] bg-bg-brand-accent"
                        style={{ opacity: s.gather }}
                      />
                    </div>
                    <p className="mt-[5px] truncate text-[16px] font-bold tracking-[-0.01em] text-fg-neutral">
                      {article.title}
                    </p>
                  </div>
                );
              })}
            {s.event * (1 - s.preview) > 0.01 && (
              <div
                data-event-card
                className="absolute top-[42%] left-1/2 z-[10] w-[min(420px,92%)] rounded-[18px] border border-stroke-neutral-weak bg-bg-layer-default px-x5 pt-[18px] pb-x5 shadow-[inset_0_4px_0_var(--color-bg-brand-accent),0_16px_40px_rgba(17,24,39,.12)]"
                style={{
                  transform: `translate(-50%,-50%) translateY(${lerp(0, -70, s.timeline)}px) scale(${lerp(0.9, 1, s.event)})`,
                  opacity: s.event * (1 - s.preview),
                }}
              >
                <div className="flex items-center gap-x2">
                  <span className="rounded-full bg-bg-brand-weak px-[9px] py-[3px] text-[12px] font-bold text-fg-brand">
                    사건
                  </span>
                  <span className="text-[13px] text-fg-neutral-muted tabular-nums">
                    사건 발생 {formatFullDate(SAMPLE_EVENT.occurredAt)}
                  </span>
                </div>
                <p className="mt-[10px] text-[19px] leading-[1.4] font-extrabold tracking-[-0.02em] text-fg-neutral">
                  {SAMPLE_EVENT.title}
                </p>
                <div className="mt-[14px] flex flex-wrap items-center gap-[6px]">
                  {SAMPLE_EVENT_ARTICLES.map((article, j) => {
                    const k = clamp01((s.event - 0.3 - j * 0.12) / 0.25);
                    return (
                      <span
                        key={article.id}
                        className={`rounded-[7px] px-[9px] py-x1 text-[12px] font-semibold transition-colors duration-300 ${
                          k > 0.9
                            ? "bg-bg-brand-weak text-fg-brand"
                            : "bg-bg-neutral-weak text-fg-neutral"
                        }`}
                        style={{
                          opacity: k,
                          transform: `translateY(${lerp(6, 0, k)}px)`,
                        }}
                      >
                        {article.publisher}
                      </span>
                    );
                  })}
                  <span className="ml-auto text-[13px] font-bold text-fg-neutral-muted">
                    기사 {SAMPLE_EVENT.articleCount}건
                  </span>
                </div>
              </div>
            )}
            {s.timeline * (1 - s.preview) > 0.01 && (
              <div
                aria-hidden
                className="absolute inset-x-0 top-[calc(42%+110px)]"
                style={{
                  opacity: s.timeline * (1 - s.preview),
                  transform: `translateY(${lerp(24, 0, s.timeline)}px)`,
                }}
              >
                <div className="relative mx-[36px] h-[96px]">
                  <div className="absolute inset-x-0 top-[23px] h-[3px] rounded-[2px] bg-stroke-neutral-weak" />
                  <div
                    className="absolute top-[23px] left-0 h-[3px] rounded-[2px] bg-bg-brand-accent"
                    style={{ width: `${s.fill * 100}%` }}
                  />
                  {TIMELINE.map((event, i) => {
                    const at = i / (TIMELINE.length - 1);
                    const reached = s.fill > 0.01 && s.fill + 0.02 >= at;
                    const on = event.id === SAMPLE_EVENT.id;
                    return (
                      <div
                        key={event.id}
                        className="absolute top-0 flex w-[76px] flex-col items-center gap-[6px]"
                        style={{
                          left: `${at * 100}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        <span className="h-[16px]" />
                        <span
                          className={`box-border rounded-[5px] border-[2.5px] transition-[background-color,border-color,box-shadow] duration-[250ms] ${
                            on ? "-mt-[2px] size-[18px]" : "size-[14px]"
                          } ${
                            reached
                              ? "border-bg-brand-accent bg-bg-brand-accent"
                              : "border-stroke-neutral-weak bg-bg-layer-default"
                          } ${
                            on && reached
                              ? "shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-bg-brand-accent)_20%,transparent)]"
                              : ""
                          }`}
                        />
                        <span
                          className={`text-[12px] font-bold tabular-nums transition-colors duration-[250ms] ${
                            reached
                              ? "text-fg-neutral"
                              : "text-fg-neutral-subtle"
                          }`}
                        >
                          {formatEventDate(event.occurredAt)}
                        </span>
                        <span
                          className={`max-w-[76px] truncate text-[11px] transition-colors duration-[250ms] max-md:hidden ${
                            reached
                              ? "text-fg-neutral-muted"
                              : "text-fg-neutral-subtle"
                          }`}
                        >
                          {event.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {s.preview > 0.02 && (
              <div
                className="absolute inset-0 z-[12] flex flex-col items-center gap-x3"
                style={{ opacity: s.preview }}
              >
                <div
                  role="group"
                  aria-label="보기 방식"
                  className="flex shrink-0 gap-[2px] rounded-[12px] bg-bg-neutral-weak p-[3px]"
                >
                  {(["flow", "map"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={view === option}
                      onClick={() =>
                        pinned
                          ? jump(VIEW_TARGETS[option])
                          : setChosenView(option)
                      }
                      className={`h-[34px] rounded-[9px] px-x4 text-[14px] font-bold transition-[background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${
                        view === option
                          ? "bg-bg-layer-default text-fg-neutral shadow-[0_1px_3px_rgba(17,24,39,.12)]"
                          : "text-fg-neutral-muted"
                      }`}
                    >
                      {option === "flow" ? "흐름지도" : "마인드맵"}
                    </button>
                  ))}
                </div>
                <div className="relative min-h-0 w-full flex-1">
                  <div
                    key={view}
                    className="absolute top-0 left-1/2 w-[560px] origin-top motion-safe:animate-[newlearn-fade-in_260ms_var(--seed-timing-function-enter)_backwards]"
                    style={{
                      transform: `translateX(-50%) translateY(${lerp(24, 0, s.preview)}px) scale(${previewScale})`,
                    }}
                  >
                    {view === "flow" ? <FlowPreview /> : <MindmapPreview />}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
