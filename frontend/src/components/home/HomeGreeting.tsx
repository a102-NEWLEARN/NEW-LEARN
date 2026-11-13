import { Skeleton } from "@seed-design/react";
import type { Member } from "@/api/members";
import { useTypewriter } from "@/components/motion/useTypewriter";
import { formatLongDate, kstHour } from "@/lib/date";

type HomeGreetingProps = {
  /** 회원이면 이름을 붙인다. 손님이면 null */
  member: Member | null;
  /** A17 을 아직 받는 중. 이름이 뒤늦게 끼어들지 않게 그동안 인사 줄 자리만 둔다 */
  pending: boolean;
};

// 한국 시간 시각에 맞춘 인사 (프로토타입 v21)
function greetingFor(hour: number) {
  if (hour < 11) return "좋은 아침이에요";
  if (hour < 18) return "좋은 오후예요";
  return "오늘 하루도 수고했어요";
}

// 찍는 동안 · 다 찍은 뒤 잠깐 끝에 깜빡이는 막대 커서. 장식이라 화면 읽기에서 뺀다
const CARET =
  "ml-px inline-block h-[1em] w-[2px] bg-fg-neutral-muted align-[-0.15em] motion-safe:animate-[newlearn-caret_800ms_steps(1,end)_infinite]";

// 인사 줄을 타자 치듯 찍는다 (useTypewriter, 2026-11-12 사용자). 가운데 맞춤이라 글자가 늘 때 줄이 흔들리지 않게
// 전체 문장을 투명하게 깔아 자리를 잡고 그 위에 찍히는 글을 겹친다. 투명한 문장이 화면 읽기에 전체 문장을 준다
function TypedLine({ text }: { text: string }) {
  const { shown, typing, caret } = useTypewriter(text);
  const cursor = caret && <span aria-hidden data-caret className={CARET} />;

  return (
    <p className="t3-medium text-fg-neutral-muted">
      {typing ? (
        <span className="inline-grid">
          <span className="col-start-1 row-start-1 pr-[3px] opacity-0">
            {text}
          </span>
          <span
            aria-hidden
            data-typing
            className="col-start-1 row-start-1 text-left"
          >
            {shown}
            {cursor}
          </span>
        </span>
      ) : (
        <>
          {text}
          {cursor}
        </>
      )}
    </p>
  );
}

// 홈 맨 위 — 인사 줄 · 제목 · 안내 한 줄 (프로토타입 v21). 검색창은 그 아래 SearchBox
export function HomeGreeting({ member, pending }: HomeGreetingProps) {
  const now = new Date();
  const today = formatLongDate(now);
  const line = member
    ? `${member.name}님, ${greetingFor(kstHour(now))} · ${today}`
    : today;

  return (
    <>
      {pending ? (
        <Skeleton
          radius="8"
          width="x40"
          height="lineHeight.t3"
          className="mx-auto"
        />
      ) : (
        // 글이 바뀌면(시간대 인사가 넘어가면) 처음부터 다시 찍는다
        <TypedLine key={line} text={line} />
      )}
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell).
          제목 · 부제는 줄 길이를 고르게 꺾는다 — 좁은 화면에서 「보세요.」 한 단어만 다음 줄로 넘어갔다 */}
      <h1
        tabIndex={-1}
        className="t10-bold md:t13-bold mt-x2_5 text-balance text-fg-neutral outline-none"
      >
        오늘의 이슈를 탐색해 보세요
      </h1>
      {/* 부제는 넓은 화면만 — 폰 첫 화면에 글이 많았다 (2026-11-13 사용자, Jira 202) */}
      <p className="t5-regular mt-x2_5 text-balance text-fg-neutral-muted max-md:hidden">
        검색하거나, 아래 추천 이슈에서 사건의 흐름을 따라가 보세요.
      </p>
    </>
  );
}
