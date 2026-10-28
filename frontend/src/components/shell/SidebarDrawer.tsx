import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { SidePanel } from "@seed-design/react";
import type { MouseEvent } from "react";
import type { IssueExplorerProps } from "@/components/shell/IssueExplorer";
import { SidebarMenu } from "@/components/shell/Sidebar";

type SidebarDrawerProps = IssueExplorerProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// 좁은 화면(767px 이하)의 사이드바 — 왼쪽에서 나오는 서랍 (EXPERIENCE.md 앱 셸).
// 바깥 어두운 막 · Esc · 닫기 버튼 · 항목(링크)을 고르면 닫힌다. 포커스 가두기와 돌려주기는 SEED SidePanel 이 한다.
// 폭 280px 는 프로토타입 v21 값이다
export function SidebarDrawer({
  open,
  onOpenChange,
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
        <SidePanel.Content width="280px">
          <SidePanel.Header>
            <SidePanel.Title>메뉴</SidePanel.Title>
          </SidePanel.Header>
          <SidePanel.CloseButton aria-label="메뉴 닫기">
            <IconXmarkLine aria-hidden />
          </SidePanel.CloseButton>
          <SidePanel.Body onClick={closeOnLink}>
            <SidebarMenu {...explorer} />
          </SidePanel.Body>
        </SidePanel.Content>
      </SidePanel.Positioner>
    </SidePanel.Root>
  );
}
