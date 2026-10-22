import { IconArrowClockwiseCircularLine } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "seed-design/ui/action-button";
import { categoriesQuery } from "@/api/categories";
import { api } from "@/api/client";
import { Logo } from "@/components/Logo";

type Health = { status: string };

// 개발 환경 확인용 첫 화면 — 화면 · API 연결이 되는지만 보여 준다. 기능 화면이 생기면 바꾼다
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
  // `npm run dev:mock` 이면 가짜 API 가 답한다
  const categories = useQuery(categoriesQuery);

  let apiStatus = "확인 중";
  if (health.isError) apiStatus = "연결 안 됨";
  if (health.isSuccess) apiStatus = health.data.status;

  let categoryNames = "확인 중";
  if (categories.isError) categoryNames = "받지 못함";
  if (categories.isSuccess)
    categoryNames = categories.data
      .map((category) => category.name)
      .join(" · ");

  return (
    <>
      <header className="border-b border-stroke-neutral-weak px-x6 py-x4">
        <h1>
          <Logo />
        </h1>
      </header>
      <main className="flex flex-col gap-x3 p-x6">
        <p className="t4-regular text-fg-neutral">API 상태: {apiStatus}</p>
        <p className="t4-regular text-fg-neutral">카테고리: {categoryNames}</p>
        <div>
          <ActionButton
            variant="brandSolid"
            loading={health.isFetching}
            onClick={() => health.refetch()}
          >
            <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
            다시 확인
          </ActionButton>
        </div>
      </main>
    </>
  );
}
