import { useEffect, useRef } from "react";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { prefersReducedMotion } from "@/lib/motion";

/** 마우스처럼 가리킬 수 있는 장치 — 터치 화면에는 원을 띄우지 않는다 */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
/** 이 위에 오면 원이 커진다 */
const PRESSABLE =
  "a[href], button, input, textarea, select, label, [role='button']";
/** 한 프레임에 남은 거리의 몇 할을 따라가나 — 작을수록 느긋하게 따라온다 */
const FOLLOW = 0.2;

// 따라다니는 원 커서 — 마우스를 조금 늦게 따라오고, 누를 수 있는 것 위에서 커진다 (does.kr 채용 화면 참고).
// 원래 커서는 그대로 두고 그 위에 원을 덧붙인다. 장식이라 화면 읽기에서 뺀다. 동작 줄이기를 켜면 띄우지 않는다
export function FollowCursor() {
  const fine = useMediaQuery(FINE_POINTER);
  if (!fine || prefersReducedMotion()) return null;
  return <Ring />;
}

function Ring() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ring = ref.current;
    if (!ring) return;
    const target = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };
    let frame = 0;

    // 거의 다 따라왔으면 멈추고, 마우스가 움직이면 다시 돈다
    const draw = () => {
      at.x += (target.x - at.x) * FOLLOW;
      at.y += (target.y - at.y) * FOLLOW;
      ring.style.translate = `${at.x}px ${at.y}px`;
      const left = Math.abs(target.x - at.x) + Math.abs(target.y - at.y);
      frame = left > 0.5 ? requestAnimationFrame(draw) : 0;
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      target.x = event.clientX;
      target.y = event.clientY;
      // 처음 나타날 때는 화면 구석에서 날아오지 않게 그 자리에 바로 둔다
      if (!ring.hasAttribute("data-shown")) {
        at.x = target.x;
        at.y = target.y;
        ring.setAttribute("data-shown", "");
      }
      const over =
        event.target instanceof Element && event.target.closest(PRESSABLE);
      ring.toggleAttribute("data-pressable", !!over);
      if (!frame) frame = requestAnimationFrame(draw);
    };

    // 마우스가 창 밖으로 나가면 숨긴다
    const leave = () => ring.removeAttribute("data-shown");

    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  // 흰 원을 difference 로 섞어 흰 바탕에서는 검게, 브랜드 색 막 위에서는 반대 색으로 보인다
  return (
    <div
      ref={ref}
      aria-hidden
      className="group pointer-events-none fixed top-0 left-0 z-[100] opacity-0 mix-blend-difference transition-opacity data-shown:opacity-100"
    >
      <div className="flex size-[36px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-palette-static-white transition-[scale] duration-200 ease-[var(--seed-timing-function-enter)] group-data-pressable:scale-150">
        <span className="size-[6px] rounded-full bg-palette-static-white" />
      </div>
    </div>
  );
}
