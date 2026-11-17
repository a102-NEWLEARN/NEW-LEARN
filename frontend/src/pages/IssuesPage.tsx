import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { categoriesQuery } from "@/api/categories";
import { ISSUES_PAGE_SIZE, issuesAllQuery } from "@/api/issues";
import { meQuery } from "@/api/members";
import { CategoryTabs, orderCategoryTabs } from "@/components/CategoryTabs";
import { IssueCard } from "@/components/IssueCard";
import { CARD_RISE, cardAt, GROUP_RISE } from "@/components/motion/appMotion";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x4";

type IssueSort = "latest" | "articles";

const SORTS: { value: IssueSort; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "articles", label: "기사 많은 순" },
];

// 분야별 이슈 — 한 분야의 이슈를 모두 본다. 최신순(마지막 사건) · 기사 많은 순으로 고르고 12개씩 쪽 번호로 넘긴다
// (PRD FR-3 · FR-4, EXPERIENCE.md IA 분야별 이슈 행, 2026-11-13 Jira 203). 홈 추천 이슈의 *전체보기* 가 여기로 온다.
// 탭은 홈 추천 이슈와 같은 순서(관심 분야 먼저)다. 관심 이슈를 앞으로 당기지는 않는다 — 전체 목록이라서.
// 고른 분야 · 정렬 · 쪽은 주소 `?category=` · `?sort=articles` · `?page=N`(1 부터)에 남기고(기본값이면 뺀다),
// 같은 화면 안의 선택이라 기록을 쌓지 않는다(이동 규칙). 모르는 코드면 맨 앞 탭이다. 분야나 정렬을 바꾸면 1쪽이다
export function IssuesPage() {
  usePageTitle("분야별 이슈");
  const categories = useQuery(categoriesQuery);
  // 셸의 RequireMember 가 A17 을 받은 뒤에 이 화면을 그린다. 실패했으면 손님처럼 A1 순서로 둔다
  const member = useQuery(meQuery).data ?? null;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = categories.data
    ? orderCategoryTabs(categories.data, member)
    : [];
  const requested = searchParams.get("category");
  const selected =
    tabs.find((tab) => tab.code === requested)?.code ?? tabs[0]?.code;
  const sort: IssueSort =
    searchParams.get("sort") === "articles" ? "articles" : "latest";
  const asked = Number(searchParams.get("page"));
  const page = Number.isInteger(asked) && asked >= 1 ? asked - 1 : 0;

  // 지금 분야를 먼저 적어 두고 고친다 — 주소에 분야가 없던 첫 화면에서도 분야가 앞에 온다
  const update = (change: (params: URLSearchParams) => void) =>
    setSearchParams(
      (params) => {
        if (selected !== undefined && !params.has("category"))
          params.set("category", selected);
        change(params);
        return params;
      },
      { replace: true },
    );
  const selectCategory = (code: string) =>
    update((params) => {
      params.set("category", code);
      params.delete("page");
    });
  const selectSort = (next: IssueSort) =>
    update((params) => {
      if (next === "articles") params.set("sort", next);
      else params.delete("sort");
      params.delete("page");
    });
  const selectPage = (next: number) =>
    update((params) => {
      if (next === 0) params.delete("page");
      else params.set("page", String(next + 1));
    });

  return (
    <div className="mx-auto max-w-[1040px] px-x5 pt-x9 pb-[96px] md:px-x8 md:pb-x14">
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell) */}
      <h1 tabIndex={-1} className="t8-bold text-fg-neutral outline-none">
        분야별 이슈
      </h1>
      <p className="t4-regular mt-x1_5 text-fg-neutral-muted">
        여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요.
      </p>
      <div className="mt-x5">
        <QueryState
          query={categories}
          loadingLabel="분야 불러오는 중"
          skeleton={
            <Skeleton
              radius="8"
              width="full"
              height="lineHeight.t5"
              className="my-x3"
            />
          }
          errorTitle="분야를 불러오지 못했어요"
        >
          {() =>
            selected !== undefined && (
              <CategoryTabs
                label="분야"
                tabs={tabs}
                value={selected}
                onValueChange={selectCategory}
              >
                {/* 분야를 바꾸면 새로 그려 묶음이 다시 떠오른다 */}
                <IssueList
                  key={selected}
                  category={selected}
                  sort={sort}
                  page={page}
                  onSort={selectSort}
                  onPage={selectPage}
                />
              </CategoryTabs>
            )
          }
        </QueryState>
      </div>
    </div>
  );
}

