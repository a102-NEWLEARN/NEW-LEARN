import { IconChevronRightSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { interestIssuesQuery } from "@/api/interestIssues";
import {
  BOOKMARKS_LIST,
  BookmarksSection,
} from "@/components/bookmarks/BookmarksSection";
import { QueryState } from "@/components/state/QueryState";

// 나의 뉴스함 관심 이슈 — 별표로 저장한 이슈를 저장한 순서대로 (A25, 프로토타입 v21 LibraryScreen 「이슈」 묶음).
// 마이페이지에 있던 것을 옮겼다 — 저장한 것은 뉴스함, 계정 설정은 마이페이지 (2026-11-16 사용자, Jira 216).
// 「지난 방문 이후 새 사건 N」 배지는 데이터가 없어 그리지 않는다 (docs/api-screen.md A25)
export function InterestIssues() {
  const issues = useQuery(interestIssuesQuery);

  return (
    <BookmarksSection title="관심 이슈" description="별표로 저장한 이슈예요.">
      <QueryState
        query={issues}
        loadingLabel="관심 이슈 불러오는 중"
        skeleton={
          <div className="flex flex-col gap-x3">
            {Array.from({ length: 2 }, (_, at) => (
              <Skeleton key={at} radius="8" width="full" height="x12" />
            ))}
          </div>
        }
        errorTitle="관심 이슈를 불러오지 못했어요"
        empty={{
          when: (items) => items.length === 0,
          message:
            "아직 저장한 이슈가 없어요. 이슈 이름 옆 별표를 눌러 보세요.",
        }}
      >
        {(items) => (
          // 북마크한 기사와 같은 상자 · 같은 행 여백(ArticleRow)
          <ul aria-label="관심 이슈" className={BOOKMARKS_LIST}>
            {items.map((issue) => (
              <li key={issue.id}>
                <Link
                  to={`/issues/${issue.id}`}
                  className="flex items-center gap-x3 rounded-r2 px-x2 py-x3 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-x1">
                    <span className="t5-medium line-clamp-2 text-fg-neutral">
                      {issue.title}
                    </span>
                    <span className="t2-regular text-fg-neutral-muted tabular-nums">
                      {[
                        ...issue.categories.map((category) => category.name),
                        `사건 ${issue.eventCount}개`,
                      ].join(" · ")}
                    </span>
                  </span>
                  <IconChevronRightSmallLine
                    aria-hidden
                    size={16}
                    className="shrink-0 text-fg-neutral-subtle"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </BookmarksSection>
  );
}
