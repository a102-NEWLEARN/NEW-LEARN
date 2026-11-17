import { IconArrowUpRightLine } from "@karrotmarket/react-monochrome-icon";
import type { ReactNode } from "react";
import { AiBadge } from "@/components/AiBadge";
import {
  SAMPLE_ARTICLE,
  SAMPLE_BRANCHES,
  SAMPLE_EVENT,
  SAMPLE_EVENT_ARTICLES,
  SAMPLE_ISSUE,
} from "@/components/landing/landingSample";
import { Reveal } from "@/components/landing/Reveal";
import { formatFullDate, formatFullDateTime } from "@/lib/date";

// 04 칸의 예시 — 마인드맵 반응 가지의 잎 글에서 고른 말과 그 사전 뜻. 실제 뜻풀이는 GMS 가 그 글의 문맥으로 만든다(A26)
const TERM_SENTENCE = SAMPLE_BRANCHES.find((b) => b.type === "REACTION")!
  .items[1];
const TERM = "탈취";
const TERM_MEANING = "남의 것을 억지로 빼앗아 가짐.";

function OriginalLink() {
  return (
    <div>
      <p className="text-[13px] text-fg-neutral-muted">
        {SAMPLE_ARTICLE.publisher} ·{" "}
        {formatFullDateTime(SAMPLE_ARTICLE.publishedAt)}
      </p>
      <p className="mt-[6px] text-[clamp(16px,1.5vw,20px)] leading-[1.45] font-bold text-fg-neutral">
        {SAMPLE_ARTICLE.title}
      </p>
      <p className="mt-[10px] inline-flex items-center gap-x1 text-[15px] font-bold text-fg-brand">
        언론사 원문 보기
        <IconArrowUpRightLine aria-hidden className="size-[15px]" />
      </p>
    </div>
  );
}

