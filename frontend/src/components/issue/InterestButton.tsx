import {
  IconStarFill,
  IconStarLine,
} from "@karrotmarket/react-monochrome-icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isSessionExpired } from "@/api/error";
import { type IssueDetail, issueQuery } from "@/api/issue";
import {
  addInterestIssue,
  interestIssuesQuery,
  removeInterestIssue,
} from "@/api/interestIssues";
import { meQuery } from "@/api/members";
import { useSnackbar } from "@/components/useSnackbar";

const FAILED = "관심 이슈를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

type InterestButtonProps = {
  issueId: number;
  /** 지금 관심 이슈인가 — A3 의 interested */
  interested: boolean;
};

// 관심 이슈 별 — 이슈 머리 제목 옆 (docs/api-screen.md A23 · A24, 프로토타입 v21 PinButton).
// 누르면 저장(A23) · 해제(A24)하고, 별은 응답의 interested 로 맞춘다. 이름은 그대로 두고 눌림(aria-pressed)으로 상태를 알린다.
// 실패는 스낵바로 알린다 [가정] — 별 하나라 그 자리에 문장을 둘 곳이 없다
export function InterestButton({ issueId, interested }: InterestButtonProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? addInterestIssue(issueId) : removeInterestIssue(issueId),
    onSuccess: (state) => {
      // 그사이 로그아웃했으면 손님 화면에 회원 상태를 다시 넣지 않는다
      if (queryClient.getQueryData(meQuery.queryKey) === null) return;
      queryClient.setQueryData<IssueDetail>(
        issueQuery(issueId).queryKey,
        (issue) => issue && { ...issue, interested: state.interested },
      );
      // 관심 이슈 목록(마이페이지)과 이슈 목록의 별 상태를 새로 받게 한다
      void queryClient.invalidateQueries({
        queryKey: interestIssuesQuery.queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ["issues"] });
      snackbar.show(
        state.interested ? "관심 이슈로 저장했어요" : "관심 이슈에서 뺐어요",
        "positive",
      );
    },
    onError: (cause) => {
      // 세션이 끝났다 — QueryClient 가 손님으로 바꿔 로그인 화면으로 보낸다(query-client.ts). 로그인하면 이 이슈로 돌아온다
      if (isSessionExpired(cause)) return;
      snackbar.show(FAILED);
    },
  });

  function toggle() {
    // 보내는 동안 다시 누르면 요청이 엇갈린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    mutation.mutate(!interested);
  }

  return (
    <button
      type="button"
      aria-pressed={interested}
      aria-label="관심 이슈로 저장"
      title={interested ? "관심 이슈에서 빼기" : "관심 이슈로 저장"}
      aria-busy={mutation.isPending || undefined}
      onClick={toggle}
      className={`flex size-x10 shrink-0 items-center justify-center rounded-r2 hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${
        interested ? "text-fg-brand" : "text-fg-neutral-subtle"
      }`}
    >
      {interested ? (
        <IconStarFill aria-hidden size={22} />
      ) : (
        <IconStarLine aria-hidden size={22} />
      )}
    </button>
  );
}
