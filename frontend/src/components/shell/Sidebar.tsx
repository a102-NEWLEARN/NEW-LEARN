import {
  IconChevronLeftLine,
  IconChevronRightLine,
  IconMagnifyingglassLine,
} from "@karrotmarket/react-monochrome-icon";
import { type ReactNode, useEffect, useRef } from "react";
import {
  IssueExplorer,
  type IssueExplorerProps,
} from "@/components/shell/IssueExplorer";
import { useQuickSearch } from "@/components/shell/useQuickSearch";

type SidebarProps = IssueExplorerProps & {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

// 사이드바 — 접으면 아이콘만 있는 64px 레일, 펴면 216px 이슈 탐색이다 (EXPERIENCE.md 앱 셸).
// 끌어서 폭을 바꾸지 않는다. 레일에는 펼치기 · 빠른 이동만 둔다 — 프로토타입 v21 레일의 홈 · 나의 뉴스함은 헤더와,
// 분야별 이슈는 펼치기와 겹치고, 관심 이슈는 마이페이지에 있다 (2026-11-04 사용자 결정, S15P31A102-167)
export function Sidebar({
  expanded,
  onExpandedChange,
  ...explorer
}: SidebarProps) {
  const navRef = useRef<HTMLElement>(null);
  const previousExpanded = useRef(expanded);

  // 접힘 · 펼침은 다른 내용을 그려서 누른 버튼이 사라진다. 포커스가 사이드바 안에 있었으면(사라졌으면)
  // 새 접기 · 펼치기 버튼으로 옮긴다. 본문에서 단축키를 눌렀으면 포커스를 가져오지 않는다
  useEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    const active = document.activeElement;
    if (active === document.body || navRef.current?.contains(active)) {
      navRef.current
        ?.querySelector<HTMLElement>("[data-sidebar-toggle]")
        ?.focus();
    }
  }, [expanded]);

  return (
    <nav
      ref={navRef}
      aria-label="사이드바"
      className={`shrink-0 overflow-y-auto border-r border-stroke-neutral-weak bg-bg-neutral-muted transition-[width] duration-200 motion-reduce:transition-none ${expanded ? "w-[216px]" : "w-[64px]"}`}
    >
      {expanded ? (
        <SidebarMenu onCollapse={() => onExpandedChange(false)} {...explorer} />
      ) : (
        <SidebarRail onExpand={() => onExpandedChange(true)} />
      )}
    </nav>
  );
}

const SHORTCUT = "Control+\\ Meta+\\";

// 레일의 아이콘 버튼 — 누르는 영역 40px (EXPERIENCE.md Accessibility Floor).
// 글자가 없어서 이름은 aria-label, 마우스를 올리면 title 로 보인다
const railItemClass =
  "flex size-x10 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring";

function RailButton({
  label,
  icon,
  onClick,
  toggle,
  ...props
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** 사이드바 접기 · 펼치기 버튼 — 상태가 바뀐 뒤 포커스가 돌아올 자리 */
  toggle?: boolean;
  "aria-expanded"?: boolean;
  "aria-keyshortcuts"?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={railItemClass}
      onClick={onClick}
      data-sidebar-toggle={toggle || undefined}
      {...props}
    >
      {icon}
    </button>
  );
}

function SidebarRail({ onExpand }: { onExpand: () => void }) {
  const quickSearch = useQuickSearch();

  return (
    <div className="flex flex-col items-center gap-x1 py-x2_5">
      <RailButton
        label="사이드바 펼치기"
        icon={<IconChevronRightLine size={20} aria-hidden />}
        onClick={onExpand}
        toggle
        aria-expanded={false}
        aria-keyshortcuts={SHORTCUT}
      />
      {/* 빠른 이동 — 홈 검색창으로 간다 (EXPERIENCE.md IA 통합 검색) */}
      <RailButton
        label="빠른 이동"
        icon={<IconMagnifyingglassLine size={20} aria-hidden />}
        onClick={quickSearch}
      />
    </div>
  );
}

// 펼친 사이드바의 내용 — 빠른 이동과 이슈 탐색. 좁은 화면 서랍(SidebarDrawer)도 같은 내용을 쓴다.
// 서랍에는 접기 버튼이 없어서 onCollapse 를 넘기지 않는다
export function SidebarMenu({
  onCollapse,
  ...explorer
}: IssueExplorerProps & { onCollapse?: () => void }) {
  const quickSearch = useQuickSearch();

  return (
    <div className="flex flex-col gap-x3 p-x2_5">
      <div className="flex items-center gap-x1">
        {/* 다른 화면(홈)으로 가서 서랍도 닫는다 — SidebarDrawer 가 data-navigates 를 본다 */}
        <button
          type="button"
          data-navigates
          onClick={quickSearch}
          className="t4-medium flex h-x9 min-w-0 flex-1 items-center gap-x2 rounded-r2 px-x2_5 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconMagnifyingglassLine size={16} aria-hidden />
          빠른 이동
        </button>
        {onCollapse && (
          <RailButton
            label="사이드바 접기"
            icon={<IconChevronLeftLine size={20} aria-hidden />}
            onClick={onCollapse}
            toggle
            aria-expanded
            aria-keyshortcuts={SHORTCUT}
          />
        )}
      </div>
      <section className="flex flex-col gap-x1">
        <h2 className="t2-bold px-x2 text-fg-neutral-muted">이슈 탐색</h2>
        <IssueExplorer {...explorer} />
      </section>
    </div>
  );
}
