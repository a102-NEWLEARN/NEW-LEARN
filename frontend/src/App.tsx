import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "seed-design/ui/action-button";
import { api } from "./api/client";

type Health = { status: string };

// 개발 환경 확인용 첫 화면 — 화면 · API 연결이 되는지만 보여 준다. 기능 화면이 생기면 바꾼다
export function App() {
  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: () => api.get<Health>("/actuator/health").then((res) => res.data),
    retry: false,
  });

  let apiStatus = "확인 중";
  if (health.isError) apiStatus = "연결 안 됨";
  if (health.isSuccess) apiStatus = health.data.status;

  return (
    <main className="flex flex-col gap-x3 p-x6">
      <h1 className="screen-title">NEW:LEARN</h1>
      <p className="t4-regular text-fg-neutral">API 상태: {apiStatus}</p>
      <div>
        <ActionButton
          variant="neutralWeak"
          loading={health.isFetching}
          onClick={() => health.refetch()}
        >
          다시 확인
        </ActionButton>
      </div>
    </main>
  );
}
