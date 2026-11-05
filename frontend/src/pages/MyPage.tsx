import { Skeleton } from "@seed-design/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { logout } from "@/api/auth";
import { bookmarksQuery } from "@/api/bookmarks";
import { interestIssuesQuery } from "@/api/interestIssues";
import { meQuery } from "@/api/members";
import { InterestIssues } from "@/components/mypage/InterestIssues";
import { InterestSettings } from "@/components/mypage/InterestSettings";
import { MyPageSection } from "@/components/mypage/MyPageSection";
import { errorDescription } from "@/components/state/ErrorState";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";
import { useSnackbar } from "@/components/useSnackbar";
import { metaLine } from "@/lib/meta";

// 마이페이지 — 이름 · 아이디 보기, 관심 분야 바꾸기, 관심 이슈와 로그아웃
// (EXPERIENCE.md Information Architecture, 프로토타입 v21 MyPageScreen)
export function MyPage() {
  usePageTitle("마이페이지");
  const me = useQuery(meQuery);
  const member = me.data;
  // 머리 줄의 개수 — 아래 관심 이슈 섹션 · 나의 뉴스함과 같은 쿼리라 받아 둔 것이 있으면 다시 안 부른다
  const interestIssues = useQuery(interestIssuesQuery);
  const bookmarks = useQuery(bookmarksQuery);
  // 셋 다 받았을 때만 그린다. 받는 중이거나 하나라도 실패하면 줄을 두지 않는다 — 아래 섹션이 각자 실패를 알린다
  const counts =
    member && interestIssues.data && bookmarks.data
      ? // 오른쪽 로그아웃 때문에 좁으면 꺾인다 — 점 뒤에서만 (metaLine)
        metaLine([
          `관심 분야 ${member.categories.length}개`,
          `관심 이슈 ${interestIssues.data.length}개`,
          `북마크 ${bookmarks.data.length}개`,
        ])
      : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // 로그아웃하면 손님이 처음 서는 랜딩으로 간다. 손님은 셸 안 화면에 남을 수 없다(RequireMember).
  // 세션이 이미 끊긴 401 도 로그아웃이다(logout). 실패하면 아래에 안내를 띄우고 이 화면에 남는다
  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      navigate("/", { replace: true });
      // 이전 회원이 받아 둔 응답을 모두 버린다 — 기사 · 이슈 응답의 bookmarked · interested 가 회원 기준이다.
      // 그다음 내 정보만 손님(null)으로 둔다. 순서를 바꾸면 null 도 지워져 랜딩이 A17 을 다시 부른다
      queryClient.removeQueries();
      queryClient.setQueryData(meQuery.queryKey, null);
      snackbar.show("로그아웃했어요", "positive");
    },
  });

  function handleLogout() {
    // SEED 버튼은 로딩 중에도 눌린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <div className="mx-auto max-w-[760px] px-x5 pt-x9 pb-[96px] md:px-x6 md:pb-x16">
      {/* 이름 줄 — 아바타 · 이름 · 개수, 오른쪽에 로그아웃. 계정 동작이라 계정 줄에 둔다.
          맨 아래 따로 두면 버튼이 엉뚱한 데 떠 보였다 (2026-11-05 사용자) */}
      <div data-profile className="flex items-center gap-x3_5">
        {member && (
          <span
            aria-hidden
            className="t7-bold flex size-x12 shrink-0 items-center justify-center rounded-full bg-bg-brand-solid text-fg-neutral-inverted"
          >
            {Array.from(member.name)[0]}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-x0_5">
          {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell). 내 정보를 못 받았어도 제목은 첫 렌더에 그린다 */}
          <h1 tabIndex={-1} className="t8-bold text-fg-neutral outline-none">
            {member ? `${member.name}님` : "마이페이지"}
          </h1>
          {/* 머리 줄 — 모바일 v1 · v21 MyPageScreen. 관심 분야는 저장된 것(A17)이다 */}
          {counts && (
            <p className="t3-regular text-fg-neutral-muted">{counts}</p>
          )}
        </div>
        {/* 보조 버튼 모양(DESIGN.md Components) */}
        <ActionButton
          variant="neutralOutline"
          size="small"
          className="shrink-0"
          loading={mutation.isPending}
          aria-busy={mutation.isPending || undefined}
          onClick={handleLogout}
        >
          로그아웃
        </ActionButton>
      </div>
      {mutation.isError && (
        <p
          role="alert"
          className="t4-medium mt-x3 rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
        >
          {errorDescription(mutation.error)}
        </p>
      )}
      {/* 개인정보 → 관심 분야 → 관심 이슈 — 카드마다(MyPageSection). 관심 분야 저장은 그 카드 제목 오른쪽 */}
      <div className="mt-x6 flex flex-col gap-x3">
        <MyPageSection title="개인정보">
          <QueryState
            query={me}
            loadingLabel="내 정보 불러오는 중"
            skeleton={
              <Skeleton radius="8" width="x40" height="lineHeight.t4" />
            }
            errorTitle="내 정보를 불러오지 못했어요"
          >
            {(data) =>
              data && (
                // 이름 · 아이디는 바꿀 수 없다 (EXPERIENCE.md IA 마이페이지 행). 행 사이는 카드 안 구분선
                <dl className="divide-y divide-stroke-neutral-subtle">
                  {[
                    ["이름", data.name],
                    ["아이디", data.loginId],
                  ].map(([term, value]) => (
                    <div key={term} className="flex items-center gap-x3 py-x3">
                      <dt className="t3-regular w-[72px] shrink-0 text-fg-neutral-muted">
                        {term}
                      </dt>
                      <dd className="t4-regular min-w-0 flex-1 truncate text-fg-neutral">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )
            }
          </QueryState>
        </MyPageSection>
        {member && <InterestSettings member={member} />}
        <InterestIssues />
      </div>
    </div>
  );
}
