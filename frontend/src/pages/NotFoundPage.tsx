import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";

type NotFoundPageProps = {
  /** 무엇이 없는지. 예: 「이슈를 찾을 수 없어요」 */
  title?: string;
};

// 찾을 수 없음 — 없는 주소(routes.tsx 의 `*`)에 뜬다 (EXPERIENCE.md Information Architecture).
// `_NOT_FOUND` 오류를 받은 화면도 화면 전체를 이것으로 바꾸는데, 그 연결은 이슈 · 기사 · 사건 화면 티켓이 한다.
// 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function NotFoundPage({
  title = "페이지를 찾을 수 없어요",
}: NotFoundPageProps) {
  return (
    <div className="flex flex-col items-center gap-x6 px-x4 py-x16 text-center">
      <h1 className="screen-title text-fg-neutral">{title}</h1>
      {/* 지금 /home 에는 개발 확인 화면이 뜬다. 홈 화면은 S15P31A102-44 에서 넣는다 */}
      <ActionButton asChild variant="brandSolid">
        <Link to="/home">홈으로</Link>
      </ActionButton>
    </div>
  );
}
