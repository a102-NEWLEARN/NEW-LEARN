import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SnackbarProvider } from "seed-design/ui/snackbar";

type AppProvidersProps = {
  queryClient: QueryClient;
  children: ReactNode;
};

// 앱 전체를 감싸는 provider. main.tsx 와 테스트 도우미(src/test/render.tsx)가 같은 순서를 쓰게 한 곳에 둔다
export function AppProviders({ queryClient, children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 화면 어디서든 useSnackbar 로 알림을 띄운다 (src/components/useSnackbar.tsx) */}
      <SnackbarProvider>{children}</SnackbarProvider>
    </QueryClientProvider>
  );
}
