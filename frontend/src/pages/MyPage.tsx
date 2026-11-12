import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { bookmarksQuery } from "@/api/bookmarks";
import { interestIssuesQuery } from "@/api/interestIssues";
import { meQuery } from "@/api/members";
import { InterestIssues } from "@/components/mypage/InterestIssues";
import { InterestSettings } from "@/components/mypage/InterestSettings";
import { MyPageSection } from "@/components/mypage/MyPageSection";
import { QueryState } from "@/components/state/QueryState";
import { usePageTitle } from "@/components/usePageTitle";
import { metaLine } from "@/lib/meta";

// 마이페이지 — 이름 · 아이디 보기, 관심 분야 바꾸기, 관심 이슈
// (EXPERIENCE.md Information Architecture, 프로토타입 v21 MyPageScreen). 로그아웃은 헤더 프로필 메뉴에 있다(ProfileMenu)
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
      ? // 좁으면 꺾인다 — 점 뒤에서만 (metaLine)
        metaLine([
          `관심 분야 ${member.categories.length}개`,
          `관심 이슈 ${interestIssues.data.length}개`,
          `북마크 ${bookmarks.data.length}개`,
        ])
      : null;
  return (
    // 회원이면 맨 끝이 화면 아래에 붙는 저장 줄이라 끝 여백을 두지 않는다 — 두면 다 내렸을 때 줄 아래가 빈다
    <div
      className={`mx-auto max-w-[760px] px-x5 pt-x9 md:px-x6 ${member ? "" : "pb-[96px] md:pb-x16"}`}
    >
      {/* 이름 줄 — 아바타 · 이름 · 개수 */}
      <div className="flex items-center gap-x3_5">
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
      </div>
      {/* 개인정보 → 관심 분야 → 관심 이슈 — 섹션마다 위 1px 줄(MyPageSection). 관심 분야 저장은 화면 아래에 붙은 줄 하나 */}
      <div className="mt-x6 flex flex-col">
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
                // 이름 · 아이디는 바꿀 수 없다 (EXPERIENCE.md IA 마이페이지 행). 행 사이는 옅은 구분선
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
        {/* 관심 이슈는 관심 분야와 저장 줄 사이에 둔다 — 저장 줄이 맨 아래에 오게. 내 정보를 못 받았으면 관심 이슈만 */}
        {member ? (
          <InterestSettings member={member}>
            <InterestIssues />
          </InterestSettings>
        ) : (
          <InterestIssues />
        )}
      </div>
    </div>
  );
}
