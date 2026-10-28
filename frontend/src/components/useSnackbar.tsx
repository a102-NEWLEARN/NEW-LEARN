import { useCallback, useMemo } from "react";
import { Snackbar, useSnackbarAdapter } from "seed-design/ui/snackbar";

// 문구 · 시간 — EXPERIENCE.md Component Patterns 「스낵바」 · 「곧 제공 항목」
const COMING_SOON_MESSAGE = "MVP 이후 제공 예정인 기능이에요";
const SNACKBAR_TIMEOUT = 2400;

// SEED 의 오류 모양(critical)은 받지 않는다. 오류는 스낵바가 아니라 실패한 영역 자리에 둔다
type SnackbarVariant = "default" | "positive";

// 짧은 알림 한 줄을 띄운다. 오류는 스낵바로 알리지 않고 실패한 영역 자리에 둔다.
// SnackbarProvider(seed-design/ui/snackbar) 안에서만 쓸 수 있다 — main.tsx 가 앱 전체를 감싼다
export function useSnackbar() {
  const adapter = useSnackbarAdapter();

  return useMemo(
    () => ({
      show(message: string, variant?: SnackbarVariant) {
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

// 준비 중 분야(스포츠 · 문화/연예)를 눌렀을 때. 이것도 비활성으로 두지 않고 누르면 안내한다
// (EXPERIENCE.md State Patterns). 사이드바 이슈 탐색 · 분야 탭이 쓴다
export function useUpcomingCategory() {
  const snackbar = useSnackbar();

  return useCallback(
    (name: string) => snackbar.show(`${name}는 준비 중이에요`),
    [snackbar],
  );
}
