import {
  IconChevronRightSmallLine,
  IconStarFill,
} from "@karrotmarket/react-monochrome-icon";
import { Skeleton, SuffixIcon } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useSearchParams } from "react-router";
import { type Category, categoriesQuery } from "@/api/categories";
import { issuesQuery } from "@/api/issues";
import type { Member } from "@/api/members";
import { type CategoryTab, CategoryTabs } from "@/components/CategoryTabs";
import { IssueCard } from "@/components/IssueCard";
import { LoadingState } from "@/components/state/LoadingState";
import { QueryState } from "@/components/state/QueryState";
import { ActionButton } from "seed-design/ui/action-button";

// 탭마다 보일 이슈 수 (EXPERIENCE.md Information Architecture 홈 행)
const ISSUES_PER_TAB = 3;

type RecommendedIssuesProps = {
  /** 회원이면 관심 분야 탭을 앞에 둔다. 손님이면 null */
  member: Member | null;
  /** A17 을 아직 받는 중. 탭 순서가 정해지지 않아 그동안 자리만 둔다 */
  pending: boolean;
};

// 관심 분야(별) → 나머지 분야. 둘 다 A1 순서다. 준비 중 분야는 CategoryTabs 가 끝에 붙인다
// (EXPERIENCE.md Component Patterns 「분야 탭」)
function orderTabs(categories: Category[], member: Member | null) {
  const interests = new Set(member?.categories.map((item) => item.code));
  const toTab = (category: Category): CategoryTab => ({
    code: category.code,
    name: category.name,
    marked: interests.has(category.code),
  });
  return [
    ...categories.filter((item) => interests.has(item.code)).map(toTab),
    ...categories.filter((item) => !interests.has(item.code)).map(toTab),
  ];
}

// 추천 이슈 — 분야 탭과 그 분야 이슈 카드 3장 (프로토타입 v21).
// 고른 분야는 주소 `?category=` 에 남긴다. 같은 화면 안의 선택이라 기록을 쌓지 않고 주소만 바꾼다
// (EXPERIENCE.md 이동 규칙). 모르는 코드면 맨 앞 탭을 고른다
export function RecommendedIssues({ member, pending }: RecommendedIssuesProps) {
  const headingId = useId();
  const categories = useQuery(categoriesQuery);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = categories.data ? orderTabs(categories.data, member) : [];
  const requested = searchParams.get("category");
  const selected =
    tabs.find((tab) => tab.code === requested)?.code ?? tabs[0]?.code;

  const issues = useQuery({
    ...issuesQuery({ category: selected, size: ISSUES_PER_TAB }),
    enabled: !pending && selected !== undefined,
  });

  const selectCategory = (code: string) =>
    setSearchParams(
      (params) => {
        params.set("category", code);
        return params;
      },
      { replace: true },
    );

  const hasInterests = (member?.categories.length ?? 0) > 0;

  // A17 을 받는 동안에는 제목(「OO님을 위한」)도 탭 순서도 정해지지 않아 자리만 둔다.
  // 인사 줄(HomeGreeting)처럼, 글자가 눈앞에서 바뀌지 않게 한다
  if (pending) {
    return (
      <LoadingState label="추천 이슈 불러오는 중">
        <Skeleton
          radius="8"
          width="full"
          height="lineHeight.t7"
          className="max-w-[240px]"
        />
        <Skeleton
          radius="8"
          width="full"
          height="lineHeight.t4"
          className="mt-x1 max-w-[360px]"
        />
        <div className="mt-x2_5">
          <TabsSkeleton />
          <CardsSkeleton />
        </div>
      </LoadingState>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-end justify-between gap-x3">
        <div>
          <h2 id={headingId} className="t7-bold text-fg-neutral">
            {member ? `${member.name}님을 위한 추천 이슈` : "추천 이슈"}
          </h2>
          <p className="t4-regular mt-x1 text-fg-neutral-muted">
            여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요.
            {hasInterests && (
              <>
                {" "}
                <IconStarFill
                  aria-hidden
                  size={12}
                  className="inline align-baseline text-fg-brand"
                />
                <span className="sr-only">별표</span>는 관심 분야예요.
              </>
            )}
          </p>
        </div>
        <ActionButton
          asChild
          variant="ghost"
          size="small"
          className="-mr-x2 shrink-0"
        >
          <Link to="/me">
            관심사 편집
            <SuffixIcon svg={<IconChevronRightSmallLine />} />
          </Link>
        </ActionButton>
      </div>
      <div className="mt-x2_5">
        <QueryState
          query={categories}
          loadingLabel="분야 불러오는 중"
          skeleton={<TabsSkeleton />}
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
                <QueryState
                  query={issues}
                  loadingLabel="추천 이슈 불러오는 중"
                  skeleton={<CardsSkeleton />}
                  errorTitle="추천 이슈를 불러오지 못했어요"
                  empty={{
                    when: (page) => page.items.length === 0,
                    message: "이 분야의 이슈가 아직 없어요",
                  }}
                >
                  {(page) => (
                    <ul className="mt-x4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x4">
                      {page.items.map((issue) => (
                        <li key={issue.id}>
                          <IssueCard issue={issue} />
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryState>
              </CategoryTabs>
            )
          }
        </QueryState>
      </div>
    </section>
  );
}

function TabsSkeleton() {
  return (
    <Skeleton
      radius="8"
      width="full"
      height="lineHeight.t5"
      className="my-x3"
    />
  );
}

// 이슈 카드 3장 자리
function CardsSkeleton() {
  return (
    <div className="mt-x4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x4">
      {Array.from({ length: ISSUES_PER_TAB }, (_, index) => (
        <Skeleton key={index} radius="16" width="full" height="x40" />
      ))}
    </div>
  );
}
