import {
  IconArrowUpLine,
  IconBookOpenLine,
  IconChevronDownLine,
} from "@karrotmarket/react-monochrome-icon";
import { useQueryClient } from "@tanstack/react-query";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type DictionaryItem, dictionaryQuery } from "@/api/dictionary";
import { ApiError } from "@/api/error";
import { errorDescription } from "@/components/state/ErrorState";

// 처음에 보이는 뜻 수 (EXPERIENCE.md 「용어사전 창」). 나머지는 *더 보기* 로 편다 — 사전은 흔한 뜻을 뒤에 줘서
// 3개에서 자르면 「사과」의 열매 · 용서 뜻이 가려진다(2026-11-03 사이트에서 확인)
const SHOWN = 3;
// 찾을 단어 길이 상한 — 서버와 같다 (docs/api-screen.md A19)
const MAX_LENGTH = 50;
// 화면 오른쪽 아래에서 떨어진 거리(px) — 프로토타입 v21. 아래쪽은 클래스 bottom-[24px] 로 준다
// (위치 클래스 bottom-x6 등은 SEED 테마에 없다)
const EDGE = 24;

// 말풍선 하나 — 내가 보낸 말 · 찾은 결과 · 실패 안내
type Draft =
  | { kind: "question"; text: string }
  | { kind: "answer"; term: string; items: DictionaryItem[]; source: string }
  | { kind: "failure"; text: string };
type Message = Draft & { id: number };

// 실패 문구 — docs/api.md 2절. RATE_LIMITED 는 입구(Envoy)가 만들어서 코드가 없어도 429 면 같은 문구다.
// 400 은 서버가 화면에 보일 까닭(errors[q])을 줄 때만 그대로 쓴다
function failureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "DICTIONARY_UNAVAILABLE") return "지금은 찾을 수 없어요";
    if (error.code === "RATE_LIMITED" || error.status === 429)
      return "요청이 많아요. 잠시 뒤 다시 시도해 주세요";
    const reason = error.errors.find(({ field }) => field === "q")?.reason;
    if (reason) return reason;
  }
  return errorDescription(error);
}

// 사전은 띄어 써도 되는 자리를 ^, 낱말이 붙은 자리를 - 로 적는다(「구원^투수」 · 「이-자」). 화면에는 ^ 를 띄어 쓰고
// 글자 사이의 - 는 지운다. 맨 앞 · 맨 끝의 - 는 접사 · 어미 · 어간이라는 표시라 남긴다(「-자」 · 「먹-」)
const headword = (word: string) =>
  word.replace(/\^/g, " ").replace(/(?<=[^\s-])-(?=[^\s-])/g, "");

type DictionaryWindowProps = {
  /** 오른쪽에 붙은 패널의 폭(px). 그만큼 왼쪽으로 비킨다 (EXPERIENCE.md 앱 셸 「용어사전 버튼」) */
  inset?: number;
};

