import { IconStarFill } from "@karrotmarket/react-monochrome-icon";
import {
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@seed-design/react";
import type { ReactNode } from "react";
import { UPCOMING_CATEGORIES } from "@/api/categories";
import { useUpcomingCategory } from "@/components/useSnackbar";

export type CategoryTab = {
  code: string;
  name: string;
  /** 관심 분야면 별을 붙인다 */
  marked?: boolean;
};

type CategoryTabsProps = {
  /** 탭 묶음의 이름. 예: 「분야」 */
  label: string;
  tabs: CategoryTab[];
  value: string;
  onValueChange: (code: string) => void;
  /** 고른 탭의 내용 */
  children: ReactNode;
};

// 분야 탭 — 하나만 고른다 (EXPERIENCE.md Component Patterns). 가로 스크롤 · ←→ · Home/End 는 SEED Tabs 가 한다.
// 모양은 DESIGN.md · v2 CategoryTabs: 기본 fg-neutral-muted Medium, 고르면 fg-neutral Bold + 2px 청록 밑줄, 밑선 1px.
// 준비 중 분야는 고를 수 없어서 탭이 아니라 탭 줄 끝의 버튼이다. SEED 의 disabled 탭은
// 누를 수도 키보드로 닿을 수도 없어 안내를 못 띄운다
export function CategoryTabs({
  label,
  tabs,
  value,
  onValueChange,
  children,
}: CategoryTabsProps) {
  const notifyUpcoming = useUpcomingCategory();

  return (
    <TabsRoot
      value={value}
      onValueChange={onValueChange}
      triggerLayout="hug"
      size="medium"
    >
      {/* 탭과 준비 중 버튼이 한 줄로 가로 스크롤한다. 밑선은 이 줄 전체에 긋는다 */}
      <div className="flex gap-x6 overflow-x-auto shadow-[inset_0_-1px_var(--seed-color-stroke-neutral-weak)] [scrollbar-width:none]">
        <TabsList
          aria-label={label}
          className="shrink-0 gap-x6 overflow-visible bg-transparent px-0 shadow-none"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.code}
              value={tab.code}
              className="t5-medium gap-x1 px-0 text-fg-neutral-muted hover:text-fg-neutral aria-selected:t5-bold aria-selected:text-fg-neutral"
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
        {UPCOMING_CATEGORIES.map((category) => (
          <button
            key={category.code}
            type="button"
            onClick={() => notifyUpcoming(category.name)}
            className="t5-medium flex min-h-[44px] shrink-0 items-end gap-x1 py-x2_5 whitespace-nowrap text-fg-neutral-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
          >
            {category.name} <span className="t1-medium mb-[3px]">준비 중</span>
          </button>
        ))}
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
