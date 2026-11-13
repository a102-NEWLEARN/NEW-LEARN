import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { Link } from "react-router";
import { guestPath } from "@/lib/login-path";

/**
 * 로그인 · 가입 화면 머리의 닫기(X) — 들어오기 전 화면, 곧 돌아올 곳(next)으로 손님인 채 간다 (EXPERIENCE.md 로그인 · 가입 폼, Jira 205).
 * 회원 화면이면 홈, next 가 없으면(랜딩에서 왔다) 랜딩이다. 브라우저 기록의 앞으로 가지 않는다 — 회원 화면을 주소로 바로 열어
 * 로그인 화면으로 바꿔 끼워졌으면 앞 기록이 사이트 밖이다. 닫은 로그인 화면은 기록에서 빼서 뒤로 가기로 다시 오지 않는다
 */
export function AuthClose({ next }: { next: string | null }) {
  return (
    <Link
      to={next === null ? "/" : guestPath(next)}
      replace
      aria-label="닫기"
      className="ml-auto flex size-x10 items-center justify-center rounded-r2 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
    >
      <IconXmarkLine size={20} aria-hidden />
    </Link>
  );
}
