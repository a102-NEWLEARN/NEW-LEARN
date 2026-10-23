import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";

type NotFoundPageProps = {
  /** 무엇이 없는지. 예: 「이슈를 찾을 수 없어요」 */
  title?: string;
};

// 찾을 수 없음 — 없는 주소와 `_NOT_FOUND` 오류에 화면 전체를 이것으로 바꾼다 (EXPERIENCE.md Information Architecture).
// 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function NotFoundPage({
  title = "페이지를 찾을 수 없어요",
}: NotFoundPageProps) {
  return (
    <div className="flex flex-col items-center gap-x6 px-x4 py-x16 text-center">
      <h1 className="screen-title text-fg-neutral">{title}</h1>
      <ActionButton asChild variant="brandSolid">
        <Link to="/home">홈으로</Link>
      </ActionButton>
    </div>
  );
}
