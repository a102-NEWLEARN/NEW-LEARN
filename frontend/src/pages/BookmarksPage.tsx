import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { bookmarksQuery } from "@/api/bookmarks";
import { ArticleRow } from "@/components/ArticleRow";
import {
  BOOKMARKS_LIST,
  BookmarksSection,
} from "@/components/bookmarks/BookmarksSection";
import { InterestIssues } from "@/components/bookmarks/InterestIssues";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";

// 나의 뉴스함 — 저장한 것을 모은다. 관심 이슈(A25) → 북마크한 기사(A22, 최근에 담은 순서) (프로토타입 v21 LibraryScreen).
// 관심 이슈는 마이페이지에서 옮겼다(2026-11-16 사용자, Jira 216). 두 섹션은 따로 불러와 한쪽이 실패해도 다른 쪽은 보인다.
// v21 의 분야 탭은 두지 않는다 — 담은 기사가 적으면 탭이 비어 보인다 [가정]
export function BookmarksPage() {
  usePageTitle("나의 뉴스함");
  const bookmarks = useQuery(bookmarksQuery);

  return (
    <div className="mx-auto max-w-[760px] px-x5 pt-x9 pb-[96px] md:px-x6 md:pb-x16">
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell) */}
      <h1 tabIndex={-1} className="t8-bold text-fg-neutral outline-none">
        나의 뉴스함
      </h1>
      <p className="t4-regular mt-x1_5 text-fg-neutral-muted">
        저장한 이슈와 기사를 모아 뒀어요.
      </p>
      <div className="mt-x8 flex flex-col gap-x8">
        <InterestIssues />
        <BookmarksSection
          title="북마크한 기사"
          description="최근에 담은 기사부터 보여줘요."
        >
          <QueryState
            query={bookmarks}
            loadingLabel="북마크한 기사 불러오는 중"
            skeleton={
              <div className="flex flex-col gap-x3">
                {Array.from({ length: 3 }, (_, at) => (
                  <Skeleton key={at} radius="8" width="full" height="x12" />
                ))}
              </div>
            }
            errorTitle="북마크한 기사를 불러오지 못했어요"
            empty={{
              when: (items) => items.length === 0,
              message:
                "아직 담은 기사가 없어요. 기사 옆 북마크를 누르면 여기에 모여요.",
            }}
          >
            {(items) => (
              <ul aria-label="북마크한 기사" className={BOOKMARKS_LIST}>
                {items.map((article, index) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    showCategory
                    listIndex={index}
                    mindmapHint
                  />
                ))}
              </ul>
            )}
          </QueryState>
        </BookmarksSection>
      </div>
    </div>
  );
}
