import {
  IconArrowLeftLine,
  IconArrowRightLine,
  IconCalendarLine,
  IconChevronDownLine,
  IconDocumentLine,
} from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import {
  type InfiniteData,
  keepPreviousData,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { type ReactNode, type Ref, useEffect, useRef } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { ApiError } from "@/api/error";
import { type EventDetail, eventQuery } from "@/api/event";
import { EVENT_ARTICLES_SIZE, eventArticlesQuery } from "@/api/eventArticles";
import type { ArticleSummary, EventRef, Page } from "@/api/types";
import { AiBadge } from "@/components/AiBadge";
import { ArticleRow } from "@/components/ArticleRow";
import { meaningProps } from "@/components/meaning/meaningProps";
import { enterAt, RISE } from "@/components/motion/screenMotion";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { formatEventDate, formatFullDate } from "@/lib/date";

type EventPanelProps = {
  eventId: number;
  /** 이전 · 다음 사건 — 패널을 연 채 고른 사건만 바꾼다 */
  onSelectEvent: (eventId: number) => void;
  /** 패널을 열 때 화면이 포커스를 옮길 제목(h2). 데이터를 기다리지 않고 첫 렌더에 그린다 */
  headingRef?: Ref<HTMLHeadingElement>;
};

// 사건을 열거나 바꾸면 이 차례(ms)로 떠오른다 — 속한 이슈 → 제목 → 날짜 → 요약 → 관련 기사(한 줄씩 50ms).
// 사건이 바뀌면 그 묶음을 새로 그려 다시 떠오르게 한다. 이전 · 다음 버튼은 포커스를 지키려고 새로 그리지 않는다
const PANEL_AT = {
  issue: 0,
  title: 60,
  dates: 120,
  summary: 180,
  related: 240,
};
const ROW_AFTER = 300;
const ROW_GAP = 50;
const ROW_STAGGER_MAX = 4;

const isEventNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "EVENT_NOT_FOUND";

// 사건 패널 내용 — F08 사건별 관련 기사 조회 (프로토타입 v21 EventPanel, EXPERIENCE.md IA 사건 패널 행).
// 속한 이슈 · 사건 제목 · 날짜, 요약(A5), 관련 기사(A6), 이전 · 다음 사건. 자리 · 닫기는 이슈 화면이 맡는다
export function EventPanel({
  eventId,
  onSelectEvent,
  headingRef,
}: EventPanelProps) {
  // 이전 · 다음으로 사건을 바꾸는 동안 앞 사건을 그대로 두어, 누른 버튼이 사라지며 포커스를 잃지 않게 한다
  const event = useQuery({
    ...eventQuery(eventId),
    placeholderData: keepPreviousData,
  });
  const articles = useInfiniteQuery(eventArticlesQuery(eventId));
  const detail = event.data;
  const notFound = isEventNotFound(event.error);
  // 이전 · 다음으로 옮긴 뒤 누른 버튼이 없어졌으면(마지막 · 첫 사건) 남은 쪽 버튼으로 포커스를 옮긴다
  const navRef = useRef<HTMLElement>(null);
  const stepped = useRef(false);
  const step = (nextId: number) => {
    stepped.current = true;
    onSelectEvent(nextId);
  };
  useEffect(() => {
    if (!stepped.current || event.isPlaceholderData) return;
    stepped.current = false;
    const nav = navRef.current;
    // 포커스를 잃었을 때(body)만 — 받는 동안 사용자가 다른 곳으로 옮긴 포커스는 그대로 둔다
    const active = document.activeElement;
    if (!nav || (active && active !== document.body)) return;
    nav.querySelector<HTMLButtonElement>("button")?.focus();
  }, [detail?.id, event.isPlaceholderData]);

  // 앞 사건을 보이는 동안에는 새 사건의 관련 기사 · 첫 기사를 섞지 않는다
  const pending = event.isPlaceholderData;
  // A6 는 발행 순이라 첫 쪽의 맨 앞이 첫 기사다
  const firstArticle = pending ? undefined : articles.data?.pages[0]?.items[0];

  // 사건이 바뀌면 key 를 바꿔 새로 그린다(떠오르는 애니메이션이 다시 돈다). 같은 부모 안 형제끼리 key 가 겹치면
  // 앞 사건 요소가 안 지워지고 쌓인다(운영에서 이슈 제목 줄이 쌓였다, Jira 188) — 자리마다 앞말을 붙인다
  return (
    <div
      aria-busy={event.isPlaceholderData}
      className={`flex flex-col gap-x3 transition-opacity ${event.isPlaceholderData ? "opacity-60" : ""}`}
    >
      <div>
        {detail?.issue && (
          <p
            key={`issue-${detail.id}`}
            className={`t3-bold truncate text-fg-brand ${RISE}`}
            style={enterAt(PANEL_AT.issue)}
          >
            {detail.issue.title}
          </p>
        )}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="t8-bold mt-x1_5 pr-x10 text-fg-neutral outline-none"
        >
          {detail ? (
            // 제목 글만 새로 그린다 — h2 는 패널을 열 때 포커스를 받는 자리라 그대로 둔다
            <span
              key={detail.id}
              className={`block ${RISE}`}
              style={enterAt(PANEL_AT.title)}
              {...meaningProps("EVENT", detail.id)}
            >
              {detail.title}
            </span>
          ) : notFound ? (
            "사건을 찾을 수 없어요"
          ) : event.isError ? (
            "사건을 불러오지 못했어요"
          ) : (
            <>
              <span className="sr-only">사건 불러오는 중</span>
              <Skeleton
                radius="8"
                width="full"
                height="lineHeight.t8"
                className="max-w-[300px]"
              />
            </>
          )}
        </h2>
        {event.isError && !notFound && !detail && (
          <ActionButton
            variant="neutralOutline"
            size="small"
            className="mt-x3 border-stroke-neutral-weak"
            onClick={() => void event.refetch()}
          >
            다시 시도
          </ActionButton>
        )}
        {notFound && (
          <p className="t4-regular mt-x2 text-fg-neutral-muted">
            지워졌거나 주소가 잘못된 사건이에요.
          </p>
        )}
        {detail && (
          <div
            key={`dates-${detail.id}`}
            className={`mt-x3 flex flex-wrap gap-x1_5 ${RISE}`}
            style={enterAt(PANEL_AT.dates)}
          >
            <DateChip icon={<IconCalendarLine aria-hidden size={14} />}>
              <span>사건 발생</span>{" "}
              <b className="font-semibold text-fg-neutral">
                {formatFullDate(detail.occurredAt)}
              </b>
              {detail.occurredAtBasis === "FIRST_PUBLISHED" && " 추정"}
            </DateChip>
            {firstArticle && (
              <DateChip icon={<IconDocumentLine aria-hidden size={14} />}>
                <span>첫 기사</span>{" "}
                <b className="font-semibold text-fg-neutral">
                  {formatFullDate(firstArticle.publishedAt)}
                </b>
              </DateChip>
            )}
          </div>
        )}
      </div>

      {detail?.summary && (
        <section
          key={`summary-${detail.id}`}
          aria-label="요약"
          className={`${CARD} ${RISE}`}
          style={enterAt(PANEL_AT.summary)}
        >
          <div className="flex items-center gap-x2">
            <p className="t4-bold text-fg-neutral">요약</p>
            <span className="ml-auto">
              <AiBadge />
            </span>
          </div>
          {/* 드래그하면 용어사전 말풍선이 뜬다 — 앞 사건을 보이는 동안에도 그 사건(detail.id)의 글이다 */}
          <p
            className="t5-regular mt-x2_5 text-fg-neutral"
            {...meaningProps("EVENT", detail.id)}
          >
            {detail.summary}
          </p>
        </section>
      )}

      {detail && (
        <RelatedArticles
          // 사건이 바뀌면 더 보기 포커스 같은 상태를 새로 시작한다
          key={`articles-${eventId}`}
          articles={articles}
          count={detail.articleCount}
          pending={pending}
        />
      )}

      {detail && (detail.previousEvent || detail.nextEvent) && (
        <nav
          ref={navRef}
          aria-label="이전 · 다음 사건"
          className="grid grid-cols-2 gap-x2"
        >
          {/* 하나만 있으면 줄을 다 쓴다 — 반 칸만 오른쪽에 떠 있으면 비어 보였다 (2026-11-05 UI 점검) */}
          {detail.previousEvent && (
            <EventStep
              direction="previous"
              event={detail.previousEvent}
              alone={!detail.nextEvent}
              onClick={step}
            />
          )}
          {detail.nextEvent && (
            <EventStep
              direction="next"
              event={detail.nextEvent}
              alone={!detail.previousEvent}
              onClick={step}
            />
          )}
        </nav>
      )}
    </div>
  );
}

// 카드 · 패널 — 흰 바탕, 1px 테두리, 16px 모서리 (DESIGN.md 요소별 역할 토큰)
const CARD =
  "rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x5 py-x4";

function DateChip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="t2-regular inline-flex h-x7 items-center gap-x1_5 rounded-r2 bg-bg-neutral-weak px-x2_5 whitespace-nowrap text-fg-neutral-muted tabular-nums">
      {icon}
      <span>{children}</span>
    </span>
  );
}

