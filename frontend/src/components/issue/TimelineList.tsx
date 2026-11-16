import type { ReactNode } from "react";
import type { TimelineEvent } from "@/api/timeline";
import { latestEventId } from "@/components/issue/timelineLayout";
import { LANE_NAME, useTimelineTip } from "@/components/issue/TimelineTip";
import {
  isTextDragClick,
  meaningProps,
} from "@/components/meaning/meaningProps";
import {
  enterAt,
  GROW_Y,
  RIPPLE_ONCE,
  RISE,
  SPRING_IN,
} from "@/components/motion/screenMotion";
import { MeaningGuide } from "@/components/meaning/MeaningGuide";
import { formatFullDate, formatTimelineDates } from "@/lib/date";

// 열 때 나오는 차례(ms) — 메인 흐름 선이 위에서 아래로 같은 빠르기로 자라며 그 자리의 사건이 튀어나오고 글이 떠오른다.
// 사건마다 90ms 씩 늘되 1초에서 멈춘다 — 다 나오기까지 2초가 안 걸리게 (가로 지도 Timeline 과 같은 움직임)
const START = 200;
const PER_EVENT = 90;
const SPAN_MAX = 1000;
const TEXT_AFTER = 80;
const MONTH_BEFORE = 60;

type TimelineListProps = {
  /** A4 사건 — occurredAt · id 오름차순 */
  events: TimelineEvent[];
  selectedId: number | null;
  onSelect: (eventId: number) => void;
  /** 「이슈 흐름」 아래 — 기간 · 사건 · 기사 수 */
  summary?: ReactNode;
};

type ListedEvent = TimelineEvent & {
  index: number;
  dateLabel: string;
  estimated: boolean;
};

// 「08.21 추정」
const dateText = (event: ListedEvent) =>
  event.estimated ? `${event.dateLabel} 추정` : event.dateLabel;
// 「기사 5건」 — 0이면 뺀다 (EXPERIENCE.md Voice and Tone)
const articlesText = (event: ListedEvent) =>
  event.articleCount > 0 ? `기사 ${event.articleCount}건` : null;
const joined = (separator: string, ...parts: (string | null)[]) =>
  parts.filter(Boolean).join(separator);

/** 달로 묶는다 — 첫 달과 해가 바뀐 달은 「2026년 8월」, 나머지는 「9월」 (가로 지도 시간축과 같다) */
function byMonth(events: ListedEvent[]) {
  const months: { key: string; label: string; items: ListedEvent[] }[] = [];
  let year: string | null = null;
  for (const event of events) {
    const [y, m] = formatFullDate(event.occurredAt).split(".");
    const key = `${y}-${m}`;
    if (months.at(-1)?.key !== key) {
      months.push({
        key,
        label: y === year ? `${Number(m)}월` : `${y}년 ${Number(m)}월`,
        items: [],
      });
      year = y;
    }
    months.at(-1)!.items.push(event);
  }
  return months;
}

