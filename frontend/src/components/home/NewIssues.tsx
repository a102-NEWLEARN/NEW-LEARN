import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { type IssueSummary, issuesQuery } from "@/api/issues";
import { QueryState } from "@/components/state/QueryState";
import { prefersReducedMotion } from "@/lib/motion";

// 「새로운 이슈」 — 새로 만들어진 이슈 3개를 글자 링크로 (프로토타입 v21, docs/api-screen.md A2 sort=createdAt)
const NEW_ISSUE_COUNT = 3;

export function NewIssues() {
  const issues = useQuery(
    issuesQuery({ sort: "createdAt", size: NEW_ISSUE_COUNT }),
  );
  const labelId = useId();
  const [reduced] = useState(prefersReducedMotion);

  return (
    <div className="mt-x5">
      <QueryState
        query={issues}
        loadingLabel="새로운 이슈 불러오는 중"
        skeleton={
          <Skeleton
            radius="8"
            width="full"
            height="lineHeight.t3"
            className="mx-auto max-w-[360px]"
          />
        }
        errorTitle="새로운 이슈를 불러오지 못했어요"
      >
        {/* 하나도 없으면 그 줄을 숨긴다 — 이름만 남은 줄은 누를 것이 없다 */}
        {({ items }) =>
          items.length > 0 && (
            <div className="t3-medium flex flex-wrap items-center justify-center gap-x-x2_5 gap-y-x1">
              <span id={labelId} className="text-fg-neutral-subtle">
                새로운 이슈
              </span>
              {reduced ? (
                <ul
                  aria-labelledby={labelId}
                  className="flex flex-wrap items-center justify-center gap-x-x3 gap-y-x1"
                >
                  {items.map((issue) => (
                    <li key={issue.id} className={ITEM}>
                      <IssueLink issue={issue} />
                    </li>
                  ))}
                </ul>
              ) : (
                <IssueTicker items={items} labelId={labelId} />
              )}
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

// 이슈마다 앞에 4px 민트 점(이슈 카드 「최근 사건」 노드와 같은 그래픽) — 장식이라 글자로 넣지 않는다.
// 전에는 이슈 사이 가운데 점이라 줄이 꺾이면 둘째 줄이 점으로 시작했다
const ITEM =
  "flex min-w-0 items-center gap-x1 before:size-[4px] before:shrink-0 before:rounded-[1px] before:bg-bg-brand-accent before:content-['']";

// 누르는 높이 27px — 줄 18 + 위아래 4 + 밑줄 1. 24px 아래로 내리지 않는다 (EXPERIENCE.md Accessibility Floor).
// 좁은 화면에서 긴 제목은 한 줄에서 「…」로 줄인다
function IssueLink({ issue }: { issue: IssueSummary }) {
  return (
    <Link
      to={`/issues/${issue.id}`}
      className="truncate border-b border-transparent py-x1 text-fg-neutral-muted transition-colors hover:border-stroke-brand-weak hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
    >
      {issue.title}
    </Link>
  );
}

/** 한 이슈가 머무는 시간 · 바뀌는 시간 (EXPERIENCE.md Interaction Primitives 「모션」) */
const ROTATE_MS = 3000;

// 지금 제목 · 막 빠진 제목 · 기다리는 제목의 자리. 빠진 제목은 위로, 기다리는 제목은 아래에 숨어 있다가 올라온다
const STATE_CLASS = {
  current: "opacity-100",
  leaving: "opacity-0 motion-safe:-translate-y-full",
  waiting: "opacity-0 motion-safe:translate-y-full",
} as const;

// 「새로운 이슈」 띠 — 한 줄에 하나씩, 3초마다 지금 제목이 위로 빠지고 다음 제목이 아래에서 올라온다(350ms, 2026-11-12 사용자 「챡챡 바뀌는 느낌」).
// 세 제목을 한 칸에 겹쳐 두어 폭이 가장 긴 제목에 맞춰 고정된다 — 바뀔 때 줄이 흔들리지 않는다.
// 링크는 셋 다 그대로 있어 화면 읽기 · Tab 으로 차례로 간다. 바뀔 때 읽어 주지 않는다(aria-live 없음).
// 마우스를 올리거나 키보드로 들어오면 멈추고, 키보드로 온 링크를 보인다. 동작 줄이기면 부르는 쪽이 셋을 한 줄에 둔다
function IssueTicker({
  items,
  labelId,
}: {
  items: IssueSummary[];
  labelId: string;
}) {
  // 지금 보이는 제목과 막 빠진 제목
  const [{ active, previous }, setSlot] = useState<{
    active: number;
    previous: number | null;
  }>({ active: 0, previous: null });
  const show = (index: number) =>
    setSlot((slot) =>
      slot.active === index ? slot : { active: index, previous: slot.active },
    );
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = setInterval(
      () =>
        setSlot((slot) => ({
          active: (slot.active + 1) % items.length,
          previous: slot.active,
        })),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [paused, items.length]);

  const stateOf = (index: number) =>
    index === active ? "current" : index === previous ? "leaving" : "waiting";

  return (
    <ul
      aria-labelledby={labelId}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      // 지나가는 제목은 줄 밖에서 잘라 낸다. 링크 포커스 윤곽선(바깥 4px)은 잘리지 않게 위아래 6px · 양옆 8px 여유를 둔다
      className="grid min-w-0 [clip-path:inset(-6px_-8px)]"
    >
      {items.map((issue, index) => {
        const state = stateOf(index);
        return (
          <li
            key={issue.id}
            data-state={state}
            onFocus={() => {
              setFocused(true);
              show(index);
            }}
            className={`${ITEM} col-start-1 row-start-1 transition-[opacity] duration-[350ms] ease-[var(--seed-timing-function-enter)] motion-safe:transition-[translate,opacity] ${STATE_CLASS[state]}`}
          >
            <IssueLink issue={issue} />
          </li>
        );
      })}
    </ul>
  );
}
