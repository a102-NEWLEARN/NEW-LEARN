import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { BottomSheet } from "@seed-design/react";
import { useEffect, useRef } from "react";
import { EventPanel } from "@/components/issue/EventPanel";

type EventDetailPaneProps = {
  eventId: number;
  /** 767px 이하 — 아래에서 올라오는 시트로 연다 */
  narrow: boolean;
  /** 화면 안에서 사건을 골라 열었나. 그때만 열면서 패널 제목으로 포커스를 옮긴다 (주소로 처음 열 때는 셸 규칙대로 두기) */
  focusOnOpen: boolean;
  onClose: () => void;
  onSelectEvent: (eventId: number) => void;
};

// 사건 패널의 자리 (EXPERIENCE.md 앱 셸 「오른쪽 패널」 · Responsive) — 넓은 화면은 본문 오른쪽에 붙는 420px 패널이고
// 본문을 덮지 않는다. 좁은 화면은 아래에서 올라오는 시트(화면 높이 85%, 뒤는 딤)로 SEED BottomSheet 가 맡는다.
// 닫기: X · Esc · 시트 바깥. 타임라인 빈 곳은 이슈 화면이 맡는다
export function EventDetailPane({
  eventId,
  narrow,
  focusOnOpen,
  onClose,
  onSelectEvent,
}: EventDetailPaneProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 열면 포커스를 패널 제목으로 (Accessibility Floor). 이전 · 다음으로 사건만 바꿀 때는 그대로 둔다
  useEffect(() => {
    if (focusOnOpen && !narrow) headingRef.current?.focus();
    // 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사건이 바뀌면 패널을 맨 위로
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [eventId]);

  // 넓은 화면의 Esc — 맨 위에 열린 것 하나만 닫는다. TIP(팝오버)은 캡처 단계에서 먼저 닫고 preventDefault 한다.
  // 서랍 같은 다른 창 안에서 누른 Esc 는 그쪽 몫이다 (EXPERIENCE.md Interaction Primitives)
  useEffect(() => {
    if (narrow) return;
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing || key.defaultPrevented)
        return;
      if ((key.target as Element | null)?.closest?.('[role="dialog"]')) return;
      key.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [narrow, onClose]);

  const panel = (
    <EventPanel
      eventId={eventId}
      onSelectEvent={onSelectEvent}
      headingRef={headingRef}
    />
  );

  if (narrow)
    return (
      <BottomSheet.Root
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content style={{ height: "85dvh" }}>
            <BottomSheet.Header>
              <BottomSheet.Title className="sr-only">
                사건 상세
              </BottomSheet.Title>
            </BottomSheet.Header>
            <BottomSheet.CloseButton aria-label="상세 패널 닫기">
              <IconXmarkLine aria-hidden />
            </BottomSheet.CloseButton>
            <BottomSheet.Body>
              <div ref={scrollRef} className="pb-x10">
                {panel}
              </div>
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </BottomSheet.Root>
    );

  return (
    <aside
      aria-label="사건 상세"
      className="relative flex w-[420px] max-w-[50%] shrink-0 flex-col border-l border-stroke-neutral-weak bg-bg-layer-default motion-safe:animate-[newlearn-panel-in_300ms_cubic-bezier(0.2,0.8,0.2,1)]"
    >
      <button
        type="button"
        aria-label="상세 패널 닫기"
        title="닫기 (Esc)"
        onClick={onClose}
        className="absolute top-x4 right-x4 z-10 flex size-x10 items-center justify-center rounded-r2 bg-bg-layer-default text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
      >
        <IconXmarkLine aria-hidden size={20} />
      </button>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-x6 pt-x6 pb-x12"
      >
        {panel}
      </div>
    </aside>
  );
}
