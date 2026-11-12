import { type ReactNode, useId } from "react";

type MyPageSectionProps = {
  title: string;
  description?: string;
  /** 제목 id — 안의 묶음이 제목으로 이름을 받을 때 바깥에서 준다 (관심 분야 칩) */
  headingId?: string;
  children: ReactNode;
};

// 마이페이지 섹션 — 위 1px 줄로 나누고 제목 · 한 줄 설명 · 내용. 상자(카드)는 두지 않는다 —
// 상자가 늘어선 것이 예쁘지 않았다 (2026-11-12 사용자, Jira 195. 11-05 S15P31A102-182 에서 넣은 카드를 되돌렸다).
// 줄만으로 밋밋하지 않게 제목을 한 단계 키우고(18px) 섹션 위아래를 24px 띄운다
export function MyPageSection({
  title,
  description,
  headingId,
  children,
}: MyPageSectionProps) {
  const ownId = useId();
  const id = headingId ?? ownId;
  return (
    <section
      aria-labelledby={id}
      className="border-t border-stroke-neutral-weak py-x6"
    >
      <h2 id={id} className="t6-bold text-fg-neutral">
        {title}
      </h2>
      {description && (
        <p className="t3-regular mt-x1 text-fg-neutral-muted">{description}</p>
      )}
      <div className="mt-x4">{children}</div>
    </section>
  );
}
