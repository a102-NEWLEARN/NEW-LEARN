import {
  SAMPLE_EVENT,
  SAMPLE_EVENTS,
} from "@/components/landing/landingSample";

// 스크롤 연출 ① 의 장면 계산 — 진행도(0 ~ 1)를 막대 자리 · 글 · 강조의 정도로 바꾼다 (프로토타입 v21 LandingScreen cp).
// 그리는 쪽(IssueChartSection)과 떼어 두어 jsdom 에서도 시험한다

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 끝으로 갈수록 느려진다 (cubic out) */
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/** 예시 이슈의 사건(발생 순) · 누적 기사 수 · 강조할 사건 */
export const CHART = (() => {
  const events = [...SAMPLE_EVENTS].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  const cumulative = events.reduce<number[]>(
    (acc, event, i) => [...acc, (i ? acc[i - 1] : 0) + event.articleCount],
    [],
  );
  return {
    events,
    cumulative,
    total: cumulative.at(-1) ?? 0,
    /** 기사가 가장 많은 사건 — 프로토타입은 UPDATE 사건(F10, MVP 밖)을 강조했다 */
    highlight: events.findIndex((event) => event.id === SAMPLE_EVENT.id),
  };
})();

// 모여 있을 때 막대 폭(%)과 높이(%) — 프로토타입 값
const CLUSTER_WIDTH = 7.2;
const CLUSTER_HEIGHTS = [24, 58, 40, 52, 30, 46, 20, 36];
/** 다 펼쳤을 때 가장 높은 막대(%) */
const FULL_HEIGHT = 86;

/** 진행도 p 의 장면 */
export function chartFrame(p: number) {
  const n = CHART.events.length;
  const captionOut = easeOut(clamp01((p - 0.25) / 0.08));
  const captionIn = easeOut(clamp01((p - 0.33) / 0.08));
  const spread = easeOut(clamp01((p - 0.42) / 0.2));
  return {
    captionOut,
    captionIn,
    /** 보이는 문장 — 화면 읽기 · 누르기는 이것만 */
    step: p < 0.33 ? 0 : 1,
    spread,
    labels: clamp01((p - 0.64) / 0.07),
    highlight: easeOut(clamp01((p - 0.78) / 0.09)),
    bars: CHART.cumulative.map((count, i) => ({
      left: lerp(
        50 - (n * CLUSTER_WIDTH) / 2 + i * CLUSTER_WIDTH,
        (i * 100) / n,
        spread,
      ),
      width: lerp(CLUSTER_WIDTH, 100 / n, spread),
      height: lerp(
        CLUSTER_HEIGHTS[i % CLUSTER_HEIGHTS.length],
        (count / CHART.total) * FULL_HEIGHT,
        spread,
      ),
    })),
  };
}
