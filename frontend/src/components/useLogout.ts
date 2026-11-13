import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logout } from "@/api/auth";
import { meQuery } from "@/api/members";
import { errorDescription } from "@/components/state/ErrorState";
import { useSnackbar } from "@/components/useSnackbar";

/** 로그아웃으로 떠나는 이동에 다는 표시 — 이미 세션이 끝났으니 「저장하지 않고 나갈까요?」로 막지 않는다(마이페이지 관심 분야) */
const LOGGING_OUT = { loggingOut: true } as const;

/** 이 이동이 로그아웃으로 떠나는 것인가 — 이동의 location.state 를 본다 */
export const isLogoutNavigation = (state: unknown) =>
  typeof state === "object" &&
  state !== null &&
  (state as { loggingOut?: unknown }).loggingOut === true;

/**
 * 로그아웃(A16) — 헤더 프로필 메뉴가 쓴다. 마이페이지 이름 줄에서 옮겼다 (2026-11-05, S15P31A102-182).
 * 로그아웃하면 랜딩으로 간다 — 손님도 셸 안 화면을 쓰지만 로그아웃은 서비스를 떠나는 동작으로 본다(EXPERIENCE.md 이동 규칙).
 * 셸의 세션 만료 감시(SessionExpiredRedirect)가 이것을 세션 만료로 보고 로그인 화면으로 보내지 않는 것은 removeQueries 덕이다 —
 * 라우터는 이동을 transition 으로 늦게 반영해서 내 정보를 비울 때 셸은 아직 떠 있다. 그런데 removeQueries 가 셸이 지켜보던 내 정보
 * 쿼리를 떼어 내고, 그 뒤 setQueryData 는 아무도 지켜보지 않는 새 쿼리에 null 을 넣어서 셸은 바뀜을 보지 못한다.
 * removeQueries 를 빼거나 순서를 바꾸면 로그아웃이 로그인 화면으로 샌다 — ProfileMenu.test 가 지킨다 (리뷰, Jira 205).
 * 세션이 이미 끊긴 401 도 로그아웃이다(logout). 실패하면 error 에 안내를 두고 지금 화면에 남는다
 */
export function useLogout({ onError }: { onError?: () => void } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      navigate("/", { replace: true, state: LOGGING_OUT });
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
