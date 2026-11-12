import { IconArrowUpRightLine } from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import type { ArticleDetail } from "@/api/article";
import { enterAt, RISE } from "@/components/motion/screenMotion";
import { BookmarkButton } from "@/components/BookmarkButton";
import { meaningProps } from "@/components/meaning/meaningProps";
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

// 「바른신문 · 2026.10.06 14:30 · 김민정 기자」 — 기자가 없으면 뺀다. 수집한 기자 칸에 언론사 이름만 온 기사가 있어서
// (운영 200건 중 12건, 2026-11-12) 언론사 이름과 같으면 기자로 보지 않는다
const metaLine = (article: ArticleDetail) => {
  const reporter = article.reporter?.trim();
  return [
    article.publisher.name,
    formatFullDateTime(article.publishedAt),
    reporter === article.publisher.name.trim() ? null : reporter,
  ]
    .filter(Boolean)
    .join(" · ");
};

// 좁은 화면에서 원문 보기 · 이슈 보기가 줄을 반씩 나눈 40px 두 칸이 된다. 넓은 화면은 글자 폭만큼
const ACTION = "max-md:h-x10 max-md:flex-1";

// 이 기사가 속한 이슈로 가는 길 — 이슈가 있으면 사건 패널이 열린 이슈 화면으로 가는 버튼, 사건을 찾는 중이거나
// 이슈로 아직 묶이지 않았으면 그 문구, 그 밖(사건 찾기 전 · 실패 · 사건으로 묶지 않는 기사)은 아무것도 두지 않는다
// (EXPERIENCE.md State Patterns 「사건 연결 상태」 [가정])
function IssueLink({ article }: { article: ArticleDetail }) {
  if (article.issue) {
    const to = article.event
      ? `/issues/${article.issue.id}?event=${article.event.id}`
      : `/issues/${article.issue.id}`;
    return (
      <ActionButton
        asChild
        variant="brandSolid"
        size="small"
        className={ACTION}
      >
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
    message && (
      <p className="t3-regular min-w-0 text-fg-neutral-muted">{message}</p>
    )
  );
}

// 기사를 받으면 분야 · 제목(북마크) · 정보 · 버튼이 이 차례(ms)로 떠오른다 (components/motion/screenMotion.ts)
const HEADER_AT = { path: 0, title: 70, meta: 140, actions: 210 };

// 기사 헤더 — 분야 · 이슈, 제목, 언론사 · 일시 · 기자, 그 오른쪽 위 북마크 아이콘, 아래 원문 보기 · 이슈 보기 (프로토타입 v21 MindmapScreen).
// 북마크 · 원문 보기 · 이슈 보기가 폰에서 두 줄의 큰 버튼이었다 → 북마크는 이슈 머리 별과 같은 자리의 아이콘으로 (2026-11-12 사용자, Jira 195).
// h1 은 데이터를 기다리지 않고 첫 렌더에 그린다 — 화면을 옮기면 셸이 첫 렌더 뒤 h1 에 포커스한다 (AppShell)
export function ArticleHeader({
  query,
  onTitleFocusChange,
}: ArticleHeaderProps) {
  const article = query.data;
  const failed = !article && query.isError;

  return (
    // 칸 셋 — 글 묶음 · 북마크 · 버튼 줄. 좁은 화면은 [글 | 북마크] 아래에 버튼 줄이 한 줄을 다 쓴다 — 북마크는 오른쪽 위에 붙고
    // 제목은 그 왼쪽 칸에서 꺾인다. 넓은 화면은 [글 | 북마크 | 버튼 줄] 을 아래로 맞춰 북마크가 원문 보기 앞에 온다.
    // 좁은 화면은 좌우 20px · 위아래를 넓히고 글과 버튼 사이를 16px 띄운다 (DESIGN.md Layout & Spacing)
    <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-x2 gap-y-x4 px-x5 pt-x6 pb-x5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end md:px-x8 md:pt-x5 md:pb-x4">
      <div className="col-start-1 row-start-1 min-w-0">
        {article ? (
          <p
            className={`t2-regular truncate text-fg-neutral-subtle ${RISE}`}
            style={enterAt(HEADER_AT.path)}
          >
            {pathLine(article)}
          </p>
        ) : (
          !failed && <Skeleton radius="8" width="x24" height="lineHeight.t2" />
        )}
        <h1
          tabIndex={-1}
          onFocus={() => onTitleFocusChange?.(true)}
          onBlur={() => onTitleFocusChange?.(false)}
          className="t9-bold md:t10-bold mt-x1_5 text-fg-neutral outline-none"
        >
          {article ? (
            // 제목 글만 떠오른다 — h1 은 첫 렌더부터 있어서 셸이 포커스를 둔다. 드래그하면 용어사전 말풍선이 뜬다
            <span
              className={`block ${RISE}`}
              style={enterAt(HEADER_AT.title)}
              {...meaningProps("ARTICLE", article.id)}
            >
              {article.title}
            </span>
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
          <p
            className={`t3-regular mt-x2 text-fg-neutral-muted tabular-nums ${RISE}`}
            style={enterAt(HEADER_AT.meta)}
          >
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
      {/* 좁은 화면은 40px 버튼의 아이콘이 분야 줄과 제목 첫 줄 사이에 오게 위 · 오른쪽으로 조금 뺀다 */}
      {article && (
        <div
          className={`col-start-2 row-start-1 -mt-[8px] -mr-[8px] self-start md:m-0 md:self-end ${RISE}`}
          style={enterAt(HEADER_AT.title)}
        >
          <BookmarkButton article={article} size="large" />
        </div>
      )}
      {article && (
        <div
          className={`col-span-2 row-start-2 flex items-center gap-x2 md:col-span-1 md:col-start-3 md:row-start-1 ${RISE}`}
          style={enterAt(HEADER_AT.actions)}
        >
          <ActionButton
            asChild
            variant="neutralOutline"
            size="small"
            // 이슈 보기가 없으면(안내 문구뿐이면) 반으로 늘리지 않고 글자 폭만큼
            className={`border-stroke-neutral-weak ${article.issue ? ACTION : "max-md:h-x10"}`}
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
