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
                className="flex flex-wrap items-center justify-center gap-x-x2_5 gap-y-x1"
              >
                {/* 이슈 사이에 가운데 점 — 장식이라 글자로 넣지 않는다 */}
                {items.map((issue) => (
                  <li
                    key={issue.id}
                    className="flex items-center gap-x2_5 before:size-[2px] before:rounded-full before:bg-fg-neutral-subtle before:content-[''] first:before:hidden"
                  >
                    {/* 누르는 높이 27px — 줄 18 + 위아래 4 + 밑줄 1. 24px 아래로 내리지 않는다 (EXPERIENCE.md Accessibility Floor) */}
                    <Link
                      to={`/issues/${issue.id}`}
                      className="border-b border-transparent py-x1text-fg-neutral-muted transition-colors hover:border-stroke-brand-weak hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
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
