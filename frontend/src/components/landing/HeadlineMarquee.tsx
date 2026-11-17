import { HEADLINES } from "@/components/landing/landingSample";
import { Reveal } from "@/components/landing/Reveal";

// 두 줄로 나눈 제목 — 앞 반, 뒤 반
const HALF = Math.ceil(HEADLINES.length / 2);
const ROWS = [HEADLINES.slice(0, HALF), HEADLINES.slice(HALF)] as const;

// 한 바퀴 시간 · 방향 (프로토타입 im-lx-mq 70s · 거꾸로 80s). 같은 제목을 두 번 이어 절반만큼 옮기면 끊김 없이 돈다
const ROW_MOTION = [
  "motion-safe:animate-[newlearn-marquee_70s_linear_infinite]",
  "motion-safe:animate-[newlearn-marquee_80s_linear_infinite_reverse]",
] as const;

/** 양끝을 흐리게 가린다 */
const EDGE_FADE =
  "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)";

// 「같은 사건, 다른 제목」 — 기사 한 편으로는 전개를 알기 어렵다는 말 아래로 운영 기사 제목이 두 줄로 흘러간다
// (프로토타입 v21, 2026-11-12 Jira 32). 제목 띠는 장식이라 화면 읽기에서 뺀다. 동작 줄이기면 멈춘다
export function HeadlineMarquee() {
  return (
    <section
      aria-label="같은 사건, 다른 제목"
      className="border-t border-stroke-neutral-weak pt-[clamp(72px,8vw,104px)] pb-[clamp(56px,6vw,72px)]"
    >
      <Reveal>
        <h2 className="mx-auto px-[clamp(24px,3vw,32px)] text-center text-[clamp(24px,4.4vw,56px)] leading-[1.28] max-md:leading-[1.35] font-extrabold tracking-[-0.04em] text-fg-neutral">
          기사 한 편만으로는 <br />
          사건의 전체 전개를 알기 어려워요.
        </h2>
      </Reveal>
      <div
        aria-hidden
        className="mt-[clamp(36px,5vw,56px)] flex flex-col gap-[18px]"
      >
        {ROWS.map((row, r) => (
          <div
            key={r}
            className="overflow-hidden"
            style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
          >
            <div
              data-marquee
              className={`flex w-max gap-[48px] ${ROW_MOTION[r]}`}
            >
              {[...row, ...row].map((headline, i) => (
                <span
                  key={i}
                  className="flex items-center gap-[10px] whitespace-nowrap"
                >
                  <span className="text-[13px] font-bold text-fg-neutral-subtle">
                    {headline.publisher}
                  </span>
                  <span className="text-[clamp(15px,1.6vw,21px)] font-semibold text-fg-neutral-muted">
                    {headline.title}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
