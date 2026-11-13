import {
  IconBookmarkFill,
  IconBookmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addBookmark, removeBookmark, setBookmarked } from "@/api/bookmarks";
import { isSessionExpired } from "@/api/error";
import { meQuery } from "@/api/members";
import type { ArticleSummary } from "@/api/types";
import { useSignupPrompt } from "@/components/useSignupPrompt";
import { useSnackbar } from "@/components/useSnackbar";

const FAILED = "북마크를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

type BookmarkButtonProps = {
  article: Pick<ArticleSummary, "id" | "title" | "bookmarked">;
  /** 아이콘 크기 — medium 16px(기사 행), large 22px(기사 마인드맵 머리 · 이슈 머리 별과 같다). 누르는 자리는 둘 다 40px */
  size?: "medium" | "large";
  className?: string;
};

const ICON_SIZE = { medium: 16, large: 22 } as const;

// 북마크 — 누르면 담기(A20) · 빼기(A21)하고, 아이콘은 응답의 bookmarked 로 맞춘다
// (docs/api-screen.md A20 · A21 「화면이 할 일」, 프로토타입 v21 ScrapButton). 화면 이름은 「북마크」 · 「나의 뉴스함」이다.
// 실패는 스낵바로 알린다 [가정] — 버튼 하나라 그 자리에 문장을 둘 곳이 없다 (관심 이슈 별과 같다).
// 기사 머리의 글자 버튼(「북마크」 · 「북마크됨」)은 2026-11-12 아이콘으로 바꿨다 (사용자 「버튼이 너무 크다」, Jira 195)
export function BookmarkButton({
  article,
  size = "medium",
  className = "",
}: BookmarkButtonProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const signupPrompt = useSignupPrompt("bookmark");
  const on = article.bookmarked;

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? addBookmark(article.id) : removeBookmark(article.id),
    onSuccess: (state) => {
      // 그사이 로그아웃했으면 손님 화면에 회원 상태를 다시 넣지 않는다
      if (queryClient.getQueryData(meQuery.queryKey) === null) return;
      setBookmarked(queryClient, state.articleId, state.bookmarked);
      snackbar.show(
        state.bookmarked ? "나의 뉴스함에 담았어요" : "나의 뉴스함에서 뺐어요",
        "positive",
      );
    },
    onError: (cause) => {
      // 세션이 끝났다 — QueryClient 가 손님으로 바꿔 로그인 화면으로 보낸다(query-client.ts). 로그인하면 이 화면으로 돌아온다
      if (isSessionExpired(cause)) return;
      snackbar.show(FAILED);
    },
  });

  function toggle() {
    // 손님(A17 이 401)이면 보내지 않고 가입을 권한다 (Jira 205). 회원인지 아직 모르면 보낸다 — 손님이면 401 이 와도 조용히 끝난다
    if (queryClient.getQueryData(meQuery.queryKey) === null) {
      signupPrompt.open();
      return;
    }
    // 보내는 동안 다시 누르면 요청이 엇갈린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    mutation.mutate(!on);
  }

  const iconSize = ICON_SIZE[size];
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        // 같은 화면에 기사가 여럿이라 이름에 제목을 넣는다. 상태는 눌림으로 알리고 이름은 그대로 둔다
        aria-label={`${article.title} 나의 뉴스함에 담기`}
        title={on ? "나의 뉴스함에서 빼기" : "나의 뉴스함에 담기"}
        aria-busy={mutation.isPending || undefined}
        onClick={toggle}
        className={`flex size-x10 shrink-0 items-center justify-center rounded-r2 hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${
          on ? "text-fg-brand" : "text-fg-neutral-muted"
        } ${className}`}
      >
        {on ? (
          <IconBookmarkFill aria-hidden size={iconSize} />
        ) : (
          <IconBookmarkLine aria-hidden size={iconSize} />
        )}
      </button>
      {signupPrompt.dialog}
    </>
  );
}
