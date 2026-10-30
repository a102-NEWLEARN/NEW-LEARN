import {
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { type ArticleDetail, articleQuery } from "@/api/article";
import { ApiError } from "@/api/error";
import { type Mindmap, mindmapQuery } from "@/api/mindmap";
import { AiBadge } from "@/components/AiBadge";
import { ArticleHeader } from "@/components/article/ArticleHeader";
import { MindmapView } from "@/components/article/MindmapView";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { usePageTitle } from "@/components/usePageTitle";
import { toId } from "@/lib/id";
import { NotFoundPage } from "@/pages/NotFoundPage";

const NOT_FOUND_TITLE = "기사를 찾을 수 없어요";
// 화면이 아는 A9 응답 판 (docs/api-screen.md A9). 모르는 판이면 그리지 않고 안내만 한다
const KNOWN_SCHEMA = "mindmap-v1";

type View = "flow" | "map";
// 1차(S15P31A102-58)는 마인드맵 보기만 있어서 view 가 없으면 마인드맵이다.
// 흐름지도 보기를 넣는 2차에서 흐름지도를 기본으로 바꾼다 (EXPERIENCE.md 보기 탭)
const DEFAULT_VIEW: View = "map";
const toView = (raw: string | null): View =>
  raw === "flow" || raw === "map" ? raw : DEFAULT_VIEW;

const isArticleNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "ARTICLE_NOT_FOUND";
const isMindmapNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === "MINDMAP_NOT_FOUND";

// 기사 마인드맵 화면 `/articles/:articleId` — 기사 헤더(A8)와 보기 탭, F04 기사 마인드맵 생성의 마인드맵 보기(A9)
// (EXPERIENCE.md Information Architecture, 프로토타입 v21 MindmapScreen). 고른 보기는 `?view=` 에 둔다.
// 셸이 <main> 을 줄 것이라 여기서는 쓰지 않는다
export function ArticlePage() {
  const articleId = toId(useParams().articleId);
  if (articleId === null) return <NotFoundPage title={NOT_FOUND_TITLE} />;
  // 기사를 바꾸면 화면 상태(포커스한 가지 · 숨긴 가지)를 새로 시작한다
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

  // 보기 바꾸기는 기록을 쌓지 않는다 — 뒤로 가기는 앞 화면으로 간다 (EXPERIENCE.md 이동 규칙)
  const [searchParams, setSearchParams] = useSearchParams();
  const view = toView(searchParams.get("view"));
  const setView = useCallback(
    (next: string) =>
      setSearchParams(
        (params) => {
          params.set("view", next);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  if (notFound)
    return <NotFoundPage title={NOT_FOUND_TITLE} focusTitle={titleFocused} />;

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <ArticleHeader query={article} onTitleFocusChange={setTitleFocused} />
      <TabsRoot
        value={view}
        onValueChange={setView}
        triggerLayout="hug"
        size="medium"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center gap-x3 px-x4 shadow-[inset_0_-1px_var(--seed-color-stroke-neutral-weak)] md:px-x8">
          <TabsList
            aria-label="보기"
            className="shrink-0 gap-x6 overflow-visible bg-transparent px-0 shadow-none"
          >
            <TabsTrigger value="flow" className={TAB}>
              흐름지도
            </TabsTrigger>
            <TabsTrigger value="map" className={TAB}>
              마인드맵
            </TabsTrigger>
            <TabsIndicator className="border-b-bg-brand-solid" />
          </TabsList>
          {/* AI 가 만든 마인드맵 — AI 생성 표시를 붙인다 (EXPERIENCE.md Voice and Tone) */}
          {mindmap.data?.aiGenerated && (
            <span className="ml-auto">
              <AiBadge />
            </span>
          )}
        </div>
        {/* 탭마다 내용 자리를 둬서 탭의 aria-controls 가 가리킬 곳이 있게 한다. 내용은 고른 탭에만 그린다 */}
        <TabsContent value="flow" className={PANEL}>
          {view === "flow" && (
            <Centered>
              <EmptyState message="흐름지도 보기는 준비 중이에요" />
            </Centered>
          )}
        </TabsContent>
        <TabsContent value="map" className={PANEL}>
          {view === "map" && (
            <MindmapBody article={article.data} query={mindmap} />
          )}
        </TabsContent>
      </TabsRoot>
    </div>
  );
}

// 탭 글자 — 분야 탭(CategoryTabs)과 같다. 고르면 굵게 + 청록 밑줄
const TAB =
  "t5-medium px-0 text-fg-neutral-muted hover:text-fg-neutral aria-selected:t5-bold aria-selected:text-fg-neutral";
// 탭 내용 — 남은 높이를 채운다. SEED 는 고르지 않은 탭에 aria-hidden 만 달아서 여기서 숨긴다
const PANEL = "flex min-h-0 flex-1 flex-col aria-hidden:hidden";

type MindmapBodyProps = {
  /** A8 — 마인드맵 결과가 없을 때 「분석 중」인지 가른다 */
  article: ArticleDetail | undefined;
  query: ReturnType<typeof useQuery<Mindmap>>;
};

// 마인드맵 보기 자리의 상태 (EXPERIENCE.md State Patterns). 아직 문구를 정하지 않은 상태(EXP 「아직 정하지 않은 것」)는
// 「마인드맵이 아직 없어요」로 둔다 [가정]
function MindmapBody({ article, query }: MindmapBodyProps) {
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
    return <MindmapView title={mindmap.title} branches={mindmap.branches} />;
  }
  // 결과가 없으면 A8 의 mindmapStatus 로 「분석 중」인지 가른다. A8 을 기다리는 동안은 불러오는 중이다
  if (isMindmapNotFound(query.error)) {
    if (!article) return <MindmapSkeleton />;
    return (
      <Centered>
        <EmptyState
          message={
            article.mindmapStatus === "QUEUED"
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
  return <MindmapSkeleton />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-x4">
      {children}
    </div>
  );
}

// 마인드맵 자리 — 범례 줄과 가운데 원 · 가지 넷 모양
function MindmapSkeleton() {
  return (
    <LoadingState label="마인드맵 불러오는 중">
      <div className="flex h-[360px] items-center justify-center gap-x10">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-full bg-bg-neutral-weak ${i === 1 ? "size-x16" : "size-x10"}`}
          />
        ))}
      </div>
    </LoadingState>
  );
}
