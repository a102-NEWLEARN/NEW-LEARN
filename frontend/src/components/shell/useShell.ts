import { useOutletContext } from "react-router";

/** 셸이 그 안의 화면에 건네는 일 (AppShell 의 Outlet context) */
export type ShellContext = {
  /** 사이드바를 접는다 — 오른쪽 패널이 열릴 때 (EXPERIENCE.md 앱 셸 「오른쪽 패널」) */
  collapseSidebar: () => void;
};

// 셸 밖에서 그리면(화면만 따로 시험할 때) undefined
export function useShell() {
  return useOutletContext<ShellContext | undefined>();
}
