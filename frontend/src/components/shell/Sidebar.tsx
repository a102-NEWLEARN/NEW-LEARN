import {
  IconBookmarkLine,
  IconChevronLeftLine,
  IconChevronRightLine,
  IconGridLine,
  IconHouseLine,
  IconMagnifyingglassLine,
  IconStarLine,
} from "@karrotmarket/react-monochrome-icon";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { IssueExplorer } from "@/components/shell/IssueExplorer";
import { useComingSoon } from "@/components/useSnackbar";

type SidebarProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

// 사이드바 — 접으면 아이콘만 있는 64px 레일, 펴면 216px 이슈 탐색이다 (EXPERIENCE.md 앱 셸).
// 끌어서 폭을 바꾸지 않는다. 항목과 아이콘 순서는 프로토타입 v21 을 따른다
export function Sidebar({ expanded, onExpandedChange }: SidebarProps) {
  return (
    <nav
      aria-label="사이드바"
      className={`shrink-0 overflow-y-auto border-r border-stroke-neutral-weak bg-bg-neutral-muted transition-[width] duration-200 motion-reduce:transition-none ${expanded ? "w-[216px]" : "w-[64px]"}`}
    >
      {expanded ? (
        <ExpandedSidebar onCollapse={() => onExpandedChange(false)} />
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
  "flex size-x10 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring aria-[current=page]:bg-bg-brand-weak aria-[current=page]:text-fg-brand-contrast";

function RailButton({
  label,
  icon,
  onClick,
  ...props
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
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
      {...props}
    >
      {icon}
    </button>
  );
}

function SidebarRail({ onExpand }: { onExpand: () => void }) {
  const comingSoon = useComingSoon();
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col items-center gap-x1 py-x2_5">
      <RailButton
        label="사이드바 펼치기"
        icon={<IconChevronRightLine size={20} aria-hidden />}
        onClick={onExpand}
        aria-expanded={false}
        aria-keyshortcuts={SHORTCUT}
      />
      {/* 빠른 이동(통합 검색)은 MVP 포함 미정이라 곧 제공 항목이다 (EXPERIENCE.md IA, Jira S15P31A102-46) */}
      <RailButton
        label="빠른 이동"
        icon={<IconMagnifyingglassLine size={20} aria-hidden />}
        onClick={comingSoon}
      />
      <span aria-hidden className="my-x1 h-px w-x7 bg-stroke-neutral-weak" />
      <Link
        to="/home"
        aria-label="홈"
        title="홈"
        aria-current={pathname === "/home" ? "page" : undefined}
        className={railItemClass}
      >
        <IconHouseLine size={20} aria-hidden />
      </Link>
      <RailButton
        label="관심 이슈"
        icon={<IconStarLine size={20} aria-hidden />}
        onClick={comingSoon}
      />
      <RailButton
        label="나의 뉴스함"
        icon={<IconBookmarkLine size={20} aria-hidden />}
        onClick={comingSoon}
      />
      <RailButton
        label="분야별 이슈 보기"
        icon={<IconGridLine size={20} aria-hidden />}
        onClick={onExpand}
      />
    </div>
  );
}

function ExpandedSidebar({ onCollapse }: { onCollapse: () => void }) {
  const comingSoon = useComingSoon();

  return (
    <div className="flex flex-col gap-x3 p-x2_5">
      <div className="flex items-center gap-x1">
        <button
          type="button"
          onClick={comingSoon}
          className="t4-medium flex h-x9 min-w-0 flex-1 items-center gap-x2 rounded-r2 px-x2_5 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconMagnifyingglassLine size={16} aria-hidden />
          빠른 이동
        </button>
        <RailButton
          label="사이드바 접기"
          icon={<IconChevronLeftLine size={20} aria-hidden />}
          onClick={onCollapse}
          aria-expanded
          aria-keyshortcuts={SHORTCUT}
        />
      </div>
      <section className="flex flex-col gap-x1">
        <h2 className="t2-bold px-x2 text-fg-neutral-muted">이슈 탐색</h2>
        <IssueExplorer />
      </section>
    </div>
  );
}
