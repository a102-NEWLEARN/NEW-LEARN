import { IconChevronRightSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { interestIssuesQuery } from "@/api/interestIssues";
import { MyPageSection } from "@/components/mypage/MyPageSection";
import { QueryState } from "@/components/state/QueryState";

// 마이페이지 관심 이슈 — 별표로 저장한 이슈를 저장한 순서대로 (A25, 프로토타입 v21 MyPageScreen).
// 「지난 방문 이후 새 사건 N」 배지는 데이터가 없어 그리지 않는다 (docs/api-screen.md A25)
export function InterestIssues() {
  const issues = useQuery(interestIssuesQuery);

  return (
    <MyPageSection title="관심 이슈" description="별표로 저장한 이슈예요.">
      <QueryState
        query={issues}
        loadingLabel="관심 이슈 불러오는 중"
        skeleton={
          <div className="flex flex-col gap-x2">
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
          // 행 사이는 카드 안 구분선. 누를 때 바탕은 글자 바깥 8px 까지 번진다 — 글자는 제목 줄에 맞는다.
          // SEED 테마는 음수 간격 클래스(-mx-x2)를 만들지 않아 px 로 쓴다
          <ul
            aria-label="관심 이슈"
            className="-mx-[8px] flex flex-col divide-y divide-stroke-neutral-subtle"
          >
            {items.map((issue) => (
              <li key={issue.id}>
                <Link
                  to={`/issues/${issue.id}`}
                  className="flex items-center gap-x2_5 rounded-r2 px-x2 py-x2_5 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t5-medium truncate text-fg-neutral">
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
    </MyPageSection>
  );
}
