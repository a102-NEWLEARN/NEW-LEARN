import { useEffect, useEffectEvent, useState } from "react";

type GreetingIntroProps = {
  /** 인사 위의 작은 줄 */
  eyebrow: string;
  /** 큰 인사 */
  title: string;
  /** 막이 걷히기 시작할 때 — 뒤 화면이 떠오르기 시작한다 */
  onLift: () => void;
  /** 막이 다 걷혔을 때 — 부모가 이 연출을 내린다 */
  onDone: () => void;
};

// 인사가 떠올랐다 사라지는 시간과 막이 걷히는 시간. keyframes 는 newlearn-theme.css 의 newlearn-greeting-*
const GREET_MS = 1800;
const LIFT_MS = 600;

// 인사 문구 연출 — 화면을 브랜드 색 막으로 덮고 인사가 떠올랐다 사라진 뒤 막이 위로 걷힌다 (does.kr 채용 화면 참고).
// 장식이라 화면 읽기에서 뺀다. 막을 누르거나 아무 키나 치면 바로 걷힌다. 동작 줄이기를 켠 사람에게는 부모가 띄우지 않는다
export function GreetingIntro({
  eyebrow,
  title,
  onLift,
  onDone,
}: GreetingIntroProps) {
  const [lifting, setLifting] = useState(false);
  // 부모가 렌더마다 새 함수를 줘도 타이머를 다시 걸지 않는다
  const lift = useEffectEvent(onLift);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (lifting) {
      lift();
      const timer = setTimeout(done, LIFT_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setLifting(true), GREET_MS);
    return () => clearTimeout(timer);
  }, [lifting]);

  useEffect(() => {
    const skip = () => setLifting(true);
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, []);

  return (
    <div
      aria-hidden
      onPointerDown={() => setLifting(true)}
      className={`fixed inset-0 z-[90] flex items-center bg-bg-brand-solid ${
        lifting
          ? "animate-[newlearn-greeting-lift_600ms_var(--seed-timing-function-exit-expressive)_forwards]"
          : ""
      }`}
    >
      <div className="mx-auto w-full max-w-[1040px] px-x5 md:px-x8">
        <div className="animate-[newlearn-greeting-text_1800ms_var(--seed-timing-function-easing)_both]">
          <p className="t5-bold text-bg-accent-lime">{eyebrow}</p>
          <p className="t12-bold md:t14-bold mt-x3 text-palette-static-white">
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}