// 용어사전 버튼과 창 — F13 용어사전 (EXPERIENCE.md Component Patterns 「용어사전 창」, 프로토타입 v21 GlossaryChat).
// 모달이 아니라서 창을 연 채로 본문을 본다. 대화는 셸이 떠 있는 동안만 남고 어디에도 저장하지 않는다.
// 버튼 · 창은 본문 위, SEED 시트 · 모달 · 서랍(z-index 2) 아래에 뜬다 — 셸의 <main> 이 isolate 라 본문의 z-index 가 새지 않는다
export function DictionaryWindow({ inset = 0 }: DictionaryWindowProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  // 닫은 뒤 버튼으로 포커스를 돌릴까 — 닫을 때 포커스가 창 안에 있었을 때만. 본문에서 Esc 로 닫으면 그 자리에 둔다
  const returnFocus = useRef(false);

  const close = useCallback(() => {
    returnFocus.current =
      windowRef.current?.contains(document.activeElement) ?? false;
    setOpen(false);
  }, []);

  // 열면 입력칸으로, 닫으면 버튼으로 (EXPERIENCE.md Accessibility Floor)
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  // Esc — 맨 위에 열린 것 하나만 닫는다. 순서는 TIP · 검색 목록 → 모달 → 이 창 → 사건 패널 → 서랍
  // (EXPERIENCE.md Interaction Primitives). 먼저 닫은 것이 있으면(preventDefault) 두고, 다른 창 안에서 누른 Esc 는 그쪽 몫이다.
  // document 의 버블 단계라 창 안 요소의 처리 뒤, 사건 패널(window 버블)보다 먼저 닫고 preventDefault 로 알린다
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing || key.defaultPrevented)
        return;
      const layer = (key.target as Element | null)?.closest?.(
        '[role="dialog"]',
      );
      if (layer && layer !== windowRef.current) return;
      key.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // 새 말풍선이 생기면 맨 아래로. *더 보기* 로 펼칠 때는 그 자리에 둔다
  useEffect(() => {
    const body = bodyRef.current;
    body?.scrollTo?.({ top: body.scrollHeight });
  }, [messages, busy, open]);

  const add = (draft: Draft) => {
    const id = nextId.current++;
    setMessages((list) => [...list, { ...draft, id }]);
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const term = text.trim();
    if (term === "" || busy) return;
    setText("");
    setBusy(true);
    add({ kind: "question", text: term });
    queryClient
      .fetchQuery(dictionaryQuery(term))
      .then(
        ({ items, source }) => add({ kind: "answer", term, items, source }),
        (error: unknown) =>
          add({ kind: "failure", text: failureMessage(error) }),
      )
      .finally(() => setBusy(false));
  };

  const right = EDGE + inset;
  // 사건 패널과 같은 곡선 · 시간으로 비킨다. 동작 줄이기를 켜면 바로 옮긴다 (EXPERIENCE.md Interaction Primitives 「모션」)
  const shift =
    "motion-safe:[transition:right_300ms_var(--seed-timing-function-enter),background-color_150ms,scale_150ms]";

  if (!open)
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label="용어 사전 열기"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={{ right }}
        className={`t5-bold fixed bottom-[24px] z-[1] inline-flex h-[48px] items-center gap-x2 rounded-full bg-bg-brand-solid pr-[18px] pl-x4 text-palette-static-white shadow-s3 hover:bg-bg-brand-solid-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring active:scale-[0.96] ${shift}`}
      >
        <IconBookOpenLine aria-hidden size={18} />
        <span>용어 사전</span>
      </button>
    );

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-labelledby={titleId}
      style={{ right }}
      className={`fixed bottom-[24px] z-[1] flex h-[min(480px,calc(100dvh-120px))] w-[min(360px,calc(100vw-48px))] origin-bottom-right flex-col overflow-hidden rounded-r5 border border-stroke-neutral-weak bg-bg-layer-floating shadow-s3 motion-safe:animate-[newlearn-dictionary-in_200ms_var(--seed-timing-function-enter)] ${shift}`}
    >
      <div className="flex items-center gap-x2_5 border-b border-stroke-neutral-weak py-x3 pr-x3 pl-x4">
        <span
          aria-hidden
          className="flex size-x8 shrink-0 items-center justify-center rounded-full bg-bg-brand-weak text-fg-brand"
        >
          <IconBookOpenLine size={16} />
        </span>
        <h2 id={titleId} className="t5-bold text-fg-neutral">
          용어 사전
        </h2>
        <button
          type="button"
          aria-label="용어 사전 접기"
          title="접기 (Esc)"
          onClick={close}
          className="ml-auto flex size-x8 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconChevronDownLine aria-hidden size={18} />
        </button>
      </div>

      {/* 새 말풍선을 읽어 준다 (EXPERIENCE.md Accessibility Floor) */}
      <div
        ref={bodyRef}
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-x3 overflow-y-auto px-x3_5 py-x4"
      >
        <Bubble>모르는 용어를 입력하면 뜻을 알려드려요.</Bubble>
        {messages.map((message) =>
          message.kind === "question" ? (
            <p
              key={message.id}
              className="t4-bold max-w-[80%] self-end rounded-[16px_16px_4px_16px] bg-bg-brand-weak px-x3_5 py-x2 break-keep wrap-break-word text-fg-neutral"
            >
              {message.text}
            </p>
          ) : message.kind === "answer" ? (
            <Answer key={message.id} {...message} />
          ) : (
            <Bubble key={message.id}>{message.text}</Bubble>
          ),
        )}
        {busy && (
          <div className="flex gap-x1 self-start rounded-[16px_16px_16px_4px] bg-bg-neutral-weak px-x4 py-[14px]">
            <span className="sr-only">찾는 중</span>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                aria-hidden
                style={{ animationDelay: `${delay}ms` }}
                className="size-[6px] rounded-full bg-fg-neutral-subtle motion-safe:animate-[newlearn-dictionary-dot_1s_ease-in-out_infinite]"
              />
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={send}
        className="flex items-center gap-x2 border-t border-stroke-neutral-weak px-x3 pt-x2_5 pb-x3"
      >
        <input
          ref={inputRef}
          type="text"
          aria-label="용어 입력"
          placeholder="예: 금리"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="t5-regular h-[44px] min-w-0 flex-1 rounded-full border border-stroke-neutral-weak bg-bg-layer-default px-x4 text-fg-neutral outline-none placeholder:text-fg-placeholder focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        />
        <button
          type="submit"
          aria-label="보내기"
          disabled={text.trim() === "" || busy}
          className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-bg-brand-solid text-palette-static-white transition-colors enabled:hover:bg-bg-brand-solid-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring disabled:bg-bg-neutral-weak disabled:text-fg-neutral-subtle"
        >
          <IconArrowUpLine aria-hidden size={18} />
        </button>
      </form>
    </div>
  );
}

