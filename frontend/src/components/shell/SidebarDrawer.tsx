import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { SidePanel } from "@seed-design/react";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/Logo";
import type { IssueExplorerProps } from "@/components/shell/IssueExplorer";
import { SidebarMenu } from "@/components/shell/Sidebar";

type SidebarDrawerProps = IssueExplorerProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 서랍 머리의 로고를 눌렀을 때 — 헤더 로고처럼 셸이 본문을 맨 위로 올린다 */
  onLogoClick?: () => void;
};

// 좁은 화면(767px 이하)의 사이드바 — 왼쪽에서 나오는 서랍 (EXPERIENCE.md 앱 셸).
// 바깥 어두운 막 · Esc · 닫기 버튼 · 항목(링크)을 고르면 닫힌다. 포커스 가두기와 돌려주기는 SEED SidePanel 이 한다.
// 폭 280px 는 프로토타입 v21 값이다. 머리는 큰 제목 대신 로고 · 닫기를 둔 52px 줄이고, 바탕은 넓은 화면 사이드바와 같은 회색이다
// (모바일 프로토타입 v1 Sidebar overlay). 서랍 이름 「메뉴」는 화면 읽기에 남긴다
export function SidebarDrawer({
  open,
  onOpenChange,
  onLogoClick,
  ...explorer
}: SidebarDrawerProps) {
  // 분야를 펼치는 버튼은 서랍을 두고, 다른 화면으로 가는 것(링크 · 빠른 이동)만 서랍을 닫는다
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as Element).closest("a, [data-navigates]"))
      onOpenChange(false);
  };

  return (
    <SidePanel.Root open={open} onOpenChange={onOpenChange} direction="left">
      <SidePanel.Positioner>
        <SidePanel.Backdrop />
        <SidePanel.Content width="280px" className="bg-bg-neutral-muted">
          <SidePanel.Header className="min-h-[52px] flex-row items-center border-b border-stroke-neutral-weak py-0 pr-x3 pl-x4">
            <SidePanel.Title className="sr-only">메뉴</SidePanel.Title>
            <Link
              to="/home"
              aria-label="NEW:LEARN 홈으로"
              onClick={(event) => {
                onLogoClick?.();
                closeOnLink(event);
              }}
              className="flex h-x10 items-center rounded-r2 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
            >
              <Logo height={22} />
            </Link>
          </SidePanel.Header>
          {/* SEED 는 닫기 버튼을 머리 오른쪽 위(위 28px · 오른쪽 24px)에 띄운다 — 52px 줄 가운데로 내리고 머리 오른쪽 여백(12px)에 맞춘다.
              위치는 px 로 준다 — SEED 테마에는 right-x3 같은 위치 클래스가 없다 */}
          <SidePanel.CloseButton
            aria-label="메뉴 닫기"
            className="top-[26px] right-[12px] m-0 size-x10 -translate-y-1/2 p-0"
          >
            <IconXmarkLine aria-hidden />
          </SidePanel.CloseButton>
          <SidePanel.Body onClick={closeOnLink} className="px-0">
            <SidebarMenu {...explorer} />
          </SidePanel.Body>
        </SidePanel.Content>
      </SidePanel.Positioner>
    </SidePanel.Root>
  );
}
