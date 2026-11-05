import {
  IconQuestionmarkCircleLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import type { TimelineLane } from "@/api/timeline";

export const LANE_NAME: Record<TimelineLane, string> = {
  MAIN: "메인 흐름",
  SUB: "서브 흐름",
};
export const LANE_MEANING: Record<TimelineLane, string> = {
  MAIN: "상황을 바꾸는 행위(발생 · 결정 · 발표 · 결과 · 공식 조치)",
  SUB: "다른 사건에 대한 반응 · 평가 · 여론(논평 · 성명 · 여론조사)",
};

type TimelineTipOptions = {
  /** TIP 창 자리 — 그 보기의 위치 클래스 */
  panelClassName: string;
  /** 다루는 법 한 줄 — 가로 지도는 휠 · 끌기, 세로 타임라인은 누르기 */
  howTo: string;
};

// 이슈 흐름 TIP — 레인 뜻 · 「추정」 뜻 · 다루는 법. 가로 지도(Timeline)와 좁은 화면 세로 타임라인(TimelineList)이 같이 쓴다.
// 버튼과 창을 따로 돌려줘서 각 보기가 제자리에 둔다
export function useTimelineTip({ panelClassName, howTo }: TimelineTipOptions) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // TIP 을 닫으면 포커스를 연 버튼으로 돌린다 (EXPERIENCE.md Accessibility Floor)
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  // 열면 포커스를 창 안으로. 열려 있는 동안 누른 Esc 는 이 창을 닫는다. 다만 서랍처럼 다른 창(dialog) 안에서 누른
  // Esc 는 그쪽 몫이다 — 맨 위에 열린 것 하나만 닫는다 (EXPERIENCE.md Interaction Primitives)
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing) return;
      const layer = (key.target as Element | null)?.closest?.(
        '[role="dialog"]',
      );
      if (layer && layer !== panelRef.current) return;
      key.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    // 캡처 단계 — 오른쪽 사건 패널(이슈 화면의 버블 단계 Esc)보다 먼저 TIP 을 닫고 preventDefault 로 알린다
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const button = (
    <ActionButton
      ref={buttonRef}
      variant="neutralOutline"
      size="small"
      className="border-stroke-neutral-weak"
      aria-expanded={open}
      onClick={() => (open ? close() : setOpen(true))}
    >
      <IconQuestionmarkCircleLine aria-hidden size={16} />
      TIP
    </ActionButton>
  );

  const panel = open && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="타임라인 TIP"
      className={`rounded-r4 border border-stroke-neutral-weak bg-bg-layer-floating p-x4 shadow-s3 ${panelClassName}`}
    >
      <div className="flex items-center">
        <p className="t5-bold flex items-center gap-x1_5 text-fg-neutral">
          <IconQuestionmarkCircleLine
            aria-hidden
            size={16}
            className="text-fg-brand"
          />
          타임라인 TIP
        </p>
        <button
          type="button"
          ref={closeRef}
          aria-label="TIP 닫기"
          onClick={close}
          className="ml-auto flex size-x7 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconXmarkLine aria-hidden size={16} />
        </button>
      </div>
      <p className="t3-bold mt-x3 text-fg-neutral">레인 뜻</p>
      <ul className="t3-regular mt-x1_5 flex flex-col gap-x1_5 text-fg-neutral-muted">
        {(["MAIN", "SUB"] as const).map((key) => (
          <li key={key}>
            <b className="font-semibold text-fg-neutral">{LANE_NAME[key]}</b> —{" "}
            {LANE_MEANING[key]}
          </li>
        ))}
      </ul>
      <p className="t3-bold mt-x3 text-fg-neutral">사건 표시</p>
      <ul className="t3-regular mt-x1_5 flex flex-col gap-x1_5 text-fg-neutral-muted">
        <li>
          날짜 뒤 「추정」은 발생 시점을 첫 기사가 나온 때로 채운 사건이에요.
        </li>
        <li>
          기사 수는 숫자로만 보여 줘요. 위치나 크기로 중요도를 나타내지 않아요.
        </li>
        <li>{howTo}</li>
      </ul>
    </div>
  );

  return { button, panel };
}
