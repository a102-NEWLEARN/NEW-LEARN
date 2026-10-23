import type { ReactNode } from "react";

type LoadingStateProps = {
  /** 스크린 리더가 읽을 이름. 예: 「추천 이슈 불러오는 중」 */
  label: string;
  /** 그 자리 모양을 딴 스켈레톤 (SEED Skeleton) */
  children: ReactNode;
};

// 불러오는 중 — 스피너 대신 그 자리 모양의 스켈레톤을 둔다 (EXPERIENCE.md State Patterns)
export function LoadingState({ label, children }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