type IssueListProps = {
  category: string;
  sort: IssueSort;
  /** 0 부터. 넘치면 마지막 쪽을 보인다 */
  page: number;
  onSort: (sort: IssueSort) => void;
  onPage: (page: number) => void;
};

// 고른 분야의 이슈 카드 — 정렬 고르기와 쪽 번호(12개씩). 분야 이슈를 모두 받아 두고 화면이 줄 세우고 나눈다
// (2026-11-13 사용자 QA 5 · 6, Jira 203). 기사 많은 순은 카드의 기사 수 내림차순, 같으면 최신순(A2 차례)이다
function IssueList({ category, sort, page, onSort, onPage }: IssueListProps) {
  const issues = useQuery(issuesAllQuery(category));
  const all = issues.data?.items;
  const sorted = useMemo(
    () =>
      sort === "articles" && all
        ? all.toSorted((a, b) => b.articleCount - a.articleCount)
        : (all ?? []),
    [all, sort],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / ISSUES_PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const items = sorted.slice(
    current * ISSUES_PAGE_SIZE,
    (current + 1) * ISSUES_PAGE_SIZE,
  );

  // 쪽을 넘기면 새 쪽 첫 카드로 포커스를 옮긴다 — 그 자리로 스크롤도 된다. 정렬을 바꿀 때는 고르기 버튼에 둔다
  const listRef = useRef<HTMLUListElement>(null);
  const focusFirst = useRef(false);
  useEffect(() => {
    if (!focusFirst.current) return;
    focusFirst.current = false;
    listRef.current
      ?.querySelector<HTMLAnchorElement>(":scope > li > a")
      ?.focus();
  }, [current]);
  const goPage = (next: number) => {
    focusFirst.current = true;
    onPage(next);
  };

  let body: ReactNode;
  if (issues.data) {
    body =
      sorted.length === 0 ? (
        <EmptyState message="이 분야의 이슈가 아직 없어요" />
      ) : (
        <>
          <div className="mt-x4 flex items-center gap-x2">
            <span className="t4-regular text-fg-neutral-muted tabular-nums">
              이슈 {sorted.length}개
            </span>
            {/* 사건 패널 관련 기사의 정렬 고르기와 같은 모양 (Jira 201) */}
            <div
              role="group"
              aria-label="이슈 정렬"
              className="ml-auto flex items-center gap-x0_5 rounded-full bg-bg-neutral-weak p-x0_5"
            >
              {SORTS.map(({ value, label }) => {
                const on = sort === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (!on) onSort(value);
                    }}
                    className={`t3-medium h-x7 rounded-full px-x3 whitespace-nowrap transition-[color,background-color] duration-[var(--seed-duration-color-transition)] ease-[var(--seed-timing-function-easing)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus-ring ${
                      on
                        ? "t3-bold bg-bg-layer-default text-fg-neutral shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                        : "text-fg-neutral-subtle hover:text-fg-neutral"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <ul
            // 정렬 · 쪽이 바뀌면 새로 그려 카드가 다시 떠오른다
            key={`${sort}-${current}`}
            ref={listRef}
            aria-label="이슈"
            className={`mt-x3 ${GRID} ${GROUP_RISE}`}
          >
            {items.map((issue, at) => (
              <li key={issue.id} className={CARD_RISE} style={cardAt(at)}>
                <IssueCard issue={issue} />
              </li>
            ))}
          </ul>
          <div className="mt-x6">
            <Pagination
              label="이슈 쪽"
              page={current}
              totalPages={totalPages}
              onChange={goPage}
            />
          </div>
        </>
      );
  } else if (issues.isError) {
    body = (
      <ErrorState
        title="이슈를 불러오지 못했어요"
        error={issues.error}
        onRetry={() => void issues.refetch()}
      />
    );
  } else {
    body = (
      <LoadingState label="이슈 불러오는 중">
        <div className={`mt-x4 ${GRID}`}>
          {Array.from({ length: 6 }, (_, at) => (
            <Skeleton key={at} radius="16" width="full" height="x40" />
          ))}
        </div>
      </LoadingState>
    );
  }

  return body;
}
