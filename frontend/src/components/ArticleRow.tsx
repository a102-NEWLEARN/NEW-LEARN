import {
  IconArrowUpRightLine,
  IconChevronRightSmallLine,
} from "@karrotmarket/react-monochrome-icon";
import { Link } from "react-router";
import type { ArticleSummary } from "@/api/types";
import { BookmarkButton } from "@/components/BookmarkButton";
import { formatArticleDate } from "@/lib/date";
import { ROW_HINT, ROW_RISE, rowAt } from "@/components/motion/appMotion";
import { enterAt, RISE } from "@/components/motion/screenMotion";

type ArticleRowProps = {
  article: ArticleSummary;
  /** 주면 그만큼(ms) 뒤에 떠오른다 — 사건 패널의 관련 기사 (components/motion/screenMotion.ts) */
  enterDelay?: number;
  /** 목록에서 몇 번째 행인가 — 주면 그 차례로 떠오른다. 홈 최신 기사 · 나의 뉴스함 (components/motion/appMotion.ts) */
  listIndex?: number;
  /** 마인드맵이 있는 기사에 마우스를 올리면 「마인드맵 보기」를 띄운다 — 넓은 목록(홈 최신 기사 · 나의 뉴스함)에만 켠다 */
  mindmapHint?: boolean;
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
  listIndex,
  mindmapHint,
}: ArticleRowProps) {
  const meta = [
    article.publisher.name,
    formatArticleDate(article.publishedAt, now),
    showCategory && article.category?.name,
  ].filter(Boolean);

  // 사건 패널은 패널 차례(enterDelay), 목록은 행 차례(listIndex)로 떠오른다
  const enter =
    enterDelay !== undefined
      ? { className: RISE, style: enterAt(enterDelay) }
      : listIndex !== undefined
        ? { className: ROW_RISE, style: rowAt(listIndex) }
        : { className: "", style: undefined };

  return (
    <li
      className={`flex items-start gap-x0_5 ${enter.className}`}
      style={enter.style}
    >
      <Link
        to={`/articles/${article.id}`}
        className="group flex min-w-0 flex-1 items-center gap-x3 rounded-r2 px-x2 py-x3 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-x1">
          {/* 제목은 굵게 — 언론사 · 시각 줄과 명암 차이를 키운다 (2026-11-16 디자인 피드백, Jira 216) */}
          <span className="t5-bold line-clamp-2 text-fg-neutral">
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
        </span>
        {/* 마인드맵이 있는 기사에만, 마우스가 있는 768px 이상에서 마우스를 올리거나 키보드로 오면 나타난다 (프로토타입 v21 im-row-hint, appMotion.ts).
            안 보일 때도 자리를 차지해서, 호버가 없는 터치 태블릿에서는 아예 두지 않는다 — 제목만 일찍 꺾인다 */}
        {mindmapHint && article.mindmapStatus === "SUCCEEDED" && (
          <span
            aria-hidden
            className={`t3-bold hidden shrink-0 items-center text-fg-brand md:pointer-fine:inline-flex ${ROW_HINT}`}
          >
            마인드맵 보기
            <IconChevronRightSmallLine size={14} />
          </span>
        )}
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
