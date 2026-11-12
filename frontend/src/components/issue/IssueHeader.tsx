import { Skeleton } from "@seed-design/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import type { IssueDetail } from "@/api/issue";
import { AiBadge } from "@/components/AiBadge";
import { InterestButton } from "@/components/issue/InterestButton";
import { meaningProps } from "@/components/meaning/meaningProps";
import { errorDescription } from "@/components/state/ErrorState";
import { kstYear } from "@/lib/date";
import { enterAt, RISE } from "@/components/motion/screenMotion";

type IssueHeaderProps = {
  /** A3 이슈 헤더 */
  query: UseQueryResult<IssueDetail>;
  /** 제목(h1)이 포커스를 받거나 잃을 때 — 찾을 수 없음 화면으로 바뀔 때 포커스를 넘길지 화면이 가린다 */
  onTitleFocusChange?: (focused: boolean) => void;
};

// 「경제 · 2026」 — 분야와 첫 사건 연도. 사건이 없으면 분야만
function categoryLine(issue: IssueDetail) {
  return [
    ...issue.categories.map((category) => category.name),
    issue.firstEventAt && kstYear(issue.firstEventAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

// 이슈를 받으면 분야 → 제목 → 요약이 이 차례(ms)로 떠오른다 (components/motion/screenMotion.ts)
const HEADER_AT = { category: 0, title: 70, summary: 140 };

// 이슈 헤더 — 분야 · 연도, 제목과 관심 이슈 별, 요약 (프로토타입 v21 IssueHeader). 요약에는 AI 생성 표시를 붙인다. 관점 비교 · 알림은 아직 없다.
// h1 은 데이터를 기다리지 않고 첫 렌더에 그린다 — 화면을 옮기면 셸이 첫 렌더 뒤 h1 에 포커스한다 (AppShell)
export function IssueHeader({ query, onTitleFocusChange }: IssueHeaderProps) {
  const [more, setMore] = useState(false);
  const issue = query.data;
  const failed = !issue && query.isError;

  // 요약은 두 줄로 줄이고 잘렸으면 *더보기* 를 단다 (프로토타입 v21). 잘렸는지는 글자 수가 아니라 화면에서 잰다 —
  // 좁은 화면에서는 짧은 요약도 두 줄을 넘는다. 폭이 바뀌면 다시 잰다
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  const summary = issue?.summary;
  useLayoutEffect(() => {
    const element = summaryRef.current;
    if (!element || more) return;
    const measure = () =>
      setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [summary, more]);

  return (
    <header className="px-x5 pt-x6 pb-x5 md:px-x8 md:pt-x5 md:pb-x4">
      {/* 분야 줄 · 제목 | 관심 이슈 별. 좁은 화면은 별이 두 줄 오른쪽 위에 붙고 제목은 그 왼쪽 칸에서 꺾인다 — 기사 머리 북마크와 같은 자리.
          32px 제목 줄과 40px 별의 위를 맞추면 별이 4px 내려가 보였다 (2026-11-12 사용자, Jira 195).
          넓은 화면은 제목 바로 옆(프로토타입 v21 IssueHeader) — 첫 칸이 제목 폭만큼이라 별이 제목 끝에 붙고, 줄이 바뀌면 첫 줄 높이에 남는다 */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-x2 md:grid-cols-[minmax(0,max-content)_auto] md:gap-x-x1">
        {issue ? (
          <p
            className={`t2-regular col-start-1 row-start-1 text-fg-neutral-subtle tabular-nums ${RISE}`}
            style={enterAt(HEADER_AT.category)}
          >
            {categoryLine(issue)}
          </p>
        ) : (
          !failed && <Skeleton radius="8" width="x16" height="lineHeight.t2" />
        )}
        <h1
          tabIndex={-1}
          onFocus={() => onTitleFocusChange?.(true)}
          onBlur={() => onTitleFocusChange?.(false)}
          className="t9-bold md:t11-bold col-start-1 row-start-2 mt-x1_5 min-w-0 text-fg-neutral outline-none"
        >
          {issue ? (
            // 제목 글만 떠오른다 — h1 은 첫 렌더부터 있어서 셸이 포커스를 둔다. 드래그하면 용어사전 말풍선이 뜬다
            <span
              className={`block ${RISE}`}
              style={enterAt(HEADER_AT.title)}
              {...meaningProps("ISSUE", issue.id)}
            >
              {issue.title}
            </span>
          ) : failed ? (
            "이슈를 불러오지 못했어요"
          ) : (
            <>
              <span className="sr-only">이슈 불러오는 중</span>
              <Skeleton
                radius="8"
                width="full"
                height="lineHeight.t11"
                className="max-w-[420px]"
              />
            </>
          )}
        </h1>
        {issue && (
          <InterestButton
            issueId={issue.id}
            interested={issue.interested}
            className="col-start-2 row-start-1 -mt-x2 -mr-x2 self-start max-md:row-span-2 md:row-start-2 md:mt-x1 md:mr-0"
          />
        )}
      </div>
      {failed && (
        <div className="mt-x2 flex flex-wrap items-center gap-x3">
          <p className="t4-regular text-fg-neutral-muted">
            {errorDescription(query.error)}
          </p>
          <ActionButton
            variant="neutralOutline"
            size="small"
            className="border-stroke-neutral-weak"
            onClick={() => void query.refetch()}
          >
            다시 시도
          </ActionButton>
        </div>
      )}
      {issue?.summary && (
        <div
          className={`mt-x2 max-w-[760px] ${RISE}`}
          style={enterAt(HEADER_AT.summary)}
        >
          <p
            ref={summaryRef}
            className={`t5-regular text-fg-neutral-muted ${more ? "" : "line-clamp-2"}`}
            {...meaningProps("ISSUE", issue.id)}
          >
            {issue.summary}
          </p>
          {/* AI 생성 표시는 요약 문단 밖, *더보기* 와 같은 줄에 둔다 — v21 처럼 문장 끝에 붙이면 두 줄로 잘릴 때 가려진다 */}
          <div className="mt-x1 flex items-center gap-x2">
            <AiBadge />
            {(clamped || more) && (
              <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore((open) => !open)}
                className="t2-medium rounded-r1 px-x1 text-fg-neutral-muted hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
              >
                {more ? "접기" : "더보기"}
              </button>
            )}
          </div>
        </div>
      )}
      {!issue && !failed && (
        <Skeleton
          radius="8"
          width="full"
          height="lineHeight.t5"
          className="mt-x2 max-w-[560px]"
        />
      )}
    </header>
  );
}
