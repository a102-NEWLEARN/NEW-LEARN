type EmptyStateProps = {
  /** 빈 결과 문구. 화면마다 문구는 EXPERIENCE.md State Patterns 표에 있다 */
  message: string;
};

// 빈 결과 — 그 자리에 문구 한 줄을 둔다. 모양은 프로토타입 v21 의 빈 목록 문구를 따른다
export function EmptyState({ message }: EmptyStateProps) {
  return <p className="t4-regular py-x5 text-fg-neutral-muted">{message}</p>;
}
