import { Link } from "react-router";
import { Logo } from "@/components/Logo";

type HeaderProps = {
  /** 로고를 눌렀을 때 — 셸이 본문을 맨 위로 올린다 */
  onLogoClick: () => void;
};

// 셸 헤더 — 스크롤해도 위에 붙어 있다 (EXPERIENCE.md 앱 셸).
// 높이 60px · 로고 26px 는 프로토타입 v21 값이다 (DESIGN.md 헤더 로고 20–32px)
export function Header({ onLogoClick }: HeaderProps) {
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-x2 border-b border-stroke-neutral-weak bg-bg-layer-default px-x4">
      <Link
        to="/home"
        aria-label="NEW:LEARN 홈으로"
        onClick={onLogoClick}
        className="rounded-r2 p-x1 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
      >
        <Logo height={26} />
      </Link>
    </header>
  );
}
