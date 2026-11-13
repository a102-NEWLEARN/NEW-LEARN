import {
  IconBookmarkFill,
  IconBookmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { meQuery } from "@/api/members";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { loginPath } from "@/lib/login-path";

type HeaderProps = {
  /** 로고를 눌렀을 때 — 셸이 본문을 맨 위로 올린다 */
  onLogoClick: () => void;
  /** 좁은 화면인가 — 셸의 좁은 화면 판정(useMediaQuery)을 그대로 받는다 */
  narrow?: boolean;
};

// 셸 헤더 — 스크롤해도 위에 붙어 있다 (EXPERIENCE.md 앱 셸).
// 높이 60px · 로고 26px 는 프로토타입 v21 값이다 (DESIGN.md 헤더 로고 20–32px).
// 좁은 화면에서도 로고가 맨 왼쪽이다 — 메뉴 버튼(서랍)은 뺐다 (2026-11-12 사용자, Jira 195). 오른쪽 버튼은 글자를 숨긴 40px 아이콘 버튼이 된다.
// 이름은 스크린 리더에 남는다 (EXPERIENCE.md Responsive & Platform · Accessibility Floor).
// 지금 화면의 버튼은 브랜드 옅은 바탕 · Fill 아이콘으로 칠하고 aria-current 로 알린다 (모바일 v1 · v21 TopNav, DESIGN.md 아이콘).
// 마이페이지는 프로필 메뉴(마이페이지 · 로그아웃)를 여는 버튼이다 (ProfileMenu, 2026-11-05 S15P31A102-182).
// 손님은 둘 대신 *로그인* 하나다 — 좁은 화면에서도 글자다. 회원인지 아는 동안(A17)은 오른쪽을 비워 둔다 —
// 손님 · 회원 버튼이 눈앞에서 바뀌어 보이지 않게. A17 이 다른 오류로 실패하면 지금처럼 회원 버튼을 둔다 (2026-11-13 Jira 205)
export function Header({ onLogoClick, narrow }: HeaderProps) {
  const me = useQuery(meQuery);
  const { pathname, search, hash } = useLocation();
  const atBookmarks = pathname === "/bookmarks";
  const label = narrow ? "sr-only" : undefined;
  // SEED ghost 버튼은 글자 · 아이콘 색을 --seed-box-color 로 칠한다
  const iconButton = `aria-[current=page]:bg-bg-brand-weak aria-[current=page]:[--seed-box-color:var(--seed-color-fg-brand-contrast)] data-current:bg-bg-brand-weak data-current:[--seed-box-color:var(--seed-color-fg-brand-contrast)] ${narrow ? "size-x10 px-0" : ""}`;

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
        {me.isPending ? null : me.data === null ? (
          // 보조 버튼 — 흰 바탕 · 옅은 테두리 (DESIGN.md Components 보조 버튼)
          <ActionButton
            asChild
            variant="neutralOutline"
            size="small"
            className="border-stroke-neutral-weak"
          >
            <Link to={loginPath(pathname + search + hash)}>로그인</Link>
          </ActionButton>
        ) : (
          <>
            <ActionButton
              asChild
              variant="ghost"
              size="small"
              className={iconButton}
            >
              <Link
                to="/bookmarks"
                data-coach="bookmarks"
                aria-current={atBookmarks ? "page" : undefined}
              >
                <PrefixIcon
                  svg={
                    atBookmarks ? <IconBookmarkFill /> : <IconBookmarkLine />
                  }
                />
                <span className={label}>나의 뉴스함</span>
              </Link>
            </ActionButton>
            <span
              aria-hidden
              className="h-[14px] w-px bg-stroke-neutral-weak"
            />
            <ProfileMenu
              buttonClassName={iconButton}
              labelClassName={label}
              narrow={narrow}
            />
          </>
        )}
      </div>
    </header>
  );
}
