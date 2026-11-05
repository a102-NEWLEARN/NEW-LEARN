import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";

// 로그인 ↔ 가입을 오가는 줄 — 가운데 물음과 양옆 선, 그 아래 버튼 (프로토타입 v21 AuthPage).
// 버튼은 DESIGN.md 보조 버튼(흰 바탕 + 1px 테두리) — v21 의 회색 채움은 화면마다 보조 버튼 모양이 달라 보였다 (2026-11-05 UI 점검)
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
        variant="neutralOutline"
        size="large"
        className="w-full"
      >
        <Link to={to}>{label}</Link>
      </ActionButton>
    </>
  );
}
