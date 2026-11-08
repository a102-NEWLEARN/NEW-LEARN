import {
  IconStarFill,
  IconStarLine,
} from "@karrotmarket/react-monochrome-icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isSessionExpired } from "@/api/error";
import {
  addInterestIssue,
  removeInterestIssue,
  setInterested,
} from "@/api/interestIssues";
import { meQuery } from "@/api/members";
import { useSnackbar } from "@/components/useSnackbar";

const FAILED = "관심 이슈를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

const LABEL = "관심 이슈로 저장";

type InterestButtonProps = {
  issueId: number;
  /** 지금 관심 이슈인가 — A2 · A3 의 interested */
  interested: boolean;
  /**
   * large — 이슈 머리 제목 옆(40px). small — 사이드바 이슈 줄 오른쪽(28px).
   * small 은 저장하지 않은 별을 마우스를 올리거나 포커스할 때만 보인다(마우스가 있는 화면만)
   */
  size?: "large" | "small";
  /** 이름 앞에 붙일 이슈 제목. 사이드바처럼 별이 여러 개면 화면 읽기에서 어느 이슈의 별인지 알게 한다 */
  issueTitle?: string;
  className?: string;
};

// 관심 이슈 별 — 이슈 머리 제목 옆 · 사이드바 이슈 줄 (docs/api-screen.md A23 · A24, 프로토타입 v21 PinButton).
// 누르면 저장(A23) · 해제(A24)하고, 별은 응답의 interested 로 맞춘다. 이름은 그대로 두고 눌림(aria-pressed)으로 상태를 알린다.
// 실패는 스낵바로 알린다 [가정] — 별 하나라 그 자리에 문장을 둘 곳이 없다
export function InterestButton({
  issueId,
  interested,
  size = "large",
  issueTitle,
  className = "",
}: InterestButtonProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? addInterestIssue(issueId) : removeInterestIssue(issueId),
    onSuccess: (state) => {
      // 그사이 로그아웃했으면 손님 화면에 회원 상태를 다시 넣지 않는다
      if (queryClient.getQueryData(meQuery.queryKey) === null) return;
      // 이슈 머리 · 홈 추천 · 사이드바의 별을 응답대로 바꾸고 관심 이슈 목록(마이페이지 · 홈 추천 순서)을 새로 받게 한다
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

  function toggle() {
    // 보내는 동안 다시 누르면 요청이 엇갈린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    mutation.mutate(!interested);
  }

  const small = size === "small";
  const Icon = interested ? IconStarFill : IconStarLine;

  return (
    <button
      type="button"
      aria-pressed={interested}
      aria-label={issueTitle ? `${issueTitle} ${LABEL}` : LABEL}
      title={interested ? "관심 이슈에서 빼기" : LABEL}
      aria-busy={mutation.isPending || undefined}
      onClick={toggle}
      className={`flex shrink-0 items-center justify-center transition-[background-color,color,opacity] hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${
        small ? "size-x7 rounded-r1" : "size-x10 rounded-r2"
      } ${interested ? "text-fg-brand" : "text-fg-neutral-subtle"} ${
        // 저장하지 않은 작은 별은 줄(group/row)에 마우스를 올리거나 별에 포커스할 때만 (v21 .im-pin).
        // 손가락으로도 누를 수 있는 기기(터치 노트북 · 트랙패드 단 태블릿 포함)면 늘 보인다 — 숨은 별을 손가락이 잘못 누르지 않게
        small && !interested
          ? "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:focus-visible:opacity-100 any-pointer-coarse:opacity-100"
          : ""
      } ${className}`}
    >
      <Icon aria-hidden size={small ? 16 : 22} />
    </button>
  );
}
