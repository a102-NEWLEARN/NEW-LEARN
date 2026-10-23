import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

// 「홈 검색창에 포커스」 부탁은 주소 기록의 state 에 실어 보낸다. 그 기록에만 붙어서
// 나중에 링크로 홈에 오면 저절로 포커스하지 않는다. 값이 바뀌어야 검색창이 다시 포커스해서 번호를 늘린다
type QuickSearchState = { focusSearch: number };
let requests = 0;

/** 주소 기록의 state 에서 검색창 포커스 부탁을 꺼낸다. 없으면 undefined */
export function focusSearchRequest(state: unknown): number | undefined {
  return (state as Partial<QuickSearchState> | null)?.focusSearch;
}

// 빠른 이동 — 어느 화면에서든 홈으로 가서 검색창에 포커스한다 (EXPERIENCE.md IA 통합 검색, 프로토타입 v21).
// ⌘/Ctrl+K 와 사이드바 「빠른 이동」이 쓴다. 이미 홈이면 기록을 쌓지 않고 고른 분야(?category=)도 둔다
export function useQuickSearch() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  return useCallback(() => {
    requests += 1;
    const state: QuickSearchState = { focusSearch: requests };
    if (pathname === "/home") {
      navigate({ pathname, search }, { replace: true, state });
    } else {
      navigate("/home", { state });
    }
  }, [navigate, pathname, search]);
}