// F07 사건 중심 이슈 에볼루션 맵의 좁은 화면 보기 — 가로 지도 대신 위에서 아래로 읽는 세로 타임라인 (DESIGN.md Timeline 패턴).
// 메인 흐름 사건은 세로 2px 민트 선 위에, 서브 흐름 사건은 16px 들여쓰고 선에서 점선으로 갈라진다. 제목 · 날짜 · 기사 수를
// 줄이지 않고 다 보인다 — 폰에서 가로 지도는 라벨이 잘리고 옆으로 계속 밀어야 했다 (2026-11-05 사용자).
// 누르면 그 사건을 고른다 — 사건 시트는 이슈 화면이 연다
export function TimelineList({
  events,
  selectedId,
  onSelect,
  summary,
}: TimelineListProps) {
  const tip = useTimelineTip({
    panelClassName:
      "absolute top-full right-0 z-20 mt-x2 w-[min(300px,calc(100vw-40px))]",
    howTo: "사건을 누르면 그 사건의 기사를 아래에서 보여 줘요.",
  });
  const dates = formatTimelineDates(events.map((event) => event.occurredAt));
  // 최신 사건 — 노드를 짙은 청록으로 칠한다. 가로 지도와 같은 규칙 (2026-11-16 디자인 피드백, Jira 216)
  const latestId = latestEventId(events);
  const listed: ListedEvent[] = events.map((event, index) => ({
    ...event,
    index,
    dateLabel: dates[index],
    estimated: event.occurredAtBasis === "FIRST_PUBLISHED",
  }));
  const span = Math.min(SPAN_MAX, PER_EVENT * Math.max(0, events.length - 1));
  const enterOf = (index: number) =>
    Math.round(
      START + (events.length > 1 ? (index / (events.length - 1)) * span : 0),
    );

  return (
    <section aria-labelledby="timeline-title" className="px-x5 pt-x5 pb-[96px]">
      <div className="relative flex items-start gap-x3">
        <div className="min-w-0 flex-1">
          <h2 id="timeline-title" className="t6-bold text-fg-neutral">
            이슈 흐름
          </h2>
          {summary && (
            <p className="t3-regular mt-x0_5 text-fg-neutral-muted tabular-nums">
              {summary}
            </p>
          )}
        </div>
        {/* 용어사전 안내 — TIP 왼쪽 (2026-11-12 사용자 QA, Jira 197) */}
        <MeaningGuide />
        {tip.button}
        {tip.panel}
      </div>
      <div role="group" aria-label="사건 타임라인" className="relative mt-x5">
        {/* 메인 흐름 선 — 사건 사이 관계가 아니라 레인 자리다 (DESIGN.md timeline-rail). 위에서 아래로 자란다.
            위치는 px 로 준다 — SEED 테마에는 top-x3 같은 위치 클래스가 없다 */}
        <span
          data-rail
          aria-hidden
          className={`absolute top-[12px] bottom-[12px] left-[13px] z-[1] w-[2px] rounded-full bg-bg-brand-accent ${GROW_Y}`}
          style={{
            animationDelay: `${START}ms`,
            animationDuration: `${span || 300}ms`,
            animationTimingFunction: "linear",
          }}
        />
        {byMonth(listed).map((month, monthIndex) => (
          <section key={month.key} aria-labelledby={`timeline-${month.key}`}>
            <h3
              id={`timeline-${month.key}`}
              className={`t3-bold relative z-[2] ml-[36px] text-fg-neutral-subtle ${monthIndex === 0 ? "" : "mt-x4"} ${RISE}`}
              style={enterAt(
                Math.max(0, enterOf(month.items[0].index) - MONTH_BEFORE),
              )}
            >
              {month.label}
            </h3>
            <ol className="mt-x1 flex flex-col gap-x1">
              {month.items.map((event) => (
                <li key={event.id}>
                  <EventRow
                    event={event}
                    selected={event.id === selectedId}
                    latest={event.id === latestId}
                    enterAt={enterOf(event.index)}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

type EventRowProps = {
  event: ListedEvent;
  selected: boolean;
  latest: boolean;
  enterAt: number;
  onSelect: (eventId: number) => void;
};

// 사건 한 줄 — 날짜 · 기사 수, 그 아래 제목 전체. 노드는 선 위(메인) 또는 들여쓴 자리(서브)에 둔다.
// 최신 사건 노드는 짙은 청록이다. 고르면 노드 채움은 그대로 두고 둘레에 짙은 청록 고리, 줄 바탕이 옅은 민트, 둘레에 파문이 번진다
// (DESIGN.md 타임라인 노드, 2026-11-16 디자인 피드백 · Jira 216 — 전에는 고르면 짙은 청록으로 채워 최신 사건과 헷갈렸다).
// 누르는 동안 살짝 줄어든다 — 누르는 면이 하나라서다 (EXPERIENCE.md 「호버 · 눌림」)
function EventRow({
  event,
  selected,
  latest,
  enterAt: at,
  onSelect,
}: EventRowProps) {
  const main = event.lane !== "SUB";
  const fill = latest ? "bg-bg-brand-solid" : "bg-bg-brand-accent";
  const node = main
    ? `-mt-[6px] -ml-[6px] size-[12px] rounded-[3px] ${fill} shadow-[0_0_0_3px_var(--seed-color-bg-layer-default)]`
    : latest
      ? "-mt-[5px] -ml-[5px] size-[10px] rounded-[3px] bg-bg-brand-solid"
      : "-mt-[5px] -ml-[5px] size-[10px] rounded-[3px] border-2 border-palette-gray-600 bg-palette-static-white";
  return (
    <button
      type="button"
      data-event-id={event.id}
      data-coach="event"
      data-lane={main ? "MAIN" : "SUB"}
      data-latest={latest || undefined}
      aria-current={selected ? "true" : undefined}
      aria-label={joined(
        ", ",
        `${dateText(event)} ${event.title}`,
        LANE_NAME[main ? "MAIN" : "SUB"],
        articlesText(event),
        latest ? "최신 사건" : null,
      )}
      // 사건 제목을 드래그한 끝의 클릭(용어사전)은 사건 고르기가 아니다
      onClick={(click) => {
        if (!isTextDragClick(click)) onSelect(event.id);
      }}
      className={`relative flex w-full flex-col gap-x0_5 rounded-r3 py-x3 pr-x3 text-left select-text transition-[background-color,scale] duration-[var(--seed-duration-color-transition)] ease-[var(--seed-timing-function-easing)] focus-visible:outline-2 focus-visible:outline-stroke-focus-ring motion-safe:active:scale-[0.98] ${main ? "pl-[36px]" : "pl-[56px]"} ${selected ? "bg-bg-brand-weak" : "hover:bg-bg-layer-default-pressed"}`}
    >
      {/* 서브 흐름 — 메인 흐름 선에서 2px 점선으로 갈라진다 */}
      {!main && (
        <span
          data-branch-line
          aria-hidden
          className="absolute top-[21px] left-[15px] z-[1] w-[18px] border-t-2 border-dashed border-palette-gray-500"
        />
      )}
      {/* 노드 — 선 끝이 지나갈 때 튀어나온다. 크기 0 인 자리의 가운데를 기준으로 그린다 */}
      <span
        aria-hidden
        className={`absolute top-[21px] z-[2] size-0 ${main ? "left-[14px]" : "left-[38px]"} ${SPRING_IN}`}
        style={enterAt(at)}
      >
        {selected && (
          <>
            <span
              className={`absolute -mt-[8px] -ml-[8px] size-[16px] rounded-[4px] border-2 border-bg-brand-solid ${RIPPLE_ONCE}`}
            />
            <span
              data-selected-ring
              className="absolute -mt-[10px] -ml-[10px] size-[20px] rounded-[5px] border-2 border-bg-brand-solid bg-bg-brand-weak"
            />
          </>
        )}
        <span
          data-node
          className={`absolute block transition-colors duration-[var(--seed-duration-color-transition)] ${node}`}
        />
      </span>
      <span
        className={`t2-regular text-fg-neutral-muted tabular-nums ${RISE}`}
        style={enterAt(at + TEXT_AFTER)}
      >
        {joined(" · ", dateText(event), articlesText(event))}
      </span>
      <span
        className={`${main ? "t5-bold" : "t4-bold"} ${selected ? "text-fg-brand" : "text-fg-neutral"} select-text ${RISE}`}
        style={enterAt(at + TEXT_AFTER)}
        {...meaningProps("EVENT", event.id)}
      >
        {event.title}
      </span>
    </button>
  );
}
