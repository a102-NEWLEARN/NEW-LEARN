import { IconChevronDownLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useSearchParams } from "react-router";
import { articlesQuery, LATEST_ARTICLES_SIZE } from "@/api/articles";
import { categoriesQuery } from "@/api/categories";
import type { ArticleSummary, Page } from "@/api/types";
import { ArticleRow } from "@/components/ArticleRow";
import { type CategoryTab, CategoryTabs } from "@/components/CategoryTabs";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { QueryState } from "@/components/state/QueryState";
import { uniqueById, uniqueCount } from "@/lib/uniqueById";
import { ActionButton } from "seed-design/ui/action-button";

// 「전체」 탭의 값. A1 분야 코드와 겹치지 않는다
const ALL = "all";

// 최신 기사 — 「전체」와 분야 탭, 발행 최신순 처음 8개와 *기사 N개 더 보기* (프로토타입 v21, EXPERIENCE.md IA 홈 행).
// 고른 분야는 주소 `?latest=` 에 남긴다. 추천 이슈의 `?category=` 와 따로 움직이고, 「전체」면 뺀다.
// 같은 화면 안의 선택이라 기록을 쌓지 않고 주소만 바꾼다(이동 규칙). 모르는 코드면 「전체」다
export function LatestArticles() {
  const headingId = useId();
  const categories = useQuery(categoriesQuery);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: CategoryTab[] = [
    { code: ALL, name: "전체" },
    ...(categories.data ?? []).map(({ code, name }) => ({ code, name })),
  ];
  const requested = searchParams.get("latest");
  const selected =
    tabs.find((tab) => tab.code === requested && tab.code !== ALL)?.code ?? ALL;

  // 분야 목록을 받은 뒤에 부른다 — 주소의 코드가 맞는지 알기 전에 「전체」를 먼저 부르지 않게
  const articles = useInfiniteQuery({
    ...articlesQuery(selected === ALL ? undefined : selected),
    enabled: categories.data !== undefined,
  });

  const selectCategory = (code: string) =>
    setSearchParams(
      (params) => {
        if (code === ALL) params.delete("latest");
        else params.set("latest", code);
        return params;
      },
      { replace: true },
    );

  return (
    <section aria-labelledby={headingId} className="mt-x10">
      <h2 id={headingId} className="t7-bold text-fg-neutral">
        최신 기사
      </h2>
      <p className="t4-regular mt-x1 text-fg-neutral-muted">
        기사 한 건씩 보여줘요. 누르면 그 기사의 마인드맵이 열려요.
      </p>
      <div className="mt-x2_5">
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
          {() => (
            <CategoryTabs
              label="최신 기사 분야"
              tabs={tabs}
              value={selected}
              onValueChange={selectCategory}
            >
              <ArticleList key={selected} articles={articles} />
            </CategoryTabs>
          )}
        </QueryState>
      </div>
    </section>
  );
}

type ArticleListProps = {
  articles: UseInfiniteQueryResult<InfiniteData<Page<ArticleSummary>>>;
};

const CARD =
  "mt-x3 rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x3 py-x1";

// 고른 분야의 기사 목록. 탭이 바뀌면 key 로 새로 그려 *더 보기* 포커스 같은 상태를 새로 시작한다
function ArticleList({ articles }: ArticleListProps) {
  const pages = articles.data?.pages ?? [];
  // 15분 수집이 새 기사를 맨 앞에 넣으면 다음 쪽이 밀려 본 기사가 다시 온다 — 처음 것만 남긴다
  const chunks = uniqueById(pages.map((page) => page.items));
  const items = chunks.flat();
  // 다음 쪽이 돌려줄 수 — 마지막으로 받은 쪽 기준이라 쪽 사이에 기사가 들어와도 음수가 되지 않는다.
  // 그 쪽에 이미 본 기사가 다시 오면 실제로 붙는 수는 이보다 적다
  const last = pages.at(-1);
  const nextCount = last
    ? Math.min(
        last.totalElements - (last.page + 1) * last.size,
        LATEST_ARTICLES_SIZE,
      )
    : 0;

  // *더 보기* 로 붙인 첫 기사로 포커스를 옮긴다 — 마지막 쪽이면 버튼이 사라져 포커스를 잃는다 (사건 패널과 같다)
  const listRef = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || items.length <= from) return;
    focusFrom.current = null;
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>(
      ":scope > li > a:first-child",
    );
    links?.[from]?.focus();
  }, [items.length]);
  // 탭이 바뀌면 이 목록을 새로 그린다. 같은 쿼리 관찰자가 새 탭을 가리키므로, 받던 *더 보기* 를 멈춰 새 탭의 다음 쪽을 받지 않게 한다
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
    let result = await articles.fetchNextPage();
    // 앞에 새 기사가 쪽 크기 이상 들어오면 받은 쪽이 모두 본 기사일 수 있다 — 새 기사가 붙을 때까지 다음 쪽을 더 받는다
    while (
      mounted.current &&
      uniqueCount(result.data) <= from &&
      result.hasNextPage &&
      !result.isError
    )
      result = await articles.fetchNextPage();
    // 붙은 것이 없으면 포커스를 기다리지 않는다 — 나중에 다시 불러와 행이 늘 때 포커스가 뛰지 않게
    if (uniqueCount(result.data) <= from) focusFrom.current = null;
  };

  let body: ReactNode;
  if (articles.data) {
    body =
      items.length === 0 ? (
        <EmptyState message="이 분야의 기사가 아직 없어요" />
      ) : (
        <ul
          ref={listRef}
          aria-label="최신 기사"
          className={`${CARD} divide-y divide-stroke-neutral-subtle`}
        >
          {chunks.flatMap((chunk) =>
            chunk.map((article, at) => (
              <ArticleRow
                key={article.id}
                article={article}
                showCategory
                // 더 보기로 붙은 쪽도 차례를 그 쪽 첫 행부터 센다 — 포커스를 받는 첫 행이 늦게 나오지 않게
                listIndex={at}
                mindmapHint
              />
            )),
          )}
        </ul>
      );
  } else if (articles.isError) {
    body = (
      <ErrorState
        title="최신 기사를 불러오지 못했어요"
        error={articles.error}
        onRetry={() => void articles.refetch()}
      />
    );
  } else {
    body = (
      <LoadingState label="최신 기사 불러오는 중">
        <div className={`${CARD} flex flex-col gap-x3 py-x3`}>
          {Array.from({ length: 4 }, (_, at) => (
            <Skeleton key={at} radius="8" width="full" height="x10" />
          ))}
        </div>
      </LoadingState>
    );
  }

  return (
    <>
      {body}
      {articles.hasNextPage && (
        <ActionButton
          variant="ghost"
          size="small"
          className="mt-x2"
          loading={articles.isFetchingNextPage}
          onClick={() => void loadMore()}
        >
          {`기사 ${nextCount}개 더 보기`}
          <IconChevronDownLine aria-hidden size={14} />
        </ActionButton>
      )}
    </>
  );
}
