import { Skeleton } from "@seed-design/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import type { IssueDetail } from "@/api/issue";
import { errorDescription } from "@/components/state/ErrorState";
import { kstYear } from "@/lib/date";

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

// 이슈 헤더 — 분야 · 연도, 제목, 요약 (프로토타입 v21 IssueHeader). 고정 핀 · AI 배지 · 관점 비교 · 알림은 아직 없다.
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
    <header className="px-x4 pt-x5 pb-x4 md:px-x8">
      {issue ? (
        <p className="t2-regular text-fg-neutral-subtle tabular-nums">
          {categoryLine(issue)}
        </p>
      ) : (
        !failed && <Skeleton radius="8" width="x16" height="lineHeight.t2" />
      )}
      <h1
        tabIndex={-1}
        onFocus={() => onTitleFocusChange?.(true)}
        onBlur={() => onTitleFocusChange?.(false)}
        className="t9-bold md:t11-bold mt-x1_5 text-fg-neutral outline-none"
      >
        {issue ? (
          issue.title
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
        <div className="mt-x2 max-w-[760px]">
          <p
            ref={summaryRef}
            className={`t5-regular text-fg-neutral-muted ${more ? "" : "line-clamp-2"}`}
          >
            {issue.summary}
          </p>
          {(clamped || more) && (
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((open) => !open)}
              className="t2-medium mt-x1 -ml-x1 rounded-r1 px-x1 text-fg-neutral-muted hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
            >
              {more ? "접기" : "더보기"}
            </button>
          )}
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
