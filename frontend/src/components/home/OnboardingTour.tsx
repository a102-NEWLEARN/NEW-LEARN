import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ActionButton } from "seed-design/ui/action-button";

// 가이드를 띄울지 기억하는 자리 — 가입을 마치면 「pending」, 끝내거나 건너뛰면 「done」. 이 브라우저에만 남는다.
// 저장소를 못 쓰면(사생활 보호 창 · 막힌 저장소) 가이드를 띄우지 않는다 — 끄지 못한 가이드가 계속 뜨지 않게
export const ONBOARDING_KEY = "newlearn.onboarding";

function read() {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return null;
  }
}

function write(value: "pending" | "done") {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, value);
  } catch {
    // 기억하지 못하면 다음에도 뜨지 않는다(read 가 null)
  }
}

/** 가입을 마쳤다 — 다음에 홈에 들어오면 가이드를 띄운다 (SignupPage) */
export function startOnboarding() {
  write("pending");
}

type Step = {
  /** 비출 대상의 data-tour 값. 없거나 화면에 없으면 말풍선을 가운데에 둔다 */
  target?: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: "search",
    title: "무엇이든 검색해요",
    body: "이슈 · 사건 · 기사를 한 번에 찾아요. 어디서든 Ctrl+K(맥은 ⌘K)로 바로 열 수 있어요.",
  },
  {
    target: "issues",
    title: "관심 분야의 이슈예요",
    body: "같은 사건을 다룬 기사를 묶은 이슈예요. 누르면 사건이 어떻게 이어졌는지 흐름으로 보여줘요.",
  },
  {
    target: "articles",
    title: "기사는 마인드맵으로 정리돼요",
    body: "기사를 누르면 AI 가 핵심 내용 · 원인·배경 · 반응 · 전망 네 갈래로 정리한 흐름지도와 마인드맵이 열려요.",
  },
  {
    title: "모르는 단어는 드래그해요",
    body: "기사 · 이슈 화면에서 모르는 단어를 드래그하면 그 글에 맞는 뜻을 알려줘요.",
  },
];

// 대상 둘레 여백 · 화면 가장자리 여백 · 대상과 말풍선 사이 · 말풍선 폭
const PAD = 8;
const EDGE = 16;
const GAP = 14;
const WIDTH = 320;
// 말풍선이 차지할 높이(어림) — 이만큼 자리가 있어야 대상 아래 · 위에 둔다
const BUBBLE_ROOM = 200;

type Box = { top: number; left: number; width: number; height: number };

// 처음 가입한 사람 가이드 — 홈에 들어오면 화면을 어둡게 덮고 검색 → 추천 이슈 → 최신 기사를 차례로 비추며 말풍선으로
// 알려 준다. 마지막은 용어사전 드래그(가운데). *다음* · *건너뛰기* · Esc. 한 번 끝내면 다시 뜨지 않는다
// (2026-11-13 사용자 QA 1, Jira 204). 창(role="dialog", aria-modal)이라 포커스는 두 버튼 안에서만 돈다
export function OnboardingTour() {
  const [step, setStep] = useState<number | null>(() =>
    read() === "pending" ? 0 : null,
  );
  const [box, setBox] = useState<Box | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const close = () => {
    write("done");
    setStep(null);
  };

  // 대상을 화면 가운데로 옮기고 자리를 잰다. 화면 크기가 바뀌거나 스크롤하면 다시 잰다
  const target = step === null ? undefined : STEPS[step].target;
  useLayoutEffect(() => {
    if (step === null) return;
    const element = target
      ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      : null;
    element?.scrollIntoView?.({ block: "center" });
    const measure = () => {
      const rect = element?.getBoundingClientRect();
      setBox(
        rect && rect.width > 0 && rect.height > 0
          ? {
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }
          : null,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, target]);

  useEffect(() => {
    if (step !== null) nextRef.current?.focus();
  }, [step]);

  // Esc — 건너뛰기와 같다
  useEffect(() => {
    if (step === null) return;
    const onKeyDown = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing) return;
      key.preventDefault();
      write("done");
      setStep(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  if (step === null) return null;
  const { title, body } = STEPS[step];
  const last = step === STEPS.length - 1;

  // 포커스를 두 버튼 안에서 돌린다
  const trapTab = (key: KeyboardEvent<HTMLDivElement>) => {
    if (key.key !== "Tab") return;
    const buttons = [
      ...key.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = key.shiftKey
      ? (at - 1 + buttons.length) % buttons.length
      : (at + 1) % buttons.length;
    key.preventDefault();
    buttons[next]?.focus();
  };

  // 말풍선 자리 — 대상 아래에 자리가 있으면 아래, 없으면 위. 가로는 대상 왼쪽에 맞추되 화면 안으로
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - EDGE * 2);
  let place: CSSProperties;
  if (box) {
    const left = Math.min(Math.max(EDGE, box.left), vw - width - EDGE);
    const below = box.top + box.height + GAP;
    // 아래도 위도 자리가 없으면(대상이 화면만큼 크면) 화면 아래쪽에 대상 위로 겹쳐 둔다 — 말풍선이 화면 밖으로 잘리지 않게
    if (below + BUBBLE_ROOM <= vh) place = { top: below, left, width };
    else if (box.top - GAP - BUBBLE_ROOM >= EDGE)
      place = { bottom: vh - box.top + GAP, left, width };
    else place = { bottom: EDGE, left, width };
  } else {
    place = {
      top: "50%",
      left: "50%",
      width,
      transform: "translate(-50%, -50%)",
    };
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {box ? (
        // 비추는 자리 — 큰 그림자로 둘레를 어둡게 덮는다. 누르기는 아래 투명 막이 받는다
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-r4 shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ring-2 ring-palette-static-white transition-all duration-300 ease-[var(--seed-timing-function-easing)]"
          style={box}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgb(0_0_0/0.55)]" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-centered={box ? undefined : ""}
        onKeyDown={trapTab}
        className="fixed rounded-r4 bg-bg-layer-default p-x5 shadow-[0_12px_32px_rgb(0_0_0/0.2)]"
        style={place}
      >
        <p className="t2-bold text-fg-brand tabular-nums">
          {`${step + 1} / ${STEPS.length}`}
        </p>
        <h2 id={titleId} className="t5-bold mt-x1 text-fg-neutral">
          {title}
        </h2>
        <p id={bodyId} className="t4-regular mt-x1_5 text-fg-neutral-muted">
          {body}
        </p>
        <div className="mt-x4 flex items-center justify-between gap-x2">
          <ActionButton variant="ghost" size="small" onClick={close}>
            건너뛰기
          </ActionButton>
          <ActionButton
            ref={nextRef}
            variant="brandSolid"
            size="small"
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {last ? "시작하기" : "다음"}
          </ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
