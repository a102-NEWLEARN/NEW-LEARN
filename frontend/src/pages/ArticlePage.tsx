import { IconArrowUpRightArrowDownLeftLine } from "@karrotmarket/react-monochrome-icon";
import {
  Skeleton,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useSearchParams } from "react-router";
import { type ArticleDetail, articleQuery } from "@/api/article";
import { ApiError } from "@/api/error";
import { type Mindmap, mindmapQuery } from "@/api/mindmap";
import { ArticleHeader } from "@/components/article/ArticleHeader";
import { ExpandedView } from "@/components/article/ExpandedView";
import { FlowView } from "@/components/article/FlowView";
import {
  INITIAL_MINDMAP_SETTINGS,
  MindmapView,
} from "@/components/article/MindmapView";
import { NARROW_SCREEN, useMediaQuery } from "@/components/shell/useMediaQuery";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { usePageTitle } from "@/components/usePageTitle";
import { toId } from "@/lib/id";
import { prefersReducedMotion } from "@/lib/motion";
import { NotFoundPage } from "@/pages/NotFoundPage";

const NOT_FOUND_TITLE = "기사를 찾을 수 없어요";
// 화면이 아는 A9 응답 판 (docs/api-screen.md A9). 모르는 판이면 그리지 않고 안내만 한다
const KNOWN_SCHEMA = "mindmap-v1";

type View = "flow" | "map";
// view 가 없으면 흐름지도다 (EXPERIENCE.md 보기 탭)
const DEFAULT_VIEW: View = "flow";
const toView = (raw: string | null): View =>
  raw === "flow" || raw === "map" ? raw : DEFAULT_VIEW;

const isArticleNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "ARTICLE_NOT_FOUND";

// 그릴 수 있는 마인드맵인가 — 아는 판이고 가지가 하나 이상
const drawable = (mindmap: Mindmap | undefined): mindmap is Mindmap =>
  mindmap !== undefined &&
  mindmap.schemaVersion === KNOWN_SCHEMA &&
  mindmap.branches.length > 0;

const isMindmapNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "MINDMAP_NOT_FOUND";

// 기사 마인드맵 화면 `/articles/:articleId` — 기사 헤더(A8)와 보기 탭, F04 기사 마인드맵 생성의 흐름지도 · 마인드맵 보기(A9)
// (EXPERIENCE.md Information Architecture, 프로토타입 v21 MindmapScreen). 고른 보기는 `?view=` 에 둔다.
// 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function ArticlePage() {
  const articleId = toId(useParams().articleId);
  if (articleId === null) return <NotFoundPage title={NOT_FOUND_TITLE} />;
  // 기사를 바꾸면 화면 상태(포커스한 가지 · 숨긴 가지 · 라벨 표시)를 새로 시작한다
  return <ArticleView key={articleId} articleId={articleId} />;
}

