import { IconArrowClockwiseCircularLine } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon, Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "seed-design/ui/action-button";
import { categoriesQuery } from "@/api/categories";
import { api } from "@/api/client";
import { QueryState } from "@/components/state/QueryState";
import { useComingSoon } from "@/components/useSnackbar";

type Health = { status: string };

// 개발 환경 확인용 화면 — 화면 · API 연결이 되는지만 보여 준다. 지금은 셸 안 /home 자리에 뜨고
// 홈 화면(S15P31A102-44)이 생기면 바꾼다
export function App() {
  const health = useQuery({
    queryKey: ["api-health"],
    // 헬스는 /api/v1 밖에 있어 기본 주소를 덮는다
    queryFn: () =>
      api
        .get<Health>("/actuator/health", { baseURL: "/" })
        .then((res) => res.data),
    retry: false,
  });
  // `npm run dev:mock` 이면 가짜 API 가 답한다. 백엔드 없이 `npm run dev` 면 실패 상태를 볼 수 있다
  const categories = useQuery(categoriesQuery);
  const comingSoon = useComingSoon();

  let apiStatus = "확인 중";
  if (health.isError) apiStatus = "연결 안 됨";
  if (health.isSuccess) apiStatus = health.data.status;

  return (
    <div className="flex flex-col gap-x3 p-x6">
      <h1 className="t6-bold text-fg-neutral">개발 확인</h1>
      <p className="t4-regular text-fg-neutral">API 상태: {apiStatus}</p>
      <QueryState
        query={categories}
        loadingLabel="카테고리 불러오는 중"
        skeleton={<Skeleton radius="8" width="250px" height="lineHeight.t4" />}
        errorTitle="카테고리를 불러오지 못했어요"
        empty={{
          when: (data) => data.length === 0,
          message: "카테고리가 아직 없어요",
        }}
      >
        {(data) => (
          <p className="t4-regular text-fg-neutral">
            카테고리: {data.map((category) => category.name).join(" · ")}
          </p>
        )}
      </QueryState>
      <div className="flex gap-x2">
        <ActionButton
          variant="brandSolid"
          loading={health.isFetching}
          onClick={() => health.refetch()}
        >
          <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
          다시 확인
        </ActionButton>
        <ActionButton variant="neutralOutline" onClick={comingSoon}>
          곧 제공 알림 확인
        </ActionButton>
      </div>
    </div>
  );
}
