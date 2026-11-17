import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { usePageTitle } from "@/components/usePageTitle";

type NotFoundPageProps = {
  /** 무엇이 없는지. 예: 「이슈를 찾을 수 없어요」 */
  title?: string;
  /**
   * 처음 그릴 때 제목에 포커스한다. 화면이 응답(`_NOT_FOUND`)을 받은 뒤에야 이 화면으로 바뀌어서
   * 셸이 옮겨 둔 포커스가 사라졌을 때 쓴다 (IssuePage)
   */
  focusTitle?: boolean;
};

// 찾을 수 없음 — 없는 주소(routes.tsx 의 `*`)와 `_NOT_FOUND` 오류를 받은 화면이 화면 전체를 이것으로 바꾼다
// (EXPERIENCE.md Information Architecture). 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function NotFoundPage({
  title = "페이지를 찾을 수 없어요",
  focusTitle = false,
}: NotFoundPageProps) {
  usePageTitle(title);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <div className="flex flex-col items-center gap-x6 px-x5 py-x16 text-center">
      {/* 화면을 옮기면 셸이 포커스를 여기로 옮긴다 (AppShell) */}
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="screen-title text-fg-neutral outline-none"
      >
        {title}
      </h1>
      <ActionButton asChild variant="brandSolid">
        <Link to="/home">홈으로</Link>
      </ActionButton>
    </div>
  );
}
