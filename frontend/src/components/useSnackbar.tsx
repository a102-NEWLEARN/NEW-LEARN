import { useCallback, useMemo } from "react";
import {
  Snackbar,
  type SnackbarProps,
  useSnackbarAdapter,
} from "seed-design/ui/snackbar";

// 문구 · 시간 — EXPERIENCE.md Component Patterns 「스낵바」 · 「곧 제공 항목」
const COMING_SOON_MESSAGE = "MVP 이후 제공 예정인 기능이에요";
const SNACKBAR_TIMEOUT = 2400;

// 짧은 알림 한 줄을 띄운다. 오류는 스낵바로 알리지 않고 실패한 영역 자리에 둔다.
// SnackbarProvider(seed-design/ui/snackbar) 안에서만 쓸 수 있다 — main.tsx 가 앱 전체를 감싼다
export function useSnackbar() {
  const adapter = useSnackbarAdapter();

  return useMemo(
    () => ({
      show(message: string, variant?: SnackbarProps["variant"]) {
        adapter.create({
          timeout: SNACKBAR_TIMEOUT,
          render: () => <Snackbar message={message} variant={variant} />,
        });
      },
    }),
    [adapter],
  );
}

// 곧 제공 항목(P2 · 미정 기능 자리)의 onClick. 비활성으로 두지 않고 누르면 안내한다.
// 헤더 · 사이드바 · 이슈 헤더마다 모양이 달라 버튼은 쓰는 곳이 만든다
export function useComingSoon() {
  const snackbar = useSnackbar();

  return useCallback(() => snackbar.show(COMING_SOON_MESSAGE), [snackbar]);
}
