import {
  IconExclamationmarkCircleLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { enterAt, RISE } from "@/components/motion/screenMotion";

// 닫은 것을 기억하는 자리 — 이 브라우저에만 남는다. 못 쓰면(사생활 보호 창 · 막힌 저장소) 화면마다 다시 뜬다
const CLOSED_KEY = "newlearn.meaningGuide.closed";

function readClosed() {
  try {
    return window.localStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberClosed() {
  try {
    window.localStorage.setItem(CLOSED_KEY, "1");
  } catch {
    // 기억하지 못해도 이 화면에서는 닫힌다
  }
}

// 기사 · 이슈 화면이 다 그려진 뒤에 떠오른다. 아이콘으로 다시 열 때는 바로 뜬다
const GUIDE_AT = 600;
// 말풍선 폭 상한과 화면 왼쪽에 남길 틈
const BUBBLE_MAX = 380;
const EDGE = 16;

type MeaningGuideProps = {
  className?: string;
};

// F13 용어사전 안내 — ! 아이콘 아래에 「모르는 단어는 드래그하면 뜻을 알려줘요!」 말풍선을 처음부터 띄운다.
// 용어사전은 버튼 없이 드래그해야 열려서(EXPERIENCE.md 용어사전 말풍선) 있는 줄 모르는 사람이 많았다.
// X 로 닫으면 말풍선만 사라지고 아이콘이 남아, 누르면 다시 뜬다. 닫은 것은 이 브라우저에 기억한다
// (2026-11-12 사용자 QA, Jira 197). 페이지의 포커스는 가져가지 않는다 — 가만히 떠 있는 안내다
export function MeaningGuide({ className = "" }: MeaningGuideProps) {
  const [open, setOpen] = useState(() => !readClosed());
  const [delay, setDelay] = useState(GUIDE_AT);
  const iconRef = useRef<HTMLButtonElement>(null);
  const bubbleId = useId();

  // 말풍선은 아이콘 오른쪽 끝에 붙어 왼쪽으로 자란다. 아이콘 오른쪽에 크게 보기 · TIP 이 있으면 좁은 화면에서 왼쪽이 잘려서,
  // 폭을 아이콘 오른쪽 끝에서 화면 왼쪽 16px 까지로 줄인다 — 글이 꺾인다 (Jira 197 리뷰). 잴 수 없으면(jsdom) CSS 상한만 쓴다
  const [room, setRoom] = useState<number | null>(null);
  const measure = useCallback(() => {
    const right = iconRef.current?.getBoundingClientRect().right ?? 0;
    setRoom(right > EDGE ? Math.min(BUBBLE_MAX, right - EDGE) : null);
  }, []);
  // 그릴 때마다 잰다 — 옆에 크게 보기 버튼이 늦게 생기면(마인드맵을 받은 뒤) 아이콘 자리가 바뀐다. 같은 값이면 다시 그리지 않는다
  useLayoutEffect(() => {
    if (open) measure();
  });
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  const close = () => {
    setOpen(false);
    rememberClosed();
  };

  return (
    <div
      data-coach="glossary"
      className={`relative flex shrink-0 ${className}`}
    >
      <button
        ref={iconRef}
        type="button"
        aria-label="용어사전 안내"
        title="용어사전 안내"
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        onClick={() => {
          if (open) return close();
          setDelay(0);
          setOpen(true);
        }}
        className={`flex size-x9 items-center justify-center rounded-r2 transition-colors hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${open ? "text-fg-brand" : "text-fg-neutral-muted hover:text-fg-neutral"}`}
      >
        <IconExclamationmarkCircleLine aria-hidden size={18} />
      </button>
      {open && (
        <div
          id={bubbleId}
          role="note"
          className={`absolute top-full right-0 z-20 mt-x2 w-max max-w-[min(380px,calc(100vw-32px))] ${RISE}`}
          style={{ ...enterAt(delay), maxWidth: room ?? undefined }}
        >
          {/* 아이콘을 가리키는 꼬리 */}
          <span
            aria-hidden
            className="absolute -top-[5px] right-[15px] size-[10px] rotate-45 border-t border-l border-stroke-neutral-weak bg-bg-layer-floating"
          />
          <div className="flex items-center gap-x2 rounded-r3 border border-stroke-neutral-weak bg-bg-layer-floating py-x2_5 pr-x1_5 pl-x3 shadow-s3">
            <IconExclamationmarkCircleLine
              aria-hidden
              size={16}
              className="shrink-0 text-fg-brand"
            />
            <p className="t4-medium text-fg-neutral">
              모르는 단어는 드래그하면 뜻을 알려줘요!
            </p>
            <button
              type="button"
              aria-label="안내 닫기"
              onClick={() => {
                close();
                iconRef.current?.focus();
              }}
              className="flex size-x7 shrink-0 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
            >
              <IconXmarkLine aria-hidden size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
