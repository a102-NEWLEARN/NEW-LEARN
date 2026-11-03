import { Skeleton } from "@seed-design/react";
import type { Member } from "@/api/members";
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

// 홈 맨 위 — 인사 줄 · 제목 · 안내 한 줄 (프로토타입 v21). 검색창은 그 아래 SearchBox
export function HomeGreeting({ member, pending }: HomeGreetingProps) {
  const now = new Date();
  const today = formatLongDate(now);

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
        <p className="t3-medium text-fg-neutral-muted">
          {member
            ? `${member.name}님, ${greetingFor(kstHour(now))} · ${today}`
            : today}
        </p>
      )}
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell) */}
      <h1
        tabIndex={-1}
        className="t10-bold md:t13-bold mt-x2_5 text-fg-neutral outline-none"
      >
        오늘의 이슈를 탐색해 보세요
      </h1>
      <p className="t5-regular mt-x2_5 text-fg-neutral-muted">
        검색하거나, 아래 추천 이슈에서 사건의 흐름을 따라가 보세요.
      </p>
    </>
  );
}
