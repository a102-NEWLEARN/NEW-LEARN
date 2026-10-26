import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";

type QueryStateProps<TData> = {
  query: UseQueryResult<TData>;
  /** 불러오는 중에 스크린 리더가 읽을 이름. 예: 「추천 이슈 불러오는 중」 */
  loadingLabel: string;
  /** 불러오는 중에 보일, 그 자리 모양을 딴 스켈레톤 */
  skeleton: ReactNode;
  /** 실패했을 때 제목. 예: 「추천 이슈를 불러오지 못했어요」 */
  errorTitle: string;
  /** 빈 결과로 볼 조건과 그때 보일 문구. 없으면 빈 결과를 따로 그리지 않는다 */
  empty?: { when: (data: TData) => boolean; message: string };
  children: (data: TData) => ReactNode;
};

// 영역 하나의 요청 상태를 가른다 — 불러오는 중 · 빈 결과 · 실패와 다시 시도 · 내용 (EXPERIENCE.md State Patterns).
// 데이터가 한 번 왔으면 그 뒤 다시 불러오기가 실패해도 받은 데이터를 계속 보여 준다
export function QueryState<TData>({
  query,
  loadingLabel,
  skeleton,
  errorTitle,
  empty,
  children,
}: QueryStateProps<TData>) {
  if (query.data !== undefined) {
    if (empty?.when(query.data)) return <EmptyState message={empty.message} />;
    return children(query.data);
  }

  if (query.isError) {
    return (
      <ErrorState
        title={errorTitle}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <LoadingState label={loadingLabel}>{skeleton}</LoadingState>;
}
