import type { MeaningTarget } from "@/api/dictionary";

// 드래그해 뜻을 찾을 수 있는 글에 붙이는 표시 — F13 용어사전 말풍선 (docs/api-screen.md A26, Jira 187).
// 표시한 요소의 글(textContent)이 서버가 확인하는 「그 대상의 화면 글」과 같아야 한다 — 기사 제목 · 마인드맵 잎,
// 이슈 제목 · 요약, 사건 제목 · 이름 · 요약. 끝을 「…」로 줄인 글은 cut 을 준다(줄임표에 닿은 말은 띄우지 않는다)
export const MEANING_ATTR = "data-meaning";
export const MEANING_CUT_ATTR = "data-meaning-cut";

export function meaningProps(type: MeaningTarget, id: number, cut = false) {
  return {
    [MEANING_ATTR]: `${type}:${id}`,
    ...(cut ? { [MEANING_CUT_ATTR]: "" } : {}),
  };
}

/** 드래그 대상 글인가 — 지도(d3-zoom)가 이 글 위의 누르기로 이동을 시작하지 않게 한다 */
export function isMeaningText(target: EventTarget | null) {
  return (
    target instanceof Element && target.closest(`[${MEANING_ATTR}]`) !== null
  );
}

/**
 * 이 요소 안에서 글을 드래그한 뒤 따라온 마우스 클릭인가 — 그러면 누르기(강조 · 사건 열기 · 패널 닫기)를 건너뛴다.
 * 그냥 누르면 누르는 순간 선택이 풀려서 클릭 때는 선택이 없다(지도처럼 select-none 인 곳은 말풍선이 누를 때 지운다).
 * 키보드(Enter · Space)로 낸 클릭은 detail 이 0 이라 늘 누르기다 — 남은 선택이 키보드 조작을 막지 않게
 */
export function isTextDragClick(event: {
  currentTarget: EventTarget;
  detail: number;
}) {
  if (event.detail === 0 || !(event.currentTarget instanceof Element))
    return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return false;
  const anchor = selection.anchorNode;
  return anchor !== null && event.currentTarget.contains(anchor);
}
