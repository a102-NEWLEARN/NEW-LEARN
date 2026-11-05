import { IconChevronRightSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  type Category,
  categoriesQuery,
  UPCOMING_CATEGORIES,
} from "@/api/categories";
import { type IssueSummary, issuesQuery } from "@/api/issues";
import { timelineQuery } from "@/api/timeline";
import { InterestButton } from "@/components/issue/InterestButton";
import { QueryState } from "@/components/state/QueryState";
import { useUpcomingCategory } from "@/components/useSnackbar";
import { formatTimelineDates } from "@/lib/date";

/** 사이드바 사건 링크가 주소와 함께 넘기는 표시 — 이슈 화면이 「화면 안에서 고른 사건」처럼 패널 제목으로 포커스를 옮긴다 */
export const SIDEBAR_EVENT_PICK = { sidebarEventPick: true } as const;

/** 사이드바 사건 링크로 왔나 (IssuePage) */
export function isSidebarEventPick(state: unknown) {
  return (
    typeof state === "object" &&
    state !== null &&
    "sidebarEventPick" in state &&
    state.sidebarEventPick === true
  );
}

// 한 분야에서 불러올 이슈 수. 사이드바는 쪽을 넘기지 않는다 (A2 size 상한 100)
const ISSUES_PER_CATEGORY = 50;

const rowClass =
  "t4-medium flex h-x8 w-full items-center gap-x1 rounded-r2 px-x2 text-left text-fg-neutral hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring";

export type IssueExplorerProps = {
  /** 펼친 분야 코드. 한 번에 한 분야만 연다 (프로토타입 v21) */
  openCode: string | null;
  onOpenCodeChange: (code: string | null) => void;
};

// 사이드바 이슈 탐색 — 분야 → 연도 → 이슈 → 사건 (EXPERIENCE.md 앱 셸, PRD FR-3).
// 펼친 분야는 셸이 기억한다 — 사이드바를 접거나 서랍을 닫았다 열어도 그대로다.
// 사건은 지금 보고 있는 이슈 아래에만 펼친다 (프로토타입 v21 Sidebar)
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
        {/* A1 이슈 수 — 눈으로 보는 보조라 화면 읽기에서 빼서 버튼 이름은 분야 이름 그대로다 (모바일 v1 · v21 Sidebar) */}
        <span
          aria-hidden
          className="t1-medium ml-auto shrink-0 text-fg-neutral-muted tabular-nums"
        >
          {category.issueCount}
        </span>
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
                  const current = pathname === to;
                  return (
                    <li key={issue.id}>
                      {/* 이슈 링크와 별은 나란한 두 버튼이다 — 링크 안에 버튼을 넣지 않는다. 별 자리만큼 링크 글자를 비운다 (v21). 위치 클래스(right-x…)는 SEED 테마에 없어 px 로 준다 */}
                      <div className="group/row relative">
                        <Link
                          to={to}
                          aria-current={current ? "page" : undefined}
                          className="t3-regular block truncate rounded-r1 py-x1_5 pr-x8 pl-x2 text-fg-neutral-muted hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring aria-[current=page]:t3-bold aria-[current=page]:bg-bg-brand-weak aria-[current=page]:text-fg-neutral"
                        >
                          {issue.title}
                        </Link>
                        <InterestButton
                          issueId={issue.id}
                          interested={issue.interested}
                          size="small"
                          issueTitle={issue.title}
                          className="absolute top-1/2 right-[2px] -translate-y-1/2"
                        />
                      </div>
                      {current && <IssueEvents issue={issue} />}
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

// 보고 있는 이슈의 사건 — A4 순서(발생 시각 오름차순)로 「날짜 키워드」. 이슈 화면과 같은 A4 를 써서 요청이 늘지 않는다.
// 누르면 그 사건의 패널이 열린다. 같은 화면에서 고르는 것이라 기록을 쌓지 않는다 (EXPERIENCE.md 이동 규칙).
// 사건이 0개면 아무것도 두지 않는다 — 본문이 「아직 이 이슈에 정리된 사건이 없어요」를 보인다
function IssueEvents({ issue }: { issue: IssueSummary }) {
  const timeline = useQuery(timelineQuery(issue.id));
  const [searchParams] = useSearchParams();
  const selected = searchParams.get("event");

  return (
    <QueryState
      query={timeline}
      loadingLabel="사건 불러오는 중"
      skeleton={<LinesSkeleton count={3} />}
      errorTitle="사건을 불러오지 못했어요"
    >
      {({ events }) => {
        if (events.length === 0) return null;
        const dates = formatTimelineDates(
          events.map((event) => event.occurredAt),
        );
        return (
          <ul
            aria-label={`${issue.title} 사건`}
            className="mt-x0_5 mb-x1_5 ml-x2 flex flex-col border-l border-stroke-neutral-weak pl-x1"
          >
            {events.map((event, index) => (
              <li key={event.id}>
                <Link
                  to={`/issues/${issue.id}?event=${event.id}`}
                  replace
                  state={SIDEBAR_EVENT_PICK}
                  title={event.title}
                  aria-current={
                    selected === String(event.id) ? "true" : undefined
                  }
                  className="t3-regular flex items-center gap-x2 rounded-r1 px-x2 py-x1 text-fg-neutral-muted hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring aria-[current=true]:t3-bold aria-[current=true]:text-fg-brand"
                >
                  <span className="t1-medium shrink-0 tabular-nums">
                    {dates[index]}
                  </span>{" "}
                  <span className="truncate">{event.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        );
      }}
    </QueryState>
  );
}

// 이슈의 연도는 첫 사건의 해다 (프로토타입 v21 의 period.start). 사건이 0개라 첫 사건이 없으면 이슈를 만든 해로 둔다.
// 최근 해부터, 해 안에서는 API 순서(마지막 사건 최신순) 그대로.
// 시각 문자열의 앞 네 자리를 쓴다 — 서버가 한국 시각 오프셋(+09:00)으로 주므로 브라우저 시간대에 따라 해가 바뀌지 않는다
function groupByYear(issues: IssueSummary[]) {
  const years = new Map<string, IssueSummary[]>();
  for (const issue of issues) {
    const year = (issue.firstEventAt ?? issue.createdAt).slice(0, 4);
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
