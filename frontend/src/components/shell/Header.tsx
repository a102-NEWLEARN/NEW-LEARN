import {
  IconBookmarkLine,
  IconPersonLine,
} from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { Logo } from "@/components/Logo";
import { useComingSoon } from "@/components/useSnackbar";

type HeaderProps = {
  /** 로고를 눌렀을 때 — 셸이 본문을 맨 위로 올린다 */
  onLogoClick: () => void;
};

// 셸 헤더 — 스크롤해도 위에 붙어 있다 (EXPERIENCE.md 앱 셸).
// 높이 60px · 로고 26px 는 프로토타입 v21 값이다 (DESIGN.md 헤더 로고 20–32px).
// 767px 이하에서는 오른쪽 버튼의 글자를 숨기고 아이콘만 둔다. 이름은 스크린 리더에 남는다
export function Header({ onLogoClick }: HeaderProps) {
  const comingSoon = useComingSoon();

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
      <div className="ml-auto flex items-center gap-x1">
        {/* 나의 뉴스함은 범위 미정이라 곧 제공 항목이다 (EXPERIENCE.md Component Patterns) */}
        <ActionButton variant="ghost" size="small" onClick={comingSoon}>
          <PrefixIcon svg={<IconBookmarkLine />} />
          <span className="max-md:sr-only">나의 뉴스함</span>
        </ActionButton>
        <span aria-hidden className="h-[14px] w-px bg-stroke-neutral-weak" />
        {/* /me 는 S15P31A102-66 에서 생긴다. 그전에는 찾을 수 없음 화면이 뜬다 */}
        <ActionButton asChild variant="ghost" size="small">
          <Link to="/me">
            <PrefixIcon svg={<IconPersonLine />} />
            <span className="max-md:sr-only">마이페이지</span>
          </Link>
        </ActionButton>
      </div>
    </header>
  );
}
