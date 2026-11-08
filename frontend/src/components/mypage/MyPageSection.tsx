import { type ReactNode, useId } from "react";

type MyPageSectionProps = {
  title: string;
  description?: string;
  /** 제목 id — 안의 묶음이 제목으로 이름을 받을 때 바깥에서 준다 (관심 분야 칩) */
  headingId?: string;
  /** 제목 줄 오른쪽 버튼 — 관심 분야 *저장* */
  action?: ReactNode;
  children: ReactNode;
};

// 마이페이지 섹션 — 흰 카드에 제목과 한 줄 설명 (DESIGN.md Components 「카드 · 패널」, Shapes 16px).
// 줄로만 나누면 섹션 넷의 무게가 같아 밋밋했다 (2026-11-05 UI 점검, S15P31A102-182).
// 좁은 화면 안쪽 여백 16px — 20px 이면 393 폭에서 관심 분야 칩이 4px 모자라 한 줄 더 꺾였다
export function MyPageSection({
  title,
  description,
  headingId,
  action,
  children,
}: MyPageSectionProps) {
  const ownId = useId();
  const id = headingId ?? ownId;
  return (
    <section
      aria-labelledby={id}
      className="rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default p-x4 md:p-x6"
    >
      <div className="flex items-center justify-between gap-x3">
        <h2 id={id} className="t5-bold text-fg-neutral">
          {title}
        </h2>
        {action}
      </div>
      {description && (
        <p className="t3-regular mt-x1 text-fg-neutral-muted">{description}</p>
      )}
      <div className="mt-x3">{children}</div>
    </section>
  );
}
