import {
  IconBracketLeftArrowRightLine,
  IconChevronDownSmallLine,
  IconPersonFill,
  IconPersonLine,
} from "@karrotmarket/react-monochrome-icon";
import {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuItemLabel,
  MenuPositioner,
  MenuRoot,
  MenuScrollArea,
  MenuTrigger,
  PrefixIcon,
  SuffixIcon,
} from "@seed-design/react";
import { useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { useLogout } from "@/components/useLogout";

type ProfileMenuProps = {
  /** 헤더 오른쪽 버튼 모양 — 나의 뉴스함과 같게 헤더가 준다 */
  buttonClassName: string;
  /** 좁은 화면이면 글자를 숨긴다(sr-only). 이름은 화면 읽기에 남는다 */
  labelClassName?: string;
  narrow?: boolean;
};

// 헤더 프로필 메뉴 — 사람 버튼을 누르면 마이페이지 · 로그아웃 (EXPERIENCE.md 앱 셸 「헤더」).
// 로그아웃은 마이페이지 이름 줄에 있었는데 어색해서 옮겼다 (2026-11-05 사용자, S15P31A102-182).
// 지금 화면이 마이페이지면 버튼을 브랜드 옅은 바탕 · Fill 아이콘으로 칠한다. 메뉴를 여는 버튼이라 aria-current 대신
// data-current 로 모양만 바꾸고, 화면 읽기에는 메뉴 안 *마이페이지* 항목이 aria-current 로 알린다
export function ProfileMenu({
  buttonClassName,
  labelClassName,
  narrow,
}: ProfileMenuProps) {
  const { pathname } = useLocation();
  const atMyPage = pathname === "/me";
  const [open, setOpen] = useState(false);
  // 로그아웃을 누르면 메뉴를 열어 둔다 — 보내는 동안 진행을, 실패하면 안내를 그 자리에서 보인다.
  // SEED 메뉴는 항목의 onClick 을 부른 다음 itemClick 으로 닫는다
  const keepOpen = useRef(false);
  // 실패는 스낵바가 아니라 실패한 자리(메뉴 안)에 둔다. 그새 메뉴를 닫았으면 다시 연다
  const logout = useLogout({ onError: () => setOpen(true) });

  return (
    <MenuRoot
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details?.reason === "itemClick" && keepOpen.current) {
          keepOpen.current = false;
          return;
        }
        setOpen(next);
      }}
      placement="bottom-end"
      gutter={4}
    >
      <MenuTrigger asChild>
        <ActionButton
          variant="ghost"
          size="small"
          className={buttonClassName}
          data-current={atMyPage || undefined}
        >
          <PrefixIcon
            svg={atMyPage ? <IconPersonFill /> : <IconPersonLine />}
          />
          <span className={labelClassName}>마이페이지</span>
          {/* 열리면 뒤집힌다 */}
          {!narrow && (
            <SuffixIcon
              svg={
                <IconChevronDownSmallLine
                  className={`motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`}
                />
              }
            />
          )}
        </ActionButton>
      </MenuTrigger>
      <MenuPositioner>
        {/* SEED 메뉴 구조 그대로 — 스크롤 영역이 위아래 8px 를 두고, 묶음 사이에 구분선을 긋는다.
            스크롤 영역을 빼면 호버 바탕이 메뉴 가장자리에 붙어 어색했다. 커서는 웹이라 손가락으로 */}
        <MenuContent className="min-w-[180px]">
          <MenuScrollArea>
            <MenuGroup>
              <MenuItem asChild size="small" className="cursor-pointer">
                <Link to="/me" aria-current={atMyPage ? "page" : undefined}>
                  <PrefixIcon svg={<IconPersonLine />} />
                  <MenuItemLabel>마이페이지</MenuItemLabel>
                </Link>
              </MenuItem>
            </MenuGroup>
            <MenuGroup>
              <MenuItem
                size="small"
                className="cursor-pointer"
                aria-busy={logout.pending || undefined}
                onClick={() => {
                  keepOpen.current = true;
                  logout.run();
                }}
              >
                <PrefixIcon svg={<IconBracketLeftArrowRightLine />} />
                <MenuItemLabel>로그아웃</MenuItemLabel>
              </MenuItem>
              {logout.error && (
                <p
                  role="alert"
                  className="t3-medium mx-x2 mt-x1 max-w-[240px] rounded-r2 bg-bg-critical-weak px-x3 py-x2 text-fg-critical-contrast"
                >
                  {logout.error}
                </p>
              )}
            </MenuGroup>
          </MenuScrollArea>
        </MenuContent>
      </MenuPositioner>
    </MenuRoot>
  );
}
