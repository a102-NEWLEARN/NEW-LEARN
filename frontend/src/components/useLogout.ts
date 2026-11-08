import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logout } from "@/api/auth";
import { meQuery } from "@/api/members";
import { errorDescription } from "@/components/state/ErrorState";
import { useSnackbar } from "@/components/useSnackbar";

/**
 * 로그아웃(A16) — 헤더 프로필 메뉴가 쓴다. 마이페이지 이름 줄에서 옮겼다 (2026-11-05, S15P31A102-182).
 * 로그아웃하면 손님이 처음 서는 랜딩으로 간다. 손님은 셸 안 화면에 남을 수 없다(RequireMember).
 * 세션이 이미 끊긴 401 도 로그아웃이다(logout). 실패하면 error 에 안내를 두고 지금 화면에 남는다
 */
export function useLogout({ onError }: { onError?: () => void } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      navigate("/", { replace: true });
      // 이전 회원이 받아 둔 응답을 모두 버린다 — 기사 · 이슈 응답의 bookmarked · interested 가 회원 기준이다.
      // 그다음 내 정보만 손님(null)으로 둔다. 순서를 바꾸면 null 도 지워져 랜딩이 A17 을 다시 부른다
      queryClient.removeQueries();
      queryClient.setQueryData(meQuery.queryKey, null);
      snackbar.show("로그아웃했어요", "positive");
    },
    onError,
  });

  return {
    /** 보낸다. 보내는 동안 다시 불러도 두 번 보내지 않는다 */
    run() {
      if (mutation.isPending) return;
      mutation.mutate();
    },
    pending: mutation.isPending,
    /** 실패 안내 문장. 다시 보내기 시작하면 지워진다 */
    error: mutation.isError ? errorDescription(mutation.error) : null,
  };
}
