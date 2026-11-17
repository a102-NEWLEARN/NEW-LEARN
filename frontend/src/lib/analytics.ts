// GA4 커스텀 이벤트 — 이벤트 이름은 여기 한 곳에서 관리한다
// gtag 는 public/analytics.js 가 운영 도메인에서만 띄운다. 로컬 · 테스트에선 없으니 조용히 넘어간다
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type EventName =
  | "timeline_node_click"
  | "event_step"
  | "related_more_click"
  | "article_view_switch"
  | "issue_view_switch"
  | "original_article_click"
  | "issue_link_click"
  | "article_expand";

export function track(
  name: EventName,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  window.gtag?.("event", name, params);
}