function ArticleView({ articleId }: { articleId: number }) {
  const article = useQuery(articleQuery(articleId));
  const mindmap = useQuery(mindmapQuery(articleId));
  const notFound =
    isArticleNotFound(article.error) || isArticleNotFound(mindmap.error);
  usePageTitle(notFound ? NOT_FOUND_TITLE : (article.data?.title ?? "기사"));
  // 제목에 포커스가 있던 채 404 를 받으면 찾을 수 없음 제목으로 포커스를 넘긴다
  const [titleFocused, setTitleFocused] = useState(false);
  // 마인드맵 보기의 숨긴 가지 · 라벨 표시 — 보기 탭을 오가도 남게 여기서 든다.
  // 확대 · 가지 포커스 · 강조는 보기마다 그 안에 있어서 탭을 바꾸면 풀린다
  const [mapSettings, setMapSettings] = useState(INITIAL_MINDMAP_SETTINGS);

  // 보기 바꾸기는 기록을 쌓지 않는다 — 뒤로 가기는 앞 화면으로 간다 (EXPERIENCE.md 이동 규칙)
  const [searchParams, setSearchParams] = useSearchParams();
  const view = toView(searchParams.get("view"));
  // 좁은 화면에서 마인드맵 탭을 눌렀다 — 그린 뒤 탭 줄이 맨 위에 붙을 때까지 내린다. 그래프 칸은 탭 아래 남은 높이라
  // 그래야 칸 전체가 보이고 가운데 원이 보이는 화면 가운데 온다 (2026-11-12 사용자, Jira 195).
  // 주소로 바로 연 마인드맵은 기사 머리를 숨기지 않게 내리지 않는다
  const narrow = useMediaQuery(NARROW_SCREEN);
  const tabRowRef = useRef<HTMLDivElement>(null);
  const revealMap = useRef(false);
  const setView = useCallback(
    (next: string) => {
      revealMap.current = next === "map" && narrow;
      setSearchParams(
        (params) => {
          params.set("view", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams, narrow],
  );
  useEffect(() => {
    if (view !== "map" || !revealMap.current) return;
    revealMap.current = false;
    tabRowRef.current?.scrollIntoView?.({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [view]);

  // 크게 보기 — 그린 보기가 있을 때만 탭 줄 오른쪽 끝에 버튼을 두고, 누르면 지금 보기를 화면을 꽉 채운 창으로 다시 그린다
  // (2026-11-12 사용자, Jira 195). 숨긴 가지 · 라벨 표시는 여기서 들고 있어 창에서도 같다. 확대 · 포커스 · 강조는 창에서 새로 시작한다
  const [expanded, setExpanded] = useState(false);
  const drawn = drawable(mindmap.data) ? mindmap.data : null;
  const renderView = (
    which: View,
    { title, branches, aiGenerated }: Mindmap,
    fill = false,
  ) =>
    which === "flow" ? (
      <FlowView
        articleId={articleId}
        title={title}
        branches={branches}
        aiGenerated={aiGenerated}
        fill={fill}
      />
    ) : (
      <MindmapView
        articleId={articleId}
        title={title}
        branches={branches}
        aiGenerated={aiGenerated}
        settings={mapSettings}
        onSettingsChange={setMapSettings}
        fill={fill}
      />
    );

  if (notFound)
    return <NotFoundPage title={NOT_FOUND_TITLE} focusTitle={titleFocused} />;

  return (
    // 좁은 화면은 화면 전체가 한 번에 스크롤한다 — 머리가 위로 지나가고 보기 탭은 위에 붙는다.
    // 넓은 화면은 높이를 채우고 보기가 남은 자리 안에서 스크롤한다
    <div className="flex min-h-full flex-col md:h-full md:min-h-[560px]">
      <ArticleHeader query={article} onTitleFocusChange={setTitleFocused} />
      <TabsRoot
        value={view}
        onValueChange={setView}
        triggerLayout="hug"
        size="medium"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          ref={tabRowRef}
          className="flex items-center gap-x3 bg-bg-layer-default px-x5 shadow-[inset_0_-1px_var(--seed-color-stroke-neutral-weak)] max-md:sticky max-md:top-0 max-md:z-[3] md:px-x8"
        >
          {/* 좁은 화면은 홈 보기 탭처럼 두 탭이 줄을 반씩 나눈다 */}
          <TabsList
            aria-label="보기"
            className="shrink-0 gap-x6 overflow-visible bg-transparent px-0 shadow-none max-md:flex-1 max-md:gap-0"
          >
            <TabsTrigger value="flow" className={TAB}>
              흐름지도
            </TabsTrigger>
            <TabsTrigger value="map" className={TAB}>
              마인드맵
            </TabsTrigger>
            <TabsIndicator className="border-b-bg-brand-solid" />
          </TabsList>
          {drawn && (
            <button
              type="button"
              aria-label="크게 보기"
              title="크게 보기"
              aria-haspopup="dialog"
              // 창을 닫으면 SEED(Radix FocusScope)가 열기 전 포커스 자리로 돌려준다 — 사파리는 눌러도 버튼에 포커스를 주지 않아
              // 직접 준다. 그래야 닫은 뒤 이 버튼으로 돌아온다
              onClick={(click) => {
                click.currentTarget.focus();
                setExpanded(true);
              }}
              className="ml-auto flex size-x10 shrink-0 items-center justify-center rounded-r2 text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
            >
              <IconArrowUpRightArrowDownLeftLine aria-hidden size={18} />
            </button>
          )}
        </div>
        {/* 탭마다 내용 자리를 둬서 탭의 aria-controls 가 가리킬 곳이 있게 한다. 내용은 고른 탭에만 그린다 */}
        <TabsContent value="flow" className={PANEL}>
          {view === "flow" && (
            <MindmapBody
              article={article.data}
              articleFailed={article.isError}
              query={mindmap}
              skeleton={<FlowSkeleton />}
            >
              {(drawing) => renderView("flow", drawing)}
            </MindmapBody>
          )}
        </TabsContent>
        <TabsContent value="map" className={PANEL}>
          {view === "map" && (
            <MindmapBody
              article={article.data}
              articleFailed={article.isError}
              query={mindmap}
              skeleton={<MindmapSkeleton />}
            >
              {(drawing) => renderView("map", drawing)}
            </MindmapBody>
          )}
        </TabsContent>
      </TabsRoot>
      {drawn && (
        <ExpandedView
          open={expanded}
          onOpenChange={setExpanded}
          title={article.data?.title ?? drawn.title}
        >
          {renderView(view, drawn, true)}
        </ExpandedView>
      )}
    </div>
  );
}

// 탭 글자 — 홈 보기 탭(HomeViewTabs)과 같은 16px. 고르면 굵게 + 청록 밑줄. 좁은 화면은 반씩 채운다
const TAB =
  "t5-medium px-0 max-md:flex-1 max-md:justify-center text-fg-neutral-muted hover:text-fg-neutral aria-selected:t5-bold aria-selected:text-fg-neutral";
// 탭 내용 — 남은 높이를 채운다. SEED 는 고르지 않은 탭에 aria-hidden 만 달아서 여기서 숨긴다
const PANEL = "flex min-h-0 flex-1 flex-col aria-hidden:hidden";

type MindmapBodyProps = {
  /** A8 — 마인드맵 결과가 없을 때 「분석 중」인지 가른다 */
  article: ArticleDetail | undefined;
  /** A8 이 실패했나 — 그러면 A8 을 기다리지 않는다 */
  articleFailed: boolean;
  query: ReturnType<typeof useQuery<Mindmap>>;
  /** 불러오는 중 — 그 보기 모양의 스켈레톤 */
  skeleton: ReactNode;
  /** 그릴 수 있는 응답을 그 보기로 그린다 */
  children: (mindmap: Mindmap) => ReactNode;
};

// 보기 자리의 상태 — 두 보기가 같은 A9 응답이라 상태도 같다 (EXPERIENCE.md State Patterns).
// 아직 문구를 정하지 않은 상태(EXP 「아직 정하지 않은 것」)는 「마인드맵이 아직 없어요」로 둔다 [가정]
function MindmapBody({
  article,
  articleFailed,
  query,
  skeleton,
  children,
}: MindmapBodyProps) {
  const mindmap = query.data;
  if (mindmap) {
    if (mindmap.schemaVersion !== KNOWN_SCHEMA)
      return (
        <Centered>
          <EmptyState message="이 마인드맵은 지금 보여 드릴 수 없어요" />
        </Centered>
      );
    if (mindmap.branches.length === 0)
      return (
        <Centered>
          <EmptyState message="이 기사에서 정리한 내용이 없어요" />
        </Centered>
      );
    return children(mindmap);
  }
  // 결과가 없으면 A8 의 mindmapStatus 로 「분석 중」인지 가른다. A8 을 기다리는 동안은 불러오는 중이다
  if (isMindmapNotFound(query.error)) {
    // A8 이 실패했으면 분석 중인지 알 수 없다 — 결과가 없다는 것만 알린다
    if (!article && !articleFailed) return skeleton;
    return (
      <Centered>
        <EmptyState
          message={
            article?.mindmapStatus === "QUEUED"
              ? "기사를 분석하고 있어요"
              : "이 기사의 마인드맵이 아직 없어요"
          }
        />
      </Centered>
    );
  }
  if (query.isError)
    return (
      <Centered>
        <ErrorState
          title="마인드맵을 불러오지 못했어요"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </Centered>
    );
  return skeleton;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-x5 max-md:min-h-[50dvh]">
      {children}
    </div>
  );
}

// 마인드맵 자리 — 가운데 원과 양옆 가지 모양
function MindmapSkeleton() {
  return (
    <LoadingState label="마인드맵 불러오는 중">
      <div className="flex h-[360px] items-center justify-center gap-x10">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            radius="full"
            width={i === 1 ? "x16" : "x10"}
            height={i === 1 ? "x16" : "x10"}
          />
        ))}
      </div>
    </LoadingState>
  );
}

// 흐름지도 자리 — AI 생성 표시 줄 · 머리 줄과 가지 넷. FlowView 처럼 자리가 1024px 이상이면 4열이라 그릴 때 모양이 튀지 않는다
function FlowSkeleton() {
  return (
    <LoadingState label="마인드맵 불러오는 중">
      <div className="@container">
        <div className="mx-auto w-full max-w-[860px] px-x5 pt-x6 md:px-x8 md:pt-x7 @min-[1024px]:max-w-[1280px]">
          <Skeleton radius="full" width="x14" height="x5" className="mb-x4" />
          <Skeleton
            radius="8"
            width="full"
            height="lineHeight.t7"
            className="max-w-[320px]"
          />
          <div className="mt-x7 grid gap-y-x8 @min-[1024px]:grid-cols-4 @min-[1024px]:gap-x-x7">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-x3">
                <Skeleton radius="full" width="x8" height="x8" />
                <Skeleton
                  radius="8"
                  width="full"
                  height="lineHeight.t6"
                  className="max-w-[160px]"
                />
                <Skeleton radius="16" width="full" height="x16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingState>
  );
}
