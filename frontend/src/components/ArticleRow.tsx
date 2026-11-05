import { IconArrowUpRightLine } from "@karrotmarket/react-monochrome-icon";
import { Link } from "react-router";
import type { ArticleSummary } from "@/api/types";
import { BookmarkButton } from "@/components/BookmarkButton";
import { formatArticleDate } from "@/lib/date";
import { enterAt, RISE } from "@/components/motion/screenMotion";

type ArticleRowProps = {
  article: ArticleSummary;
  /** 주면 그만큼(ms) 뒤에 떠오른다 — 사건 패널의 관련 기사 (components/motion/screenMotion.ts) */
  enterDelay?: number;
  /** 대표 분야도 적는다 — 여러 분야가 섞이는 홈 최신 기사 (프로토타입 v21) */
  showCategory?: boolean;
  /** 상대 시간(「3시간 전」)을 잴 지금. 테스트가 고정한다 */
  now?: Date;
};

// 기사 행 (DESIGN.md ArticleList, EXPERIENCE.md Component Patterns 「기사 행」) — 사건 패널 관련 기사 · 홈 최신 기사.
// 행 전체가 기사 마인드맵 링크 하나이고, 북마크 · 원문 보기는 오른쪽의 따로 누르는 버튼이다
export function ArticleRow({
  article,
  showCategory,
  now,
  enterDelay,
}: ArticleRowProps) {
  const meta = [
    article.publisher.name,
    formatArticleDate(article.publishedAt, now),
    showCategory && article.category?.name,
  ].filter(Boolean);

  return (
    <li
      className={`flex items-start gap-x0_5 ${enterDelay === undefined ? "" : RISE}`}
      style={enterDelay === undefined ? undefined : enterAt(enterDelay)}
    >
      <Link
        to={`/articles/${article.id}`}
        className="flex min-w-0 flex-1 flex-col gap-x1 rounded-r2 px-x2 py-x3 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
      >
        <span className="t5-medium line-clamp-2 text-fg-neutral">
          {article.title}
        </span>
        <span className="t2-regular flex flex-wrap items-center gap-x1_5 text-fg-neutral-muted tabular-nums">
          {meta.join(" · ")}
          {/* 마인드맵을 아직 만드는 중 (EXPERIENCE.md State Patterns) */}
          {article.mindmapStatus === "QUEUED" && (
            <span className="t1-medium rounded-r1 bg-bg-neutral-weak px-x1_5 py-x0_5 text-fg-neutral-muted">
              분석 중
            </span>
          )}
        </span>
      </Link>
      <BookmarkButton article={article} className="mt-x2" />
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        // 같은 언론사 기사가 여럿이어도 이름이 겹치지 않게 제목을 넣고, 새 탭으로 연다는 것을 알린다
        aria-label={`${article.title} 원문 보기 (${article.publisher.name}, 새 탭)`}
        title="원문 보기"
        className="mt-x2 flex size-x10 shrink-0 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
      >
        <IconArrowUpRightLine aria-hidden size={16} />
      </a>
    </li>
  );
}