type RelatedArticlesProps = {
  articles: UseInfiniteQueryResult<InfiniteData<Page<ArticleSummary>>>;
  count: EventDetail["articleCount"];
  /** 앞 사건을 보이는 중 — 기사 대신 자리만 둔다 */
  pending: boolean;
};

// 관련 기사 — 발행 순 처음 5건, 더 있으면 *더 보기* 로 다음 쪽을 붙인다 (EXPERIENCE.md Component Patterns 「기사 행」)
function RelatedArticles({ articles, count, pending }: RelatedArticlesProps) {
  const pages = articles.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const total = pages[0]?.totalElements ?? 0;

  // *더 보기* 로 붙인 첫 기사로 포커스를 옮긴다 — 마지막 쪽이면 버튼이 사라져 포커스를 잃는다
  const listRef = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || items.length <= from) return;
    focusFrom.current = null;
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>(
      ":scope > li > a:first-child",
    );
    links?.[from]?.focus();
  }, [items.length]);
  const loadMore = () => {
    focusFrom.current = items.length;
    void articles.fetchNextPage();
  };

  let body: ReactNode;
  if (articles.data && !pending) {
    body =
      items.length === 0 ? (
        <EmptyState message="아직 이 사건을 다룬 기사가 없어요." />
      ) : (
        <ul
          ref={listRef}
          aria-label="관련 기사"
          className="mt-x1 divide-y divide-stroke-neutral-subtle"
        >
          {/* 한 줄씩 떠오른다 — *더 보기* 로 붙인 쪽도 그 쪽 첫 줄부터 다시 센다 */}
          {items.map((article, index) => (
            <ArticleRow
              key={article.id}
              article={article}
              enterDelay={
                ROW_AFTER +
                Math.min(index % EVENT_ARTICLES_SIZE, ROW_STAGGER_MAX) * ROW_GAP
              }
            />
          ))}
        </ul>
      );
  } else if (articles.isError && !pending) {
    body = (
      <ErrorState
        title="관련 기사를 불러오지 못했어요"
        error={articles.error}
        onRetry={() => void articles.refetch()}
      />
    );
  } else {
    body = (
      <LoadingState label="관련 기사 불러오는 중">
        <div className="flex flex-col gap-x3 px-x2 py-x3">
          {Array.from({ length: 3 }, (_, at) => (
            <Skeleton key={at} radius="8" width="full" height="x10" />
          ))}
        </div>
      </LoadingState>
    );
  }

  return (
    <section
      aria-label="관련 기사"
      className={`${CARD} px-x3 pb-x3 ${RISE}`}
      style={enterAt(PANEL_AT.related)}
    >
      <div className="flex items-center gap-x2 px-x2">
        <p className="t4-bold text-fg-neutral">관련 기사</p>
        {!pending && (
          <span className="t2-bold rounded-full bg-bg-brand-weak px-x2 text-fg-brand tabular-nums">
            {count}
          </span>
        )}
        <span className="t2-regular ml-auto text-fg-neutral-subtle">
          발행 순
        </span>
      </div>
      {body}
      {articles.hasNextPage && !pending && (
        <ActionButton
          variant="ghost"
          size="small"
          className="mt-x1"
          loading={articles.isFetchingNextPage}
          onClick={loadMore}
        >
          {`기사 ${Math.min(total - items.length, EVENT_ARTICLES_SIZE)}개 더 보기`}
          <IconChevronDownLine aria-hidden size={14} />
        </ActionButton>
      )}
    </section>
  );
}

