type StepProgressProps = {
  /** 지금 단계. 1부터 센다 */
  step: number;
  total: number;
  /** 무엇의 진행인지 — 화면 읽기에서 막대 이름으로 읽힌다 */
  label: string;
};

// 진행 막대 — 몇 단계 중 몇 단계인지 얇은 막대로 보인다 (does.kr 채용 화면 참고).
// 막대가 차는 것은 큰 움직임이라 300ms enter 곡선이다. 동작 줄이기를 켜면 바로 바뀐다(motion-safe)
export function StepProgress({ step, total, label }: StepProgressProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={`${total}단계 중 ${step}단계`}
      className="h-[4px] w-full bg-bg-brand-weak"
    >
      <div
        style={{ width: `${(step / total) * 100}%` }}
        className="h-full bg-bg-brand-accent motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-[var(--seed-timing-function-enter)]"
      />
    </div>
  );
}
