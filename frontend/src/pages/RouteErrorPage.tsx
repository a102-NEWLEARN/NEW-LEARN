import { useRouteError } from "react-router";
import { ErrorState } from "@/components/state/ErrorState";

// 화면이 렌더 중 터졌을 때 — 셸 안이면 본문 자리에만 뜬다 (routes.tsx 의 shellRoute).
// 화면 코드의 버그라 그대로 다시 그려도 같아서 다시 시도는 새로 고침이다
export function RouteErrorPage() {
  const error = useRouteError();

  return (
    <ErrorState
      title="화면을 보여 드리지 못했어요"
      error={error}
      onRetry={() => window.location.reload()}
    />
  );
}
