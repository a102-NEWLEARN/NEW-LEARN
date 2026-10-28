import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { ApiError } from "@/api/error";
import { type IssueDetail, issueQuery } from "@/api/issue";
import { timelineQuery } from "@/api/timeline";
import { IssueHeader } from "@/components/issue/IssueHeader";
import { Timeline } from "@/components/issue/Timeline";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { usePageTitle } from "@/components/usePageTitle";
import { formatPeriod } from "@/lib/date";
import { NotFoundPage } from "@/pages/NotFoundPage";

const NOT_FOUND_TITLE = "이슈를 찾을 수 없어요";

// 주소의 id — 1 이상의 정수만. 그 밖에는 null.
// 자바스크립트 숫자로 틀림없이 옮길 수 있는 데까지만 받는다 — 넘으면 다른 id 로 바뀌거나 서버가 400 을 준다
function toId(raw: string | null | undefined) {
  if (!raw || !/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "ISSUE_NOT_FOUND";

// 이슈 화면 `/issues/:issueId` — 이슈 헤더(A3)와 F07 사건 중심 이슈 에볼루션 맵 타임라인(A4)
// (EXPERIENCE.md Information Architecture, 프로토타입 v21 IssueScreen).
// 고른 사건은 `?event=` 에 둔다. 사건 패널은 S15P31A102-52 에서 붙인다. 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function IssuePage() {
  const issueId = toId(useParams().issueId);
  if (issueId === null) return <NotFoundPage title={NOT_FOUND_TITLE} />;
  // 이슈를 바꾸면 화면 상태(펼친 요약 · 포커스 기억)를 새로 시작한다
  return <IssueView key={issueId} issueId={issueId} />;
}

function IssueView({ issueId }: { issueId: number }) {
  const issue = useQuery(issueQuery(issueId));
  const timeline = useQuery(timelineQuery(issueId));
  const notFound = isNotFound(issue.error) || isNotFound(timeline.error);
  usePageTitle(notFound ? NOT_FOUND_TITLE : (issue.data?.title ?? "이슈"));
  // 제목에 포커스가 있던 채 404 를 받으면 찾을 수 없음 제목으로 포커스를 넘긴다
  const [titleFocused, setTitleFocused] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = toId(searchParams.get("event"));
  // 고르기는 기록을 쌓지 않는다 — 뒤로 가기는 앞 화면으로 간다
  const setEvent = (eventId: number | null) =>
    setSearchParams(
      (params) => {
        if (eventId === null) params.delete("event");
        else params.set("event", String(eventId));
        return params;
      },
      { replace: true },
    );

  if (notFound)
    return <NotFoundPage title={NOT_FOUND_TITLE} focusTitle={titleFocused} />;

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <IssueHeader query={issue} onTitleFocusChange={setTitleFocused} />
      <div className="flex min-h-0 flex-1 flex-col border-t border-stroke-neutral-subtle">
        {timeline.data ? (
          timeline.data.events.length === 0 ? (
            <Centered>
              <EmptyState message="아직 이 이슈에 정리된 사건이 없어요" />
            </Centered>
          ) : (
            <Timeline
              events={timeline.data.events}
              selectedId={selectedId}
              onSelect={setEvent}
              onDeselect={() => setEvent(null)}
              summary={issue.data && summaryOf(issue.data)}
            />
          )
        ) : timeline.isError ? (
          <Centered>
            <ErrorState
              title="타임라인을 불러오지 못했어요"
              error={timeline.error}
              onRetry={() => void timeline.refetch()}
            />
          </Centered>
        ) : (
          <TimelineSkeleton />
        )}
      </div>
    </div>
  );
}

// 「2026.08.04 ~ 10.09 · 사건 8 · 기사 31」 — 사건이 없으면 기간 없이, 개수가 0이면 그 항목을 뺀다
function summaryOf(issue: IssueDetail) {
  return [
    issue.firstEventAt &&
      issue.lastEventAt &&
      formatPeriod(issue.firstEventAt, issue.lastEventAt),
    issue.eventCount > 0 && `사건 ${issue.eventCount}`,
    issue.articleCount > 0 && `기사 ${issue.articleCount}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center">{children}</div>
  );
}

// 타임라인 자리 — 도구줄과 레인 두 줄 모양
function TimelineSkeleton() {
  return (
    <LoadingState label="타임라인 불러오는 중">
      <div className="flex flex-col gap-x6 px-x4 py-x3 md:px-x8">
        <Skeleton
          radius="8"
          width="full"
          height="x8"
          className="max-w-[320px]"
        />
        <Skeleton radius="8" width="full" height="x40" />
        <Skeleton radius="8" width="full" height="x16" />
      </div>
    </LoadingState>
  );
}
