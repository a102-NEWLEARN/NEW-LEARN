import { clamp01, easeOut } from "@/components/landing/issueChart";

// 스크롤 연출 ② 의 장면 계산 — 진행도(0 ~ 1)를 카드 · 사건 카드 · 타임라인 · 미리보기의 정도로 바꾼다
// (프로토타입 v21 LandingScreen mp). 그리는 쪽(HowSection)과 떼어 두어 jsdom 에서도 시험한다

/** 단계 번호(1 · 2 · 3)를 누르면 갈 진행도 — 그 단계가 한창인 자리 */
export const STEP_TARGETS = [0.35, 0.6, 0.8] as const;
/** 미리보기 탭(흐름지도 · 마인드맵)을 누르면 갈 진행도 */
export const VIEW_TARGETS = { flow: 0.78, map: 0.93 } as const;

export function howScene(q: number) {
  return {
    /** 0 기사 · 1 사건 추출 · 2 사건 연결 · 3 흐름지도 · 마인드맵 */
    step: q < 0.24 ? 0 : q < 0.46 ? 1 : q < 0.72 ? 2 : 3,
    /** 흩어진 기사 카드가 한데 모인다 */
    gather: easeOut(clamp01(q / 0.2)),
    /** 모인 카드가 사라진다 */
    cardsFade: clamp01((q - 0.22) / 0.08),
    /** 사건 카드가 커지며 나타난다 */
    event: easeOut(clamp01((q - 0.24) / 0.1)),
    /** 이슈 타임라인이 나타난다 · 사건 카드는 위로 비킨다 */
    timeline: easeOut(clamp01((q - 0.46) / 0.1)),
    /** 타임라인이 왼쪽부터 차오른다 */
    fill: clamp01((q - 0.5) / 0.18),
    /** 흐름지도 · 마인드맵 미리보기가 나오고 나머지는 사라진다 */
    preview: easeOut(clamp01((q - 0.72) / 0.1)),
    /** 단계 진행 막대 */
    track: clamp01((q - 0.24) / 0.48),
    view: q < 0.87 ? ("flow" as const) : ("map" as const),
  };
}
