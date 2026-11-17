import {
  IconStarFill,
  IconStarLine,
} from "@karrotmarket/react-monochrome-icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MouseEvent } from "react";
import { isSessionExpired } from "@/api/error";
import {
  addInterestIssue,
  removeInterestIssue,
  setInterested,
} from "@/api/interestIssues";
import { meQuery } from "@/api/members";
import { useSignupPrompt } from "@/components/useSignupPrompt";
import { useSnackbar } from "@/components/useSnackbar";

const FAILED = "관심 이슈를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

const LABEL = "관심 이슈로 저장";

type InterestButtonProps = {
  issueId: number;
  /** 지금 관심 이슈인가 — A2 · A3 의 interested */
  interested: boolean;
  className?: string;
};

// 관심 이슈 별 — 이슈 머리 제목 옆, 40px (docs/api-screen.md A23 · A24, 프로토타입 v21 PinButton).
// 누르면 저장(A23) · 해제(A24)하고, 별은 응답의 interested 로 맞춘다. 이름은 그대로 두고 눌림(aria-pressed)으로 상태를 알린다.
// 실패는 스낵바로 알린다 [가정] — 별 하나라 그 자리에 문장을 둘 곳이 없다
export function InterestButton({
  issueId,
  interested,
  className = "",
}: InterestButtonProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const signupPrompt = useSignupPrompt("interest");

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? addInterestIssue(issueId) : removeInterestIssue(issueId),
    onSuccess: (state) => {
      // 그사이 로그아웃했으면 손님 화면에 회원 상태를 다시 넣지 않는다
      if (queryClient.getQueryData(meQuery.queryKey) === null) return;
      // 이슈 머리 · 홈 추천 · 분야별 이슈의 별을 응답대로 바꾸고 관심 이슈 목록(나의 뉴스함 · 마이페이지 개수 · 홈 추천 순서)을 새로 받게 한다
      setInterested(queryClient, issueId, state.interested);
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

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    // 손님(A17 이 401)이면 보내지 않고 가입을 권한다 (Jira 205). 회원인지 아직 모르면 보낸다 — 손님이면 401 이 와도 조용히 끝난다
    if (queryClient.getQueryData(meQuery.queryKey) === null) {
      signupPrompt.open(event.currentTarget);
      return;
    }
    // 보내는 동안 다시 누르면 요청이 엇갈린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    mutation.mutate(!interested);
  }

  const Icon = interested ? IconStarFill : IconStarLine;

  return (
    <>
      <button
        type="button"
        aria-pressed={interested}
        aria-label={LABEL}
        title={interested ? "관심 이슈에서 빼기" : LABEL}
        aria-busy={mutation.isPending || undefined}
        onClick={toggle}
        className={`flex size-x10 shrink-0 items-center justify-center rounded-r2 transition-[background-color,color] hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${
          interested ? "text-fg-brand" : "text-fg-neutral-subtle"
        } ${className}`}
      >
        <Icon aria-hidden size={22} />
      </button>
      {signupPrompt.dialog}
    </>
  );
}
