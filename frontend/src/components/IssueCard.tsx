import {
  IconArticleLine,
  IconChevronRightSmallLine,
  IconSquare2StackedLine,
  IconStarFill,
} from "@karrotmarket/react-monochrome-icon";
import { Link } from "react-router";
import type { IssueSummary } from "@/api/issues";
import { CARD_HINT } from "@/components/motion/appMotion";
import { formatEventDate } from "@/lib/date";

type IssueCardProps = {
  issue: IssueSummary;
};

// 이슈 카드 — 카드 전체가 누르는 면 하나이고 누르면 이슈 화면으로 간다 (EXPERIENCE.md Component Patterns).
// 모양은 v2 IssueCard README: 흰 카드 · 1px 테두리 · 16px 모서리 · 그림자 없음, 분야는 청록 글자만,
// 제목 2줄, 최근 사건 앞에 8px 민트 점, 맨 아래 사건 · 기사 수. 최근 사건 날짜는 프로토타입 v21 에서 가져왔고 올해가 아니면 연도를 붙인다
export function IssueCard({ issue }: IssueCardProps) {
  const { lastEvent } = issue;
  // 0이면 「0개」로 쓰지 않고 그 항목을 뺀다 (v2 IssueCard)
  const counts = [
    { label: "사건", value: issue.eventCount, Icon: IconSquare2StackedLine },
    { label: "기사", value: issue.articleCount, Icon: IconArticleLine },
  ].filter((count) => count.value > 0);

  return (
    <Link
      to={`/issues/${issue.id}`}
      className="group flex h-full flex-col gap-x3 rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default p-x5 text-left transition-[border-color,background-color,scale] duration-[var(--seed-duration-color-transition)] ease-[var(--seed-timing-function-easing)] hover:border-palette-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring active:bg-bg-layer-default-pressed active:[scale:var(--seed-scale-s98)]"
    >
      <span className="flex flex-wrap items-center gap-x-x2 gap-y-x1">
        <span className="t3-medium text-fg-brand">
          {issue.categories.map((category) => category.name).join(" · ")}
        </span>
        {/* 관심 이슈 표시 — 홈 추천은 관심 이슈를 먼저 둔다 (PRD FR-28 · 프로토타입 v21 카드 머리, Jira 172) */}
        {issue.interested && (
          <span className="t2-bold inline-flex items-center gap-x0_5 text-fg-neutral-muted">
            <IconStarFill aria-hidden size={12} className="text-fg-brand" />
            관심 이슈
          </span>
        )}
      </span>
      <span className="t6-bold line-clamp-2 text-fg-neutral">
        {issue.title}
      </span>
      {/* 사건이 0개인 이슈는 최근 사건이 없다 (docs/api-screen.md A2) */}
      {lastEvent && (
        <span className="grid grid-cols-[8px_1fr] gap-x-x2 gap-y-x0_5">
          <span
            aria-hidden
            className="row-span-2 mt-[5px] size-x2 rounded-[2px] bg-bg-brand-accent"
          />
          <span className="t2-medium text-fg-neutral-muted">
            최근 사건 · {formatEventDate(lastEvent.occurredAt)}
          </span>
          <span className="line-clamp-2 text-[0.875rem] leading-[1.25rem] text-fg-neutral">
            {lastEvent.title}
          </span>
        </span>
      )}
      {counts.length > 0 && (
        <span className="t3-regular mt-auto flex gap-x4 border-t border-stroke-neutral-subtle pt-x3 text-fg-neutral-muted">
          {counts.map(({ label, value, Icon }) => (
            <span key={label} className="inline-flex items-center gap-x1">
              <Icon aria-hidden size={16} />
              {label}{" "}
              <b className="font-medium text-fg-neutral tabular-nums">
                {value}
              </b>
            </span>
          ))}
          {/* 마우스를 올리거나 키보드로 오면 나타나는 안내 (프로토타입 v21 im-rec-arrow, appMotion.ts) */}
          <span
            aria-hidden
            className={`t3-bold ml-auto inline-flex items-center text-fg-brand ${CARD_HINT}`}
          >
            흐름 보기
            <IconChevronRightSmallLine size={14} />
          </span>
        </span>
      )}
    </Link>
  );
}
