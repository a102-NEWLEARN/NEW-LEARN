import { IconStarFill } from "@karrotmarket/react-monochrome-icon";
import {
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@seed-design/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Category } from "@/api/categories";
import type { Member } from "@/api/members";

export type CategoryTab = {
  code: string;
  name: string;
  /** 관심 분야면 별을 붙인다 */
  marked?: boolean;
};

// 관심 분야(별) → 나머지 분야. 둘 다 A1 순서다. 준비 중 분야(스포츠 · 문화/연예)는 두지 않는다(2026-11-13 Jira 202).
// 홈 추천 이슈와 분야별 이슈 화면이 같은 순서를 쓴다 (EXPERIENCE.md Component Patterns 「분야 탭」)
export function orderCategoryTabs(
  categories: readonly Category[],
  member: Member | null,
): CategoryTab[] {
  const interests = new Set(member?.categories.map((item) => item.code));
  const toTab = (category: Category): CategoryTab => ({
    code: category.code,
    name: category.name,
    marked: interests.has(category.code),
  });
  return [
    ...categories.filter((item) => interests.has(item.code)).map(toTab),
    ...categories.filter((item) => !interests.has(item.code)).map(toTab),
  ];
}

type CategoryTabsProps = {
  /** 탭 묶음의 이름. 예: 「분야」 */
  label: string;
  tabs: CategoryTab[];
  value: string;
  onValueChange: (code: string) => void;
  /** 고른 탭의 내용 */
  children: ReactNode;
};

// 분야 탭 — 하나만 고른다 (EXPERIENCE.md Component Patterns). ←→ · Home/End 는 SEED Tabs 가 한다.
// 탭이 넘치면 탭 줄이 가로로 스크롤한다.
// 모양은 DESIGN.md · v2 CategoryTabs: 기본 fg-neutral-muted Medium, 고르면 fg-neutral Bold + 2px 청록 밑줄, 밑선 1px.
// 좁은 화면은 14px — 바로 위 「추천 이슈 / 최신 기사」 보기 탭(16px)보다 한 단계 아래로 보인다.
// 오른쪽으로 더 밀 탭이 남았으면 줄 끝을 흐린다 — 글자가 잘린 채 끝나 깨진 것처럼 보였다 (2026-11-05 UI 점검).
export function CategoryTabs({
  label,
  tabs,
  value,
  onValueChange,
  children,
}: CategoryTabsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  // 오른쪽으로 더 밀 것이 남았나 — 밀 때 · 화면 폭이 바뀔 때 다시 잰다
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () =>
      setMoreRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      row.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [tabs.length]);

  // 고른 탭이 탭 줄 밖에 있으면(?category= 로 열었을 때 등) 그쪽으로 가로 스크롤한다.
  // SEED Tabs 도 이 일을 하지만 스크롤하는 것이 TabsList 가 아니라 아래 탭 줄이라 여기서 한다
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector('[role="tab"][aria-selected="true"]');
    if (!row || !tab) return;
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left < rowBox.left) row.scrollLeft -= rowBox.left - tabBox.left;
    else if (tabBox.right > rowBox.right)
      row.scrollLeft += tabBox.right - rowBox.right;
  }, [value]);

  return (
    <TabsRoot
      value={value}
      onValueChange={onValueChange}
      triggerLayout="hug"
      size="medium"
    >
      {/* 탭 줄이 가로 스크롤한다. 밑선은 이 줄 전체에 긋는다 */}
      <div className="relative" data-more-right={moreRight || undefined}>
        <div
          ref={rowRef}
          className="flex gap-x5 overflow-x-auto shadow-[inset_0_-1px_var(--seed-color-stroke-neutral-weak)] [scrollbar-width:none] md:gap-x6"
        >
          <TabsList
            aria-label={label}
            className="shrink-0 gap-x5 overflow-visible bg-transparent px-0 shadow-none md:gap-x6"
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.code}
                value={tab.code}
                className="t4-medium md:t5-medium gap-x1 px-0 text-fg-neutral-muted hover:text-fg-neutral aria-selected:t4-bold aria-selected:text-fg-neutral md:aria-selected:t5-bold"
              >
                {tab.marked && (
                  <IconStarFill
                    aria-hidden
                    size={14}
                    className="mb-[3px] text-fg-brand"
                  />
                )}
                {tab.name}
                {tab.marked && <span className="sr-only">, 관심 분야</span>}
              </TabsTrigger>
            ))}
            <TabsIndicator className="border-b-bg-brand-solid" />
          </TabsList>
        </div>
        {/* 오른쪽 끝 흐림 — 밑선(아래 1px)은 덮지 않는다. SEED 테마에 위치 · 폭 토큰 클래스가 없어 px 로 쓴다 */}
        {moreRight && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 bottom-[1px] w-[40px] bg-[linear-gradient(to_left,var(--seed-color-bg-layer-default),transparent)]"
          />
        )}
      </div>
      {/* 탭마다 내용 자리를 둬서 탭의 aria-controls 가 가리킬 곳이 있게 한다. 내용은 고른 탭에만 그린다 */}
      {tabs.map((tab) => (
        <TabsContent key={tab.code} value={tab.code}>
          {tab.code === value && children}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}
