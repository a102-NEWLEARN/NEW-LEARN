import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { bookmarksQuery } from "@/api/bookmarks";
import { ArticleRow } from "@/components/ArticleRow";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";

// 나의 뉴스함 — 북마크한 기사를 최근에 담은 순서대로 (A22, 프로토타입 v21 LibraryScreen).
// v21 의 분야 탭은 두지 않는다 — 담은 기사가 적으면 탭이 비어 보인다 [가정]
export function BookmarksPage() {
  usePageTitle("나의 뉴스함");
  const bookmarks = useQuery(bookmarksQuery);

  return (
    <div className="mx-auto max-w-[760px] px-x4 pt-x9 pb-x16 md:px-x6">
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell) */}
      <h1 tabIndex={-1} className="t8-bold text-fg-neutral outline-none">
        나의 뉴스함
      </h1>
      <p className="t4-regular mt-x1_5 text-fg-neutral-muted">
        북마크한 기사를 모아 뒀어요. 최근에 담은 기사부터 보여줘요.
      </p>
      <div className="mt-x5">
        <QueryState
          query={bookmarks}
          loadingLabel="나의 뉴스함 불러오는 중"
          skeleton={
            <div className="flex flex-col gap-x3">
              {Array.from({ length: 3 }, (_, at) => (
                <Skeleton key={at} radius="8" width="full" height="x12" />
              ))}
            </div>
          }
          errorTitle="나의 뉴스함을 불러오지 못했어요"
          empty={{
            when: (items) => items.length === 0,
            message:
              "아직 담은 기사가 없어요. 기사 옆 북마크를 누르면 여기에 모여요.",
          }}
        >
          {(items) => (
            <ul
              aria-label="담은 기사"
              className="divide-y divide-stroke-neutral-subtle rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x3 py-x1"
            >
              {items.map((article) => (
                <ArticleRow key={article.id} article={article} showCategory />
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </div>
  );
}
