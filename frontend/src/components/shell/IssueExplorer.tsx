import { IconChevronRightSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useLocation } from "react-router";
import {
  type Category,
  categoriesQuery,
  UPCOMING_CATEGORIES,
} from "@/api/categories";
import { type IssueSummary, issuesQuery } from "@/api/issues";
import { QueryState } from "@/components/state/QueryState";
import { useUpcomingCategory } from "@/components/useSnackbar";

// 한 분야에서 불러올 이슈 수. 사이드바는 쪽을 넘기지 않는다 (A2 size 상한 100)
const ISSUES_PER_CATEGORY = 50;

const rowClass =
  "t4-medium flex h-x8 w-full items-center gap-x1 rounded-r2 px-x2 text-left text-fg-neutral hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring";

export type IssueExplorerProps = {
  /** 펼친 분야 코드. 한 번에 한 분야만 연다 (프로토타입 v21) */
  openCode: string | null;
  onOpenCodeChange: (code: string | null) => void;
};

// 사이드바 이슈 탐색 — 분야 → 연도 → 이슈 (EXPERIENCE.md 앱 셸, PRD FR-3).
// 펼친 분야는 셸이 기억한다 — 사이드바를 접거나 서랍을 닫았다 열어도 그대로다.
// 사건까지 내려가는 칸은 아직 없다 — 이슈마다 A4 타임라인을 불러 붙인다
export function IssueExplorer({
  openCode,
  onOpenCodeChange,
}: IssueExplorerProps) {
  const categories = useQuery(categoriesQuery);
  const notifyUpcoming = useUpcomingCategory();

  return (
    <QueryState
      query={categories}
      loadingLabel="분야 불러오는 중"
      skeleton={<LinesSkeleton count={5} />}
      errorTitle="분야를 불러오지 못했어요"
    >
      {(data) => (
        <ul className="flex flex-col gap-x0_5">
          {data.map((category) => (
            <CategoryNode
              key={category.code}
              category={category}
              open={openCode === category.code}
              onToggle={() =>
                onOpenCodeChange(
                  openCode === category.code ? null : category.code,
                )
              }
            />
          ))}
          {UPCOMING_CATEGORIES.map((category) => (
            <li key={category.code}>
              {/* 비활성으로 두지 않는다 — 눌러야 안내를 받는다 (EXPERIENCE.md State Patterns) */}
              <button
                type="button"
                className={`${rowClass} text-fg-neutral-muted`}
                onClick={() => notifyUpcoming(category.name)}
              >
                <span className="truncate pl-x5">{category.name}</span>
                <span className="t1-medium ml-auto shrink-0 text-fg-neutral-muted">
                  준비 중
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

function CategoryNode({
  category,
  open,
  onToggle,
}: {
  category: Category;
  open: boolean;
  onToggle: () => void;
}) {
  const issuesId = useId();

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? issuesId : undefined}
        className={rowClass}
        onClick={onToggle}
      >
        <IconChevronRightSmallLine
          size={16}
          aria-hidden
          className={`shrink-0 text-fg-neutral-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        <span className="truncate">{category.name}</span>
      </button>
      {open && (
        <div id={issuesId}>
          <CategoryIssues category={category} />
        </div>
      )}
    </li>
  );
}

function CategoryIssues({ category }: { category: Category }) {
  const issues = useQuery(
    issuesQuery({ category: category.code, size: ISSUES_PER_CATEGORY }),
  );
  const { pathname } = useLocation();

  return (
    <QueryState
      query={issues}
      loadingLabel={`${category.name} 이슈 불러오는 중`}
      skeleton={<LinesSkeleton count={3} />}
      errorTitle="이슈를 불러오지 못했어요"
      empty={{
        when: (page) => page.items.length === 0,
        message: "이 분야의 이슈가 아직 없어요",
      }}
    >
      {(page) => (
        <ul
          aria-label={`${category.name} 이슈`}
          className="flex flex-col pl-x5"
        >
          {groupByYear(page.items).map(([year, items]) => (
            <li key={year} className="flex flex-col">
              <h3 className="t2-bold px-x2 pt-x2 pb-x1 text-fg-neutral-muted">
                {year}
              </h3>
              <ul>
                {items.map((issue) => {
                  const to = `/issues/${issue.id}`;
                  return (
                    <li key={issue.id}>
                      <Link
                        to={to}
                        aria-current={pathname === to ? "page" : undefined}
                        className="t3-regular block truncate rounded-r1 px-x2 py-x1_5 text-fg-neutral-muted hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring aria-[current=page]:t3-bold aria-[current=page]:bg-bg-brand-weak aria-[current=page]:text-fg-neutral"
                      >
                        {issue.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

// 이슈의 연도는 첫 사건의 해다 (프로토타입 v21 의 period.start). 최근 해부터, 해 안에서는 API 순서(마지막 사건 최신순) 그대로
// 시각 문자열의 앞 네 자리를 쓴다 — 서버가 한국 시각 오프셋(+09:00)으로 주므로 브라우저 시간대에 따라 해가 바뀌지 않는다
function groupByYear(issues: IssueSummary[]) {
  const years = new Map<string, IssueSummary[]>();
  for (const issue of issues) {
    const year = issue.firstEventAt.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), issue]);
  }
  return [...years.entries()].sort(([a], [b]) => b.localeCompare(a));
}

function LinesSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-x2 px-x2 py-x1">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} radius="8" width="full" height="lineHeight.t4" />
      ))}
    </div>
  );
}
