import { Skeleton } from "@seed-design/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { articlesQuery } from "@/api/articles";
import { categoriesQuery } from "@/api/categories";
import { ArticleRow } from "@/components/ArticleRow";
import { type CategoryTab, CategoryTabs } from "@/components/CategoryTabs";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { QueryState } from "@/components/state/QueryState";

// 「전체」 탭의 값. A1 분야 코드와 겹치지 않는다
const ALL = "all";

// 최신 기사 — 「전체」와 분야 탭, 발행 최신순 8개씩 쪽 번호로 넘긴다 (프로토타입 v21, EXPERIENCE.md IA 홈 행,
// 쪽 번호는 2026-11-13 사용자 · Jira 203). 고른 분야는 주소 `?latest=` 에 남긴다. 추천 이슈의 `?category=` 와 따로
// 움직이고, 「전체」면 뺀다. 같은 화면 안의 선택이라 기록을 쌓지 않고 주소만 바꾼다(이동 규칙). 모르는 코드면 「전체」다.
// 쪽은 주소에 남기지 않는다 — 홈은 구역이 여럿이라서
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
              {/* 탭이 바뀌면 새로 그려 1쪽부터 다시 본다. 분야 목록을 받은 뒤에 그려서 주소의 코드가 맞는지 안 다음에 부른다 */}
              <ArticleList
                key={selected}
                category={selected === ALL ? undefined : selected}
              />
            </CategoryTabs>
          )}
        </QueryState>
      </div>
    </section>
  );
}

const CARD =
  "mt-x3 rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x3 py-x1";

// 고른 분야의 기사 한 쪽과 쪽 번호. 다음 쪽을 받는 동안은 앞 쪽을 그대로 둔다
function ArticleList({ category }: { category: string | undefined }) {
  const [page, setPage] = useState(0);
  const articles = useQuery({
    ...articlesQuery(category, page),
    placeholderData: keepPreviousData,
  });
  const data = articles.data;

  // 쪽을 넘기면 새 쪽 첫 기사(마인드맵 링크)로 포커스를 옮긴다 — 그 자리로 스크롤도 된다. 새 쪽이 온 뒤에 옮긴다
  const listRef = useRef<HTMLUListElement>(null);
  const focusFirst = useRef(false);
  const shown = articles.isPlaceholderData ? undefined : data?.page;
  useEffect(() => {
    if (!focusFirst.current || shown === undefined) return;
    focusFirst.current = false;
    listRef.current
      ?.querySelector<HTMLAnchorElement>(":scope > li > a:first-child")
      ?.focus();
  }, [shown]);
  const goPage = (next: number) => {
    focusFirst.current = true;
    setPage(next);
  };

  let body: ReactNode;
  if (data) {
    body =
      data.items.length === 0 ? (
        <EmptyState message="이 분야의 기사가 아직 없어요" />
      ) : (
        <ul
          // 쪽이 바뀌면 새로 그려 행이 다시 떠오른다
          key={data.page}
          ref={listRef}
          aria-label="최신 기사"
          aria-busy={articles.isPlaceholderData}
          className={`${CARD} divide-y divide-stroke-neutral-subtle transition-opacity ${articles.isPlaceholderData ? "opacity-60" : ""}`}
        >
          {data.items.map((article, at) => (
            <ArticleRow
              key={article.id}
              article={article}
              showCategory
              listIndex={at}
              mindmapHint
            />
          ))}
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
      {data && (
        <div className="mt-x4">
          <Pagination
            label="최신 기사 쪽"
            page={page}
            totalPages={data.totalPages}
            onChange={goPage}
          />
        </div>
      )}
    </>
  );
}
