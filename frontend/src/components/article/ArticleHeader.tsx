import { IconArrowUpRightLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import type { ArticleDetail } from "@/api/article";
import { BookmarkButton } from "@/components/BookmarkButton";
import { errorDescription } from "@/components/state/ErrorState";
import { formatFullDateTime } from "@/lib/date";

type ArticleHeaderProps = {
  /** A8 기사 상세 */
  query: UseQueryResult<ArticleDetail>;
  /** 제목(h1)이 포커스를 받거나 잃을 때 — 찾을 수 없음 화면으로 바뀔 때 포커스를 넘길지 화면이 가린다 */
  onTitleFocusChange?: (focused: boolean) => void;
};

// 「경제 · 한빛반도체 미국 공장 건설」 — 분야와 속한 이슈. 이슈가 없으면 분야만
const pathLine = (article: ArticleDetail) =>
  [article.category?.name, article.issue?.title].filter(Boolean).join(" · ");

// 「바른신문 · 2026.10.06 14:30 · 김민정 기자」 — 기자가 없으면 뺀다
const metaLine = (article: ArticleDetail) =>
  [
    article.publisher.name,
    formatFullDateTime(article.publishedAt),
    article.reporter,
  ]
    .filter(Boolean)
    .join(" · ");

// 이 기사가 속한 이슈로 가는 길 — 이슈가 있으면 사건 패널이 열린 이슈 화면으로 가는 버튼, 사건을 찾는 중이거나
// 이슈로 아직 묶이지 않았으면 그 문구, 그 밖(사건 찾기 전 · 실패 · 사건으로 묶지 않는 기사)은 아무것도 두지 않는다
// (EXPERIENCE.md State Patterns 「사건 연결 상태」 [가정])
function IssueLink({ article }: { article: ArticleDetail }) {
  if (article.issue) {
    const to = article.event
      ? `/issues/${article.issue.id}?event=${article.event.id}`
      : `/issues/${article.issue.id}`;
    return (
      <ActionButton asChild variant="brandSolid" size="small">
        <Link to={to}>이 기사가 속한 이슈 보기</Link>
      </ActionButton>
    );
  }
  const message =
    article.eventMatchStatus === "QUEUED"
      ? "사건을 찾는 중이에요"
      : article.eventMatchStatus === "SUCCEEDED"
        ? "아직 이슈로 묶이지 않았어요"
        : null;
  return (
    message && <p className="t3-regular text-fg-neutral-muted">{message}</p>
  );
}

// 기사 헤더 — 분야 · 이슈, 제목, 언론사 · 일시 · 기자, 북마크 · 원문 보기 · 이슈 보기 (프로토타입 v21 MindmapScreen).
// h1 은 데이터를 기다리지 않고 첫 렌더에 그린다 — 화면을 옮기면 셸이 첫 렌더 뒤 h1 에 포커스한다 (AppShell)
export function ArticleHeader({
  query,
  onTitleFocusChange,
}: ArticleHeaderProps) {
  const article = query.data;
  const failed = !article && query.isError;

  return (
    <header className="flex flex-wrap items-end gap-x3 px-x4 pt-x5 pb-x4 md:px-x8">
      <div className="min-w-[260px] flex-1">
        {article ? (
          <p className="t2-regular truncate text-fg-neutral-subtle">
            {pathLine(article)}
          </p>
        ) : (
          !failed && <Skeleton radius="8" width="x24" height="lineHeight.t2" />
        )}
        <h1
          tabIndex={-1}
          onFocus={() => onTitleFocusChange?.(true)}
          onBlur={() => onTitleFocusChange?.(false)}
          className="t9-bold md:t10-bold mt-x1_5 break-keep text-fg-neutral outline-none"
        >
          {article ? (
            article.title
          ) : failed ? (
            "기사를 불러오지 못했어요"
          ) : (
            <>
              <span className="sr-only">기사 불러오는 중</span>
              <Skeleton
                radius="8"
                width="full"
                height="lineHeight.t10"
                className="max-w-[480px]"
              />
            </>
          )}
        </h1>
        {article && (
          <p className="t3-regular mt-x2 text-fg-neutral-muted tabular-nums">
            {metaLine(article)}
          </p>
        )}
        {failed && (
          <div className="mt-x2 flex flex-wrap items-center gap-x3">
            <p className="t4-regular text-fg-neutral-muted">
              {errorDescription(query.error)}
            </p>
            <ActionButton
              variant="neutralOutline"
              size="small"
              className="border-stroke-neutral-weak"
              onClick={() => void query.refetch()}
            >
              다시 시도
            </ActionButton>
          </div>
        )}
      </div>
      {article && (
        <div className="flex flex-wrap items-center gap-x2">
          <BookmarkButton article={article} variant="text" />
          <ActionButton
            asChild
            variant="neutralOutline"
            size="small"
            className="border-stroke-neutral-weak"
          >
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              원문 보기
              <span className="sr-only">
                {" "}
                ({article.publisher.name}, 새 탭)
              </span>
              <IconArrowUpRightLine aria-hidden size={14} />
            </a>
          </ActionButton>
          <IssueLink article={article} />
        </div>
      )}
    </header>
  );
}
