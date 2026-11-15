import { IconChevronDownLine } from "@karrotmarket/react-monochrome-icon";
import { useId, useState } from "react";
import { Reveal } from "@/components/landing/Reveal";

// 질문과 답 — 프로토타입 v21 의 넷을 MVP 사실에 맞췄다(분야 5개 · 네 갈래 정리 · 사건 묶기 · 드래그 용어사전).
// UPDATE(F10) · 원문 근거 문장(F05)은 MVP 밖이라 말하지 않는다
const QA: readonly [string, string][] = [
  [
    "어떤 기사를 볼 수 있나요?",
    "NewsData.io 로 모은 국내 언론사 기사를 정치 · 경제 · 사회 · 국제 · IT·과학 다섯 분야로 보여줘요.",
  ],
  [
    "AI는 기사를 어떻게 정리하나요?",
    "기사마다 핵심 내용 · 원인·배경 · 반응 · 전망 네 갈래로 나눠 흐름지도와 마인드맵으로 보여줘요. AI가 만든 내용에는 ‘AI 생성’ 표시가 붙어요.",
  ],
  [
    "같은 사건을 다룬 기사는 어떻게 묶이나요?",
    "기사 내용을 비교해 같은 사건을 다룬 기사를 하나의 사건으로 묶어요. 사건이 쌓이면 하나의 이슈가 되고, 이슈 흐름에서 사건을 누르면 관련 기사를 발행 순으로 볼 수 있어요.",
  ],
  [
    "모르는 낱말은 어떻게 찾나요?",
    "기사 제목 · 마인드맵 잎 · 이슈와 사건 글에서 모르는 말을 드래그하고 ‘의미’를 누르면, 그 글의 문맥에 맞는 뜻을 보여줘요. 로그인하면 쓸 수 있어요.",
  ],
];

// 자주 묻는 질문 — 펼침 목록. 처음에는 첫 질문이 펼쳐져 있고, 하나를 펼치면 앞의 것은 접힌다 (프로토타입 v21).
// 답은 180ms 에 나타나고 꺾쇠는 돈다. 동작 줄이기면 돌지 않고 바로 나타난다
export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(24px,3vw,32px)]">
      <section
        id="faq"
        aria-labelledby={`${baseId}-title`}
        className="py-[clamp(80px,8vw,104px)]"
      >
        <Reveal>
          <h2
            id={`${baseId}-title`}
            className="text-center text-[clamp(24px,3.6vw,44px)] leading-[1.3] font-extrabold tracking-[-0.04em] text-fg-neutral"
          >
            자주 묻는 질문
          </h2>
        </Reveal>
        <div className="mt-[36px] border-t border-stroke-neutral-weak">
          {QA.map(([question, answer], i) => {
            const expanded = open === i;
            const answerId = `${baseId}-answer-${i}`;
            return (
              <div
                key={question}
                className="border-b border-stroke-neutral-weak"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={answerId}
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex w-full items-center gap-x3 px-x1 py-[22px] text-left text-[18px] font-bold max-md:py-[20px] max-md:text-[16px] text-fg-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
                >
                  <span className="flex-1">{question}</span>
                  <IconChevronDownLine
                    aria-hidden
                    className={`size-[20px] shrink-0 text-fg-neutral-muted duration-200 motion-safe:transition-transform ease-[var(--seed-timing-function-easing)] ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {expanded && (
                  <p
                    id={answerId}
                    className="px-x1 pb-[24px] text-[16px] leading-[1.75] max-md:text-[14px] text-fg-neutral-muted motion-safe:animate-[newlearn-fade-in_180ms_var(--seed-timing-function-enter)_backwards]"
                  >
                    {answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