function EventStep({
  direction,
  event,
  alone,
  onClick,
}: {
  direction: "previous" | "next";
  event: EventRef;
  /** 이전 · 다음 가운데 하나뿐이면 두 칸을 다 쓴다. 정렬(이전 왼쪽 · 다음 오른쪽)은 그대로 */
  alone: boolean;
  onClick: (eventId: number) => void;
}) {
  const previous = direction === "previous";
  const place = alone ? "col-span-2" : previous ? "" : "col-start-2";
  return (
    <button
      type="button"
      onClick={() => onClick(event.id)}
      className={`flex min-w-0 flex-col gap-x0_5 rounded-r3 border border-stroke-neutral-weak bg-bg-layer-default px-x3 py-x2_5 transition-colors hover:border-palette-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring ${place} ${previous ? "items-start text-left" : "items-end text-right"}`}
    >
      <span className="t2-regular flex items-center gap-x1 text-fg-neutral-muted">
        {previous && <IconArrowLeftLine aria-hidden size={12} />}
        {previous ? "이전 사건" : "다음 사건"}
        {!previous && <IconArrowRightLine aria-hidden size={12} />}
      </span>
      <span className="t4-bold max-w-full truncate text-fg-neutral">
        {event.label}
      </span>
      <span className="t2-regular text-fg-neutral-subtle tabular-nums">
        {formatEventDate(event.occurredAt)}
      </span>
    </button>
  );
}
