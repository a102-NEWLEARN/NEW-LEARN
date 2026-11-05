import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { ApiError } from "@/api/error";
import { eventQuery } from "@/api/event";
import { type IssueDetail, issueQuery } from "@/api/issue";
import { timelineQuery } from "@/api/timeline";
import { EventDetailPane } from "@/components/issue/EventDetailPane";
import { IssueHeader } from "@/components/issue/IssueHeader";
import { Timeline } from "@/components/issue/Timeline";
import { TimelineList } from "@/components/issue/TimelineList";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { isSidebarEventPick } from "@/components/shell/IssueExplorer";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";
import { useShell } from "@/components/shell/useShell";
import { usePageTitle } from "@/components/usePageTitle";
import { formatPeriod } from "@/lib/date";
import { toId } from "@/lib/id";
import { NotFoundPage } from "@/pages/NotFoundPage";

const NOT_FOUND_TITLE = "이슈를 찾을 수 없어요";

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "ISSUE_NOT_FOUND";

// 이슈 화면 `/issues/:issueId` — 이슈 헤더(A3)와 F07 사건 중심 이슈 에볼루션 맵 타임라인(A4)
// (EXPERIENCE.md Information Architecture, 프로토타입 v21 IssueScreen).
// 고른 사건은 `?event=` 에 두고, 고르면 사건 패널(A5 · A6)이 열린다. 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
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
  // 화면 안에서 사건을 골랐나 — 그때만 패널을 열며 패널 제목으로 포커스를 옮긴다.
  // 사이드바 사건 링크로 고른 것도 같다 — 패널이 열리며 사이드바가 접혀 누른 링크가 사라지므로 포커스를 패널로 넘긴다
  const [pickedHere, setPicked] = useState(false);
  const { state } = useLocation();
  const picked = pickedHere || isSidebarEventPick(state);
  // 고르기는 기록을 쌓지 않는다 — 뒤로 가기는 앞 화면으로 간다
  const setEvent = useCallback(
    (eventId: number | null) => {
      setPicked(true);
      setSearchParams(
        (params) => {
          if (eventId === null) params.delete("event");
          else params.set("event", String(eventId));
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 사건 패널 — 고른 사건이 있으면 열린다. 열리면 사이드바를 접는다 (EXPERIENCE.md 앱 셸 「오른쪽 패널」)
  const narrow = useMediaQuery(NARROW_SCREEN);
  // 좁은 화면 시트는 닫히며 미끄러져 내려가는 동안(SEED) 마지막 사건을 그대로 보인다
  const [sheetEventId, setSheetEventId] = useState(selectedId);
  if (selectedId !== null && selectedId !== sheetEventId)
    setSheetEventId(selectedId);
  const shell = useShell();
  // 닫혀 있다가 열릴 때만 — 연 채 사이드바를 펼친 뒤 다른 사건으로 가도 다시 접지 않는다
  const panelOpen = selectedId !== null;
  useEffect(() => {
    if (panelOpen) shell?.collapseSidebar();
  }, [panelOpen, shell]);
  // 주소의 사건이 다른 이슈의 사건이면 그 이슈 주소로 바꾼다 — 사이드바 · 검색 링크가 어긋나도 맞는 타임라인이 열리게
  const navigate = useNavigate();
  const selectedEvent = useQuery({
    ...eventQuery(selectedId ?? 0),
    enabled: selectedId !== null,
  });
  const otherIssueId =
    selectedEvent.data?.issue && selectedEvent.data.issue.id !== issueId
      ? selectedEvent.data.issue.id
      : null;
  useEffect(() => {
    if (otherIssueId !== null && selectedId !== null)
      navigate(`/issues/${otherIssueId}?event=${selectedId}`, {
        replace: true,
      });
  }, [otherIssueId, selectedId, navigate]);
  // 닫으면 포커스를 그 사건 노드로 돌린다 (Accessibility Floor). 타임라인에 없는 사건이면 이슈 제목으로
  const pageRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => {
    const closed = selectedId;
    // 열려 있지 않으면(타임라인 빈 곳을 그냥 누른 것) 아무것도 하지 않는다
    if (closed === null) return;
    setEvent(null);
    const page = pageRef.current;
    const node = page?.querySelector<SVGElement>(`[data-event-id="${closed}"]`);
    (node ?? page?.querySelector<HTMLElement>("h1"))?.focus();
  }, [selectedId, setEvent]);

  if (notFound)
    return <NotFoundPage title={NOT_FOUND_TITLE} focusTitle={titleFocused} />;

  return (
    // 좁은 화면은 화면 전체가 한 번에 스크롤한다 — 머리가 위로 지나가고 세로 타임라인이 화면을 다 쓴다.
    // 넓은 화면은 높이를 채우고 가로 지도가 남은 자리를 쓴다
    <div
      ref={pageRef}
      className={narrow ? "flex min-h-full" : "flex h-full min-h-[520px]"}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <IssueHeader query={issue} onTitleFocusChange={setTitleFocused} />
        <div className="flex min-h-0 flex-1 flex-col border-t border-stroke-neutral-subtle">
          {timeline.data ? (
            timeline.data.events.length === 0 ? (
              <Centered>
                <EmptyState message="아직 이 이슈에 정리된 사건이 없어요" />
              </Centered>
            ) : // 좁은 화면은 가로 지도 대신 세로 타임라인 — 폰에서 가로 지도는 라벨이 잘리고 옆으로 계속 밀어야 한다
            narrow ? (
              <TimelineList
                events={timeline.data.events}
                selectedId={selectedId}
                onSelect={setEvent}
                summary={issue.data && summaryOf(issue.data)}
              />
            ) : (
              <Timeline
                events={timeline.data.events}
                selectedId={selectedId}
                onSelect={setEvent}
                onDeselect={closePanel}
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
      {narrow
        ? sheetEventId !== null && (
            <EventDetailPane
              open={panelOpen && otherIssueId === null}
              eventId={sheetEventId}
              narrow
              focusOnOpen={picked}
              onClose={closePanel}
              onSelectEvent={setEvent}
            />
          )
        : panelOpen &&
          otherIssueId === null && (
            <EventDetailPane
              open
              eventId={selectedId}
              narrow={false}
              focusOnOpen={picked}
              onClose={closePanel}
              onSelectEvent={setEvent}
            />
          )}
    </div>
  );
}

// 「2026.08.04 ~ 10.09 · 사건 8 · 기사 31」 — 사건이 없으면 기간 없이, 개수가 0이면 그 항목을 뺀다.
// 항목 안과 점 앞은 줄바꿈 없는 칸이다 — 좁은 화면에서 「기사 / 12」처럼 숫자만 넘어가거나 줄이 「·」로 시작하지 않게
function summaryOf(issue: IssueDetail) {
  return [
    issue.firstEventAt &&
      issue.lastEventAt &&
      formatPeriod(issue.firstEventAt, issue.lastEventAt),
    issue.eventCount > 0 && `사건 ${issue.eventCount}`,
    issue.articleCount > 0 && `기사 ${issue.articleCount}`,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replaceAll(" ", NBSP))
    .join(`${NBSP}· `);
}

const NBSP = "\u00a0";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center">{children}</div>
  );
}

// 타임라인 자리 — 도구줄과 레인 두 줄 모양
function TimelineSkeleton() {
  return (
    <LoadingState label="타임라인 불러오는 중">
      <div className="flex flex-col gap-x6 px-x5 py-x3 md:px-x8">
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
