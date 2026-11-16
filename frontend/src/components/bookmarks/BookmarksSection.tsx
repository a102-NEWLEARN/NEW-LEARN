import { type ReactNode, useId } from "react";

/** 나의 뉴스함 목록 상자 — 관심 이슈 · 북마크한 기사가 같은 모양이다. 행 사이는 안쪽 구분선 */
export const BOOKMARKS_LIST =
  "divide-y divide-stroke-neutral-subtle rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x3 py-x1";

type BookmarksSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

// 나의 뉴스함 섹션 — 제목 · 한 줄 설명 · 내용. 글자는 마이페이지 섹션(MyPageSection)과 같고 위 줄은 긋지 않는다 —
// 목록 상자가 이미 섹션을 나눈다 (docs/plans/2026-11-16-library-interest-issues.md)
export function BookmarksSection({
  title,
  description,
  children,
}: BookmarksSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="t6-bold text-fg-neutral">
        {title}
      </h2>
      <p className="t3-regular mt-x1 text-fg-neutral-muted">{description}</p>
      <div className="mt-x4">{children}</div>
    </section>
  );
}
