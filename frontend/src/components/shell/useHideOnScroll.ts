import { type RefObject, useEffect, useState } from "react";

/** 이만큼은 내려야 숨는다 — 맨 위에서는 늘 보인다 */
const TOP = 64;
/** 이만큼 넘게 움직여야 바뀐다 — 손가락이 조금 흔들린 것으로 깜빡이지 않게 */
const JITTER = 4;

/**
 * 스크롤 칸을 아래로 내려 읽는 동안 true. 위로 올리거나, 맨 위 가까이거나, 맨 끝에 닿으면 false.
 * 좁은 화면 용어사전 버튼이 목록 행 오른쪽의 북마크 · 원문 보기를 덮어서 쓴다 (EXPERIENCE.md 앱 셸 「용어사전 버튼」,
 * 2026-11-05 UI 점검). 끄면(enabled=false) 늘 false.
 */
export function useHideOnScroll(
  scrollRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const box = scrollRef.current;
    if (!enabled || !box) {
      setHidden(false);
      return;
    }
    let last = box.scrollTop;
    const onScroll = () => {
      const top = box.scrollTop;
      const atEnd = top + box.clientHeight >= box.scrollHeight - 2;
      if (top < TOP || atEnd) setHidden(false);
      else if (top - last > JITTER) setHidden(true);
      else if (last - top > JITTER) setHidden(false);
      else return; // 흔들림은 기준점도 옮기지 않는다
      last = top;
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [scrollRef, enabled]);

  return enabled && hidden;
}
