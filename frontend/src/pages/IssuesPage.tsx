import { IconChevronDownLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { categoriesQuery } from "@/api/categories";
import { ISSUES_PAGE_SIZE, issuesPagesQuery } from "@/api/issues";
import { meQuery } from "@/api/members";
import { CategoryTabs, orderCategoryTabs } from "@/components/CategoryTabs";
import { IssueCard } from "@/components/IssueCard";
import { CARD_RISE, cardAt, GROUP_RISE } from "@/components/motion/appMotion";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";
import { uniqueById, uniqueCount } from "@/lib/uniqueById";
import { ActionButton } from "seed-design/ui/action-button";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x4";

// 분야별 이슈 — 한 분야의 이슈를 마지막 사건 최신순으로 모두 본다. 처음 12개, *이슈 N개 더 보기* 로 12개씩 붙인다
// (PRD FR-3 · FR-4, EXPERIENCE.md IA 분야별 이슈 행). 홈 추천 이슈의 *전체보기* 가 여기로 온다.
// 탭은 홈 추천 이슈와 같은 순서(관심 분야 먼저)다. 관심 이슈를 앞으로 당기지는 않는다 — 전체 목록이라서.
// 고른 분야는 주소 `?category=` 에 남기고, 같은 화면 안의 선택이라 기록을 쌓지 않는다(이동 규칙). 모르는 코드면 맨 앞 탭이다
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

  const selectCategory = (code: string) =>
    setSearchParams(
      (params) => {
        params.set("category", code);
        return params;
      },
      { replace: true },
    );

  return (
    <div className="mx-auto max-w-[1040px] px-x5 pt-x9 pb-[96px] md:px-x8 md:pb-x14">
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell) */}
      <h1 tabIndex={-1} className="t8-bold text-fg-neutral outline-none">
        분야별 이슈
      </h1>
      <p className="t4-regular mt-x1_5 text-fg-neutral-muted">
        여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요. 마지막 사건이
        최근인 이슈부터 보여줘요.
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
                {/* 분야를 바꾸면 새로 그려 *더 보기* 포커스 같은 상태를 새로 시작하고 묶음이 다시 떠오른다 */}
                <IssueList key={selected} category={selected} />
              </CategoryTabs>
            )
          }
        </QueryState>
      </div>
    </div>
  );
}

// 고른 분야의 이슈 카드와 *더 보기*. 최신 기사(LatestArticles)의 *더 보기* 와 같은 꼴이다
function IssueList({ category }: { category: string }) {
  const issues = useInfiniteQuery(issuesPagesQuery(category));
  const pages = issues.data?.pages ?? [];
  // 쪽 사이에 사건이 붙은 이슈가 맨 앞으로 오면 다음 쪽이 밀려 본 이슈가 다시 온다 — 처음 것만 남긴다
  const chunks = uniqueById(pages.map((page) => page.items));
  const items = chunks.flat();
  // 다음 쪽이 돌려줄 수 — 마지막으로 받은 쪽 기준이라 쪽 사이에 이슈가 늘어도 음수가 되지 않는다
  const last = pages.at(-1);
  const nextCount = last
    ? Math.min(
        last.totalElements - (last.page + 1) * last.size,
        ISSUES_PAGE_SIZE,
      )
    : 0;

  // *더 보기* 로 붙인 첫 카드로 포커스를 옮긴다 — 마지막 쪽이면 버튼이 사라져 포커스를 잃는다
  const listRef = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || items.length <= from) return;
    focusFrom.current = null;
    const links =
      listRef.current?.querySelectorAll<HTMLAnchorElement>(":scope > li > a");
    links?.[from]?.focus();
  }, [items.length]);
  // 받는 사이 분야를 바꾸면(이 목록이 사라지면) 아래 되풀이를 멈춘다
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const loadMore = async () => {
    const from = items.length;
    focusFrom.current = from;
    let result = await issues.fetchNextPage();
    // 받은 쪽이 모두 본 이슈일 수 있다 — 새 이슈가 붙을 때까지 다음 쪽을 더 받는다
    while (
      mounted.current &&
      uniqueCount(result.data) <= from &&
      result.hasNextPage &&
      !result.isError
    )
      result = await issues.fetchNextPage();
    if (uniqueCount(result.data) <= from) focusFrom.current = null;
  };

  let body: ReactNode;
  if (issues.data) {
    body =
      items.length === 0 ? (
        <EmptyState message="이 분야의 이슈가 아직 없어요" />
      ) : (
        <ul
          ref={listRef}
          aria-label="이슈"
          className={`mt-x4 ${GRID} ${GROUP_RISE}`}
        >
          {chunks.flatMap((chunk) =>
            chunk.map((issue, at) => (
              // 더 보기로 붙은 쪽도 차례를 그 쪽 첫 카드부터 센다
              <li key={issue.id} className={CARD_RISE} style={cardAt(at)}>
                <IssueCard issue={issue} />
              </li>
            )),
          )}
        </ul>
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

  return (
    <>
      {body}
      {issues.hasNextPage && (
        <div className="mt-x5 flex justify-center">
          <ActionButton
            variant="ghost"
            size="small"
            loading={issues.isFetchingNextPage}
            onClick={() => void loadMore()}
          >
            {`이슈 ${nextCount}개 더 보기`}
            <IconChevronDownLine aria-hidden size={14} />
          </ActionButton>
        </div>
      )}
    </>
  );
}
