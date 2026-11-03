import {
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@seed-design/react";
import { type ReactNode, useEffect, useRef } from "react";

export type HomeView = "recommended" | "latest";

type HomeViewTabsProps = {
  value: HomeView;
  onValueChange: (view: HomeView) => void;
  recommended: ReactNode;
  latest: ReactNode;
};

const VIEWS: { value: HomeView; label: string }[] = [
  { value: "recommended", label: "추천 이슈" },
  { value: "latest", label: "최신 기사" },
];

// 좁은 화면 홈 보기 탭 — 「추천 이슈 / 최신 기사」 중 하나만 보인다 (모바일 프로토타입 v1).
// 탭 줄은 본문 맨 위에 붙는다(sticky). ←→ 는 SEED Tabs 가 한다. 모양은 분야 탭(CategoryTabs)과 같다.
// 탭 줄 아래로 내려가 있을 때 탭을 바꾸면 새 내용의 처음부터 보이게 탭 줄 자리로 올린다
export function HomeViewTabs({
  value,
  onValueChange,
  recommended,
  latest,
}: HomeViewTabsProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const shown = useRef(value);

  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    const anchor = anchorRef.current;
    const bar = barRef.current;
    if (!anchor || !bar) return;
    // 붙어 있으면 탭 줄이 제자리(anchor)보다 아래에 있다
    if (bar.getBoundingClientRect().top > anchor.getBoundingClientRect().top)
      anchor.scrollIntoView?.({ block: "start" });
  }, [value]);

  return (
    <TabsRoot
      value={value}
      onValueChange={(next) => onValueChange(next as HomeView)}
      triggerLayout="fill"
      size="medium"
    >
      <div ref={anchorRef} aria-hidden />
      <div
        ref={barRef}
        className="sticky top-0 z-[1] -mx-x4 bg-bg-layer-default px-x4 shadow-[inset_0_-1px_var(--seed-color-stroke-neutral-weak)]"
      >
        <TabsList
          aria-label="홈 보기"
          className="bg-transparent px-0 shadow-none"
        >
          {VIEWS.map((view) => (
            <TabsTrigger
              key={view.value}
              value={view.value}
              className="t5-medium text-fg-neutral-muted hover:text-fg-neutral aria-selected:t5-bold aria-selected:text-fg-neutral"
            >
              {view.label}
            </TabsTrigger>
          ))}
          <TabsIndicator className="border-b-bg-brand-solid" />
        </TabsList>
      </div>
      {/* 탭마다 내용 자리를 둬서 탭의 aria-controls 가 가리킬 곳이 있게 한다. 내용은 고른 탭에만 그린다 */}
      {VIEWS.map((view) => (
        // 넓은 화면에서 두 부분 사이를 띄우던 위 여백(최신 기사 mt-x10)은 탭 안에서 지운다
        <TabsContent
          key={view.value}
          value={view.value}
          className="pt-x5 *:mt-0"
        >
          {view.value === value &&
            (view.value === "latest" ? latest : recommended)}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}
