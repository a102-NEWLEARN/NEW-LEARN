import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link } from "react-router";
import { issuesQuery } from "@/api/issues";
import { QueryState } from "@/components/state/QueryState";

// 「새로운 이슈」 — 새로 만들어진 이슈 3개를 글자 링크로 (프로토타입 v21, docs/api-screen.md A2 sort=createdAt)
const NEW_ISSUE_COUNT = 3;

export function NewIssues() {
  const issues = useQuery(
    issuesQuery({ sort: "createdAt", size: NEW_ISSUE_COUNT }),
  );
  const labelId = useId();

  return (
    <div className="mt-x5">
      <QueryState
        query={issues}
        loadingLabel="새로운 이슈 불러오는 중"
        skeleton={
          <Skeleton
            radius="8"
            width="full"
            height="lineHeight.t3"
            className="mx-auto max-w-[360px]"
          />
        }
        errorTitle="새로운 이슈를 불러오지 못했어요"
      >
        {/* 하나도 없으면 그 줄을 숨긴다 — 이름만 남은 줄은 누를 것이 없다 */}
        {({ items }) =>
          items.length > 0 && (
            <div className="t3-medium flex flex-wrap items-center justify-center gap-x-x2_5 gap-y-x1">
              <span id={labelId} className="text-fg-neutral-subtle">
                새로운 이슈
              </span>
              <ul
                aria-labelledby={labelId}
                className="flex flex-wrap items-center justify-center gap-x-x3 gap-y-x1"
              >
                {/* 이슈마다 앞에 4px 민트 점(이슈 카드 「최근 사건」 노드와 같은 그래픽) — 장식이라 글자로 넣지 않는다.
                    전에는 이슈 사이 가운데 점이라 줄이 꺾이면 둘째 줄이 점으로 시작했다 */}
                {items.map((issue) => (
                  <li
                    key={issue.id}
                    className="flex items-center gap-x1 before:size-[4px] before:shrink-0 before:rounded-[1px] before:bg-bg-brand-accent before:content-['']"
                  >
                    {/* 누르는 높이 27px — 줄 18 + 위아래 4 + 밑줄 1. 24px 아래로 내리지 않는다 (EXPERIENCE.md Accessibility Floor) */}
                    <Link
                      to={`/issues/${issue.id}`}
                      className="border-b border-transparent py-x1 text-fg-neutral-muted transition-colors hover:border-stroke-brand-weak hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
                    >
                      {issue.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      </QueryState>
    </div>
  );
}
