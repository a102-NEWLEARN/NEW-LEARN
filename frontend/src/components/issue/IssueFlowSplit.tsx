import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { TimelineEvent } from "@/api/timeline";
import { EventPanel } from "@/components/issue/EventPanel";
import { latestEventId } from "@/components/issue/timelineLayout";
import { TimelineEvents } from "@/components/issue/TimelineList";
import { useTimelineTip } from "@/components/issue/TimelineTip";
import { MeaningGuide } from "@/components/meaning/MeaningGuide";

type IssueFlowSplitProps = {
  /** A4 사건 — occurredAt · id 오름차순 */
  events: TimelineEvent[];
  /** 주소의 ?event=. 없으면 null — 그때는 최신 사건을 보인다 */
  selectedId: number | null;
  onSelect: (eventId: number) => void;
  /** 「이슈 흐름」 옆 — 기간 · 사건 · 기사 수 */
  summary?: ReactNode;
  /** 도구줄의 「세로 | 지도」 */
  viewSwitch?: ReactNode;
};

const rowSelector = (eventId: number) =>
  `[data-event-id="${eventId}"]` as const;

// F07 사건 중심 이슈 에볼루션 맵의 넓은 화면 세로 보기 (Jira 221) — 왼쪽은 폰과 같은 세로 타임라인, 오른쪽은 고른 사건 내용
// (F08 사건 패널 내용)을 닫기 없이 붙박이로 둔다. 두 칸은 따로 스크롤한다. 「흐름을 한눈에 보기엔 세로가 편하다」는 피드백.
// 주소에 사건이 없으면 최신 사건을 보이되 주소에는 남기지 않는다 — 사용자가 고를 때만 이슈 화면이 ?event= 를 붙인다.
// 포커스: 왼쪽에서 고르면 오른쪽 사건 제목으로 옮기고(패널을 열 때와 같은 규칙), 오른쪽 안에서 Esc 면 고른 사건 줄로 돌린다
export function IssueFlowSplit({
  events,
  selectedId,
  onSelect,
  summary,
  viewSwitch,
}: IssueFlowSplitProps) {
  const shownId = selectedId ?? latestEventId(events);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 왼쪽 목록에서 골랐나 — 그 사건이 그려지면 오른쪽 제목으로 포커스를 옮긴다. 이전 · 다음은 버튼에 포커스가 남는다
  const focusHeading = useRef(false);
  const tip = useTimelineTip({
    panelClassName: "absolute top-[12px] right-[12px] z-20 w-[300px]",
    howTo: "사건을 누르면 오른쪽에 그 사건의 요약과 기사를 보여 줘요.",
  });

  const selectFromList = (eventId: number) => {
    // 처음 골라 둔 최신 사건을 다시 누르면 보이는 사건은 그대로라 바로 옮긴다
    if (eventId === shownId) headingRef.current?.focus();
    else focusHeading.current = true;
    onSelect(eventId);
  };

  // 사건이 바뀌면 오른쪽을 맨 위로 — 다만 이전 · 다음 버튼처럼 오른쪽 안에 포커스가 있으면 그 자리를 둔다 (EventDetailPane 과 같다).
  // 그다음 왼쪽에서 고른 것이면 제목으로 포커스
  useLayoutEffect(() => {
    const box = detailRef.current;
    if (box && !box.contains(document.activeElement))
      box.scrollTo?.({ top: 0 });
    if (focusHeading.current) {
      focusHeading.current = false;
      headingRef.current?.focus();
    }
  }, [shownId]);

  // 주소로 연 사건 · 이전 · 다음으로 바꾼 사건이 왼쪽 목록 밖이면 그 줄이 보이게 목록 칸만 스크롤한다.
  // 처음 골라 둔 최신 사건(selectedId 가 null)은 스크롤하지 않는다 — 목록은 첫 사건부터 보인다
  useEffect(() => {
    const box = listRef.current;
    const row =
      selectedId === null
        ? null
        : box?.querySelector<HTMLElement>(rowSelector(selectedId));
    if (!box || !row) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < boxRect.top) box.scrollTop -= boxRect.top - rowRect.top;
    else if (rowRect.bottom > boxRect.bottom)
      box.scrollTop += rowRect.bottom - boxRect.bottom;
  }, [selectedId]);

  // 오른쪽 안에서 Esc — 닫을 것이 없어 고른 사건 줄로 포커스를 돌린다. TIP(캡처 단계에서 먼저 닫고 preventDefault)과
  // 다른 창(dialog) 안에서 누른 Esc 는 그쪽 몫이다 (EXPERIENCE.md Interaction Primitives, EventDetailPane 과 같은 거름)
  const onDetailKeyDown = (key: KeyboardEvent<HTMLElement>) => {
    if (
      key.key !== "Escape" ||
      key.nativeEvent.isComposing ||
      key.defaultPrevented ||
      shownId === null
    )
      return;
    if (
      (key.target as Element).closest?.('[role="dialog"], [role="alertdialog"]')
    )
      return;
    key.preventDefault();
    listRef.current?.querySelector<HTMLElement>(rowSelector(shownId))?.focus();
  };

  return (
    <section
      aria-labelledby="timeline-title"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-r3 border border-stroke-neutral-subtle"
    >
      <div className="flex flex-wrap items-center gap-x2 border-b border-stroke-neutral-subtle bg-bg-layer-default px-x4 py-x2_5">
        <div className="mr-auto flex flex-wrap items-baseline gap-x2_5">
          <h2 id="timeline-title" className="t6-bold text-fg-neutral">
            이슈 흐름
          </h2>
          {summary && (
            <span className="t4-regular text-fg-neutral-muted tabular-nums">
              {summary}
            </span>
          )}
        </div>
        {viewSwitch}
        {/* 용어사전 안내 — TIP 왼쪽 (2026-11-12 사용자 QA, Jira 197) */}
        <MeaningGuide />
        {tip.button}
      </div>
      <div className="relative flex min-h-0 flex-1">
        {/* 왼쪽 칸 — 카드의 42%, 300~440px. 넓은 화면 최소 폭에서도 오른쪽이 380px 안팎 남는다 */}
        <div
          ref={listRef}
          data-flow-list
          className="w-[42%] max-w-[440px] min-w-[300px] shrink-0 overflow-y-auto border-r border-stroke-neutral-subtle px-x3 pt-x5 pb-x10"
        >
          <TimelineEvents
            events={events}
            selectedId={shownId}
            onSelect={selectFromList}
          />
        </div>
        <aside
          ref={detailRef}
          aria-label="사건 상세"
          onKeyDown={onDetailKeyDown}
          className="min-w-0 flex-1 overflow-y-auto bg-bg-layer-default px-x8 pt-x6 pb-x12"
        >
          {shownId !== null && (
            <EventPanel
              eventId={shownId}
              onSelectEvent={onSelect}
              headingRef={headingRef}
            />
          )}
        </aside>
        {tip.panel}
      </div>
    </section>
  );
}
