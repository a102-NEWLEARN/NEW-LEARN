import {
  IconBookmarkLine,
  IconHorizline3VerticalLine,
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
  /** 좁은 화면인가 — 셸이 사이드바를 서랍으로 바꾸는 판정(useMediaQuery)을 그대로 받는다 */
  narrow?: boolean;
  /** 좁은 화면에서 사이드바 서랍을 연다 */
  onMenuClick?: () => void;
};

// 셸 헤더 — 스크롤해도 위에 붙어 있다 (EXPERIENCE.md 앱 셸).
// 높이 60px · 로고 26px 는 프로토타입 v21 값이다 (DESIGN.md 헤더 로고 20–32px).
// 좁은 화면에서는 메뉴 버튼을 두고, 오른쪽 버튼은 글자를 숨긴 40px 아이콘 버튼이 된다.
// 이름은 스크린 리더에 남는다 (EXPERIENCE.md Responsive & Platform · Accessibility Floor)
export function Header({ onLogoClick, narrow, onMenuClick }: HeaderProps) {
  const comingSoon = useComingSoon();
  const label = narrow ? "sr-only" : undefined;
  const iconButton = narrow ? "size-x10 px-0" : undefined;

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-x2 border-b border-stroke-neutral-weak bg-bg-layer-default px-x4">
      {narrow && onMenuClick && (
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
          onClick={onMenuClick}
          className="flex size-x10 items-center justify-center rounded-r2 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconHorizline3VerticalLine size={20} aria-hidden />
        </button>
      )}
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
        <ActionButton
          variant="ghost"
          size="small"
          className={iconButton}
          onClick={comingSoon}
        >
          <PrefixIcon svg={<IconBookmarkLine />} />
          <span className={label}>나의 뉴스함</span>
        </ActionButton>
        <span aria-hidden className="h-[14px] w-px bg-stroke-neutral-weak" />
        <ActionButton
          asChild
          variant="ghost"
          size="small"
          className={iconButton}
        >
          <Link to="/me">
            <PrefixIcon svg={<IconPersonLine />} />
            <span className={label}>마이페이지</span>
          </Link>
        </ActionButton>
      </div>
    </header>
  );
}
