import { IconChevronRightSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton, SuffixIcon } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useSearchParams } from "react-router";
import { categoriesQuery } from "@/api/categories";
import { interestIssuesQuery } from "@/api/interestIssues";
import { type IssueSummary, issuesQuery } from "@/api/issues";
import type { Member } from "@/api/members";
import type { Page } from "@/api/types";
import { CategoryTabs, orderCategoryTabs } from "@/components/CategoryTabs";
import { IssueCard } from "@/components/IssueCard";
import { CARD_RISE, cardAt, GROUP_RISE } from "@/components/motion/appMotion";
import { LoadingState } from "@/components/state/LoadingState";
import { QueryState } from "@/components/state/QueryState";
import { useSignupPrompt } from "@/components/useSignupPrompt";
import { ActionButton } from "seed-design/ui/action-button";

// 탭마다 보일 이슈 수 (EXPERIENCE.md Information Architecture 홈 행)
const ISSUES_PER_TAB = 3;

// 머리 오른쪽 *관심사 편집* 자리 — 좁은 화면에서는 숨긴다 (2026-11-12 사용자, Jira 195)
const EDIT_INTERESTS =
  "col-start-2 row-span-2 row-start-1 shrink-0 self-end max-md:hidden";

type RecommendedIssuesProps = {
  /** 회원이면 관심 분야 탭을 앞에 둔다. 손님이면 null */
  member: Member | null;
  /** A17 을 아직 받는 중. 탭 순서가 정해지지 않아 그동안 자리만 둔다 */
  pending: boolean;
};

// 그 분야의 관심 이슈를 먼저, 그다음 A2 순서(마지막 사건 최신순)에서 겹치지 않는 것 (PRD FR-28 · 프로토타입 v21 rank, Jira 172).
// 관심 이슈끼리도 마지막 사건 최신순이고 사건이 없는 이슈는 뒤다. A2 앞 3개 밖의 관심 이슈도 앞에 오도록 A25 에서 고른다.
// 그 분야 이슈가 모자라도 다른 관심 분야 이슈로 채우지 않는다 — v21 이 채우기를 껐다(fill = [])
function pickRecommended(
  category: string,
  interests: readonly IssueSummary[],
  latest: readonly IssueSummary[],
) {
  const starred = interests
    .filter((issue) => issue.categories.some((item) => item.code === category))
    .sort((a, b) => (b.lastEventAt ?? "").localeCompare(a.lastEventAt ?? ""));
  const starredIds = new Set(starred.map((issue) => issue.id));
  return [
    ...starred,
    ...latest.filter((issue) => !starredIds.has(issue.id)),
  ].slice(0, ISSUES_PER_TAB);
}

