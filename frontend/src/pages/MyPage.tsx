import { Skeleton } from "@seed-design/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { logout } from "@/api/auth";
import { meQuery } from "@/api/members";
import { InterestSettings } from "@/components/mypage/InterestSettings";
import { errorDescription } from "@/components/state/ErrorState";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";
import { useSnackbar } from "@/components/useSnackbar";

// 마이페이지 — 관심 분야 바꾸기 · 이름 · 아이디 보기와 로그아웃 (EXPERIENCE.md Information Architecture, 프로토타입 v21 MyPageScreen).
// 관심 이슈(S15P31A102-68)는 그 티켓에서 붙인다
export function MyPage() {
  usePageTitle("마이페이지");
  const me = useQuery(meQuery);
  const member = me.data;
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
    <div className="mx-auto max-w-[760px] px-x4 pt-x9 pb-x16 md:px-x6">
      <div className="flex items-center gap-x3_5">
        {member && (
          <span
            aria-hidden
            className="t7-bold flex size-x12 shrink-0 items-center justify-center rounded-full bg-bg-brand-solid text-fg-neutral-inverted"
          >
            {Array.from(member.name)[0]}
          </span>
        )}
        {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell). 내 정보를 못 받았어도 제목은 첫 렌더에 그린다 */}
        <h1 tabIndex={-1} className="t8-bold text-fg-neutral outline-none">
          {member ? `${member.name}님` : "마이페이지"}
        </h1>
      </div>
      {/* 관심 분야 · 개인정보 · 로그아웃 — 섹션마다 위에 줄을 긋는다 */}
      <div className="mt-x5">
        {member && <InterestSettings member={member} />}
        <section
          aria-labelledby="mypage-info"
          className="border-t border-stroke-neutral-weak py-x5"
        >
          <h2 id="mypage-info" className="t5-bold text-fg-neutral">
            개인정보
          </h2>
          <div className="mt-x3">
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
                  // 이름 · 아이디는 바꿀 수 없다 (EXPERIENCE.md IA 마이페이지 행)
                  <dl>
                    {[
                      ["이름", data.name],
                      ["아이디", data.loginId],
                    ].map(([term, value]) => (
                      <div
                        key={term}
                        className="flex items-center gap-x3 border-stroke-neutral-weak py-x3 not-first:border-t"
                      >
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
          </div>
        </section>
        <section className="border-t border-stroke-neutral-weak py-x5">
          {/* 버튼 안쪽 여백만큼 바깥으로 당겨 글자를 위 칸 줄에 맞춘다 (프로토타입 v21) */}
          <ActionButton
            variant="ghost"
            color="fg.neutralMuted"
            bleedX="asPadding"
            loading={mutation.isPending}
            aria-busy={mutation.isPending || undefined}
            onClick={handleLogout}
          >
            로그아웃
          </ActionButton>
          {mutation.isError && (
            <p
              role="alert"
              className="t4-medium mt-x3 rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
            >
              {errorDescription(mutation.error)}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