function EventArticles() {
  return (
    <div>
      <div className="flex items-center gap-x2">
        <span className="rounded-full bg-bg-brand-weak px-[9px] py-[3px] text-[12px] font-bold text-fg-brand">
          사건
        </span>
        <span className="text-[13px] text-fg-neutral-muted tabular-nums">
          사건 발생 {formatFullDate(SAMPLE_EVENT.occurredAt)}
        </span>
        <span className="ml-auto text-[13px] font-bold text-fg-neutral-muted">
          기사 {SAMPLE_EVENT.articleCount}건
        </span>
      </div>
      <p className="mt-[8px] text-[clamp(16px,1.5vw,20px)] font-bold text-fg-neutral">
        {SAMPLE_EVENT.title}
      </p>
      <ul className="mt-[10px] flex flex-col divide-y divide-stroke-neutral-weak border-t border-stroke-neutral-weak">
        {SAMPLE_EVENT_ARTICLES.slice(0, 3).map((article) => (
          <li key={article.id} className="py-[8px]">
            <p className="truncate text-[14px] font-semibold text-fg-neutral">
              {article.title}
            </p>
            <p className="mt-[2px] text-[12px] text-fg-neutral-subtle tabular-nums">
              {article.publisher} · {formatFullDateTime(article.publishedAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiSummary() {
  return (
    <div>
      <div className="flex items-center gap-x2">
        <span className="text-[13px] font-bold text-fg-neutral-muted">
          이슈 요약
        </span>
        <AiBadge />
      </div>
      <p className="mt-[8px] text-[clamp(15px,1.4vw,18px)] leading-[1.7] text-fg-neutral">
        {SAMPLE_ISSUE.summary}
      </p>
    </div>
  );
}

// 지금 앱의 드래그 → 「의미」 말풍선을 그대로 그린 그림 (F13 용어사전, components/meaning/MeaningBubble.tsx)
function MeaningExample() {
  const [before, after] = TERM_SENTENCE.split(TERM);
  return (
    <div>
      <p className="text-[clamp(15px,1.4vw,18px)] leading-[1.7] text-fg-neutral">
        {before}
        <span className="rounded-[3px] bg-bg-brand-weak px-[2px] font-bold text-fg-brand">
          {TERM}
        </span>
        {after}
      </p>
      <div className="mt-[12px] flex flex-wrap items-start gap-x2">
        <span className="rounded-full border border-stroke-neutral-weak bg-bg-layer-default px-x3 py-x1 text-[13px] font-bold text-fg-neutral shadow-[0_2px_8px_rgba(17,24,39,.08)]">
          의미
        </span>
        <div className="max-w-[320px] rounded-[14px] border border-stroke-neutral-weak bg-bg-layer-default px-x4 py-x3 shadow-[0_8px_24px_rgba(17,24,39,.10)]">
          <p className="flex items-baseline gap-x2">
            <span className="text-[16px] font-bold text-fg-neutral">
              {TERM}
            </span>
            <span className="text-[12px] text-fg-neutral-subtle">명사</span>
          </p>
          <p className="mt-x1 text-[14px] leading-[1.6] text-fg-neutral">
            {TERM_MEANING}
          </p>
        </div>
      </div>
    </div>
  );
}

// 네 칸 — 번호 · 이름 · 설명 · 그림. UPDATE 칸(F10 근거 기반 변화 카드, MVP 밖)은 사건마다 관련 기사(F08)로 바꿨다
const ITEMS: readonly [string, string, ReactNode][] = [
  [
    "원문으로 바로",
    "본문 전체는 싣지 않아요. 기사마다 언론사 원문 페이지로 바로 이어줘요.",
    <OriginalLink key="1" />,
  ],
  [
    "사건마다 관련 기사",
    "이슈 흐름에서 사건을 누르면, 그 사건을 다룬 여러 언론사 기사를 발행 순으로 모아 보여줘요.",
    <EventArticles key="2" />,
  ],
  [
    "AI가 쓴 건 AI 생성",
    "AI가 정리한 요약에는 ‘AI 생성’을 붙여, 기사에 적힌 내용과 구분해요.",
    <AiSummary key="3" />,
  ],
  [
    "모르는 말은 드래그해서",
    "기사 제목이나 마인드맵 글에서 모르는 말을 드래그하고 ‘의미’를 누르면, 그 글의 문맥에 맞는 뜻을 알려줘요.",
    <MeaningExample key="4" />,
  ],
];

// 근거와 신뢰 — 「요약보다 근거를 먼저, 판단은 읽는 사람에게.」 아래 두 줄 두 칸 (프로토타입 v21, 좁은 화면은 한 줄).
// 칸은 화면에 들어오면 70ms 씩 늦게 떠오른다
export function TrustSection() {
  return (
    <section
      id="trust"
      aria-labelledby="landing-trust"
      className="border-t border-stroke-neutral-weak bg-bg-layer-default"
    >
      <div className="mx-auto max-w-[1280px] px-[clamp(20px,10vw,176px)] py-[clamp(80px,8vw,112px)]">
        <Reveal>
          <h2
            id="landing-trust"
            className="text-center text-[clamp(24px,3.6vw,48px)] leading-[1.3] font-extrabold tracking-[-0.04em] text-fg-neutral"
          >
            요약보다 근거를 먼저, <br />
            판단은 읽는 사람에게.
          </h2>
        </Reveal>
        <div className="mt-[clamp(40px,5vw,64px)] grid grid-cols-1 gap-x-[clamp(32px,6vw,96px)] gap-y-[clamp(56px,6vw,80px)] md:grid-cols-2">
          {ITEMS.map(([title, description, visual], i) => (
            <div key={title}>
              <Reveal delay={i * 70}>
                <div className="border-t-2 border-fg-neutral pt-[22px]">
                  <h3 className="flex items-baseline gap-x3">
                    <span className="text-[15px] font-extrabold text-fg-brand tabular-nums">
                      {`0${i + 1}`}
                    </span>
                    <span className="text-[clamp(19px,2vw,28px)] font-extrabold tracking-[-0.03em] text-fg-neutral">
                      {title}
                    </span>
                  </h3>
                  <p className="mt-[10px] text-[16px] leading-[1.7] text-fg-neutral-muted max-md:text-[14px]">
                    {description}
                  </p>
                  <div className="mt-[22px]">{visual}</div>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