// 추천 이슈 — 분야 탭과 그 분야 이슈 카드 3장 (프로토타입 v21).
// 고른 분야는 주소 `?category=` 에 남긴다. 같은 화면 안의 선택이라 기록을 쌓지 않고 주소만 바꾼다
// (EXPERIENCE.md 이동 규칙). 모르는 코드면 맨 앞 탭을 고른다
export function RecommendedIssues({ member, pending }: RecommendedIssuesProps) {
  const headingId = useId();
  const signupPrompt = useSignupPrompt("categories");
  const categories = useQuery(categoriesQuery);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = categories.data
    ? orderCategoryTabs(categories.data, member)
    : [];
  const requested = searchParams.get("category");
  const selectedTab = tabs.find((tab) => tab.code === requested) ?? tabs[0];
  const selected = selectedTab?.code;
  const selectedName = selectedTab?.name;

  const issues = useQuery({
    ...issuesQuery({ category: selected, size: ISSUES_PER_TAB }),
    enabled: !pending && selected !== undefined,
  });
  // 회원의 관심 이슈(A25) — 그 분야 것을 앞에 둔다. 손님은 관심 이슈가 없어 부르지 않는다
  const interests = useQuery({
    ...interestIssuesQuery,
    enabled: !pending && member !== null,
  });
  // A25 를 받는 동안은 카드 자리만 둔다 — A2 순서로 그렸다가 눈앞에서 바뀌지 않게. 실패하면 A2 순서 그대로 둔다
  const waitingInterests = member !== null && interests.isPending;
  const pick = (page: Page<IssueSummary>) =>
    selected === undefined
      ? page.items
      : pickRecommended(selected, interests.data ?? [], page.items);

  const selectCategory = (code: string) =>
    setSearchParams(
      (params) => {
        params.set("category", code);
        return params;
      },
      { replace: true },
    );

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
      {/* 제목 · 설명 | 관심사 편집. 설명은 한 문장까지만, 좁은 화면은 관심사 편집을 숨겨 제목 · 설명만 둔다
          (2026-11-12 사용자, Jira 195 — 폰 첫 화면에 글이 많았다). 관심사 편집은 마이페이지(헤더 프로필 메뉴)로도 간다 */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-x3">
        <h2
          id={headingId}
          data-coach="recommended"
          className="t7-bold col-span-2 row-start-1 justify-self-start text-fg-neutral md:col-span-1"
        >
          {member ? `${member.name}님을 위한 추천 이슈` : "추천 이슈"}
        </h2>
        <p className="t4-regular col-span-2 row-start-2 mt-x1 text-fg-neutral-muted md:col-span-1">
          여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요.
        </p>
        {/* 글자를 오른쪽 끝에 맞추려 바깥으로 빼면(음수 여백) 보기 탭 내용 칸이 잘라 누를 때 바탕이 잘린다 — 빼지 않는다.
            손님은 관심 분야가 없다 — 마이페이지 대신 가입 권유 창을 띄운다 (Jira 205) */}
        {member === null ? (
          <ActionButton
            variant="ghost"
            size="small"
            className={EDIT_INTERESTS}
            data-coach="interests"
            onClick={(event) => signupPrompt.open(event.currentTarget)}
          >
            관심사 편집
            <SuffixIcon svg={<IconChevronRightSmallLine />} />
          </ActionButton>
        ) : (
          <ActionButton
            asChild
            variant="ghost"
            size="small"
            className={EDIT_INTERESTS}
            data-coach="interests"
          >
            <Link to="/me">
              관심사 편집
              <SuffixIcon svg={<IconChevronRightSmallLine />} />
            </Link>
          </ActionButton>
        )}
        {signupPrompt.dialog}
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
                {waitingInterests ? (
                  <LoadingState label="추천 이슈 불러오는 중">
                    <CardsSkeleton />
                  </LoadingState>
                ) : (
                  <QueryState
                    query={issues}
                    loadingLabel="추천 이슈 불러오는 중"
                    skeleton={<CardsSkeleton />}
                    errorTitle="추천 이슈를 불러오지 못했어요"
                    empty={{
                      when: (page) => pick(page).length === 0,
                      message: "이 분야의 이슈가 아직 없어요",
                    }}
                  >
                    {(page) => (
                      <>
                        {/* 분야를 바꾸면 CategoryTabs 가 그 탭 칸에 새로 그려 묶음이 떠오르고 카드가 차례로 나온다 (appMotion.ts) */}
                        <ul
                          className={`mt-x4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x4 ${GROUP_RISE}`}
                        >
                          {pick(page).map((issue, index) => (
                            <li
                              key={issue.id}
                              className={CARD_RISE}
                              style={cardAt(index)}
                            >
                              <IssueCard issue={issue} />
                            </li>
                          ))}
                        </ul>
                        {/* 그 분야 이슈를 모두 보는 화면으로 — 카드 다음 차례에 떠오른다. 글자는 「전체보기」만
                            (2026-11-13 사용자, Jira 202), 화면 읽기 이름에는 어느 분야인지 남긴다.
                            좁은 화면은 엄지로 누르기 쉽게 한 줄을 다 쓴다 */}
                        <div
                          className={`mt-x5 flex justify-center ${CARD_RISE}`}
                          style={cardAt(pick(page).length)}
                        >
                          <ActionButton
                            asChild
                            variant="neutralOutline"
                            size="small"
                            className="border-stroke-neutral-weak max-md:h-[44px] max-md:w-full"
                          >
                            <Link
                              to={`/issues?category=${selected}`}
                              aria-label={`${selectedName} 이슈 전체보기`}
                            >
                              전체보기
                              <SuffixIcon svg={<IconChevronRightSmallLine />} />
                            </Link>
                          </ActionButton>
                        </div>
                      </>
                    )}
                  </QueryState>
                )}
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