// 사전 쪽 말풍선
function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="t4-regular max-w-[88%] self-start rounded-[16px_16px_16px_4px] bg-bg-neutral-weak px-x3_5 py-x2_5 break-keep wrap-break-word text-fg-neutral">
      {children}
    </div>
  );
}

// 찾은 결과 — 3개까지 보이고 나머지는 *더 보기* 로 편다. 출처는 결과와 함께 꼭 보인다(CC BY-SA, docs/api-screen.md A19)
function Answer({
  term,
  items,
  source,
}: {
  term: string;
  items: DictionaryItem[];
  source: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstHiddenRef = useRef<HTMLLIElement>(null);

  // 펼치면 새로 보인 첫 뜻으로 포커스 — 누른 버튼은 사라진다
  useEffect(() => {
    if (expanded) firstHiddenRef.current?.focus();
  }, [expanded]);

  if (items.length === 0)
    return (
      <Bubble>{`'${term}'의 뜻을 찾지 못했어요. 다른 표현으로 물어봐 주세요.`}</Bubble>
    );

  const shown = expanded ? items : items.slice(0, SHOWN);
  const hidden = items.length - shown.length;
  return (
    <Bubble>
      <ul aria-label={`'${term}'의 뜻`}>
        {shown.map((item, index) => (
          <li
            // 같은 표제어(동음이의어)가 여럿이라 차례로 가른다. 목록은 바뀌지 않는다
            key={index}
            ref={index === SHOWN ? firstHiddenRef : undefined}
            tabIndex={index === SHOWN ? -1 : undefined}
            className={`outline-none ${index > 0 ? "mt-x2_5 border-t border-stroke-neutral-weak pt-x2_5" : ""}`}
          >
            <p className="flex flex-wrap items-baseline gap-x-x1_5">
              <strong className="t5-bold text-fg-neutral">
                {headword(item.word)}
              </strong>
              {item.pos && (
                <span className="t2-regular text-fg-neutral-subtle">
                  {item.pos}
                </span>
              )}
            </p>
            <p className="mt-x1">{item.definition}</p>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          aria-label={`'${term}' 뜻 ${hidden}개 더 보기`}
          onClick={() => setExpanded(true)}
          className="t3-bold mt-x2_5 rounded-r1 text-fg-brand hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          {hidden}개 더 보기
        </button>
      )}
      <p className="t2-regular mt-x2_5 text-fg-neutral-subtle">
        출처: {source}
      </p>
    </Bubble>
  );
}
