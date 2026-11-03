import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";

// 로그인 ↔ 가입을 오가는 줄 — 가운데 물음과 양옆 선, 그 아래 버튼 (프로토타입 v21 AuthPage)
export function AuthSwitch({
  question,
  to,
  label,
}: {
  question: string;
  to: string;
  label: string;
}) {
  return (
    <>
      <div className="t3-regular my-x1 flex items-center gap-x3 text-fg-neutral-subtle">
        <span aria-hidden className="h-px flex-1 bg-stroke-neutral-weak" />
        {question}
        <span aria-hidden className="h-px flex-1 bg-stroke-neutral-weak" />
      </div>
      <ActionButton
        asChild
        variant="neutralWeak"
        size="large"
        className="w-full"
      >
        <Link to={to}>{label}</Link>
      </ActionButton>
    </>
  );
}
