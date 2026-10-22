import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";

type Options = Omit<RenderOptions, "wrapper"> & {
  /** 처음 열 주소. 기본은 "/" */
  route?: string;
};

// 화면 테스트용 render — 테스트마다 새 QueryClient(실패해도 다시 부르지 않음)와 주소를 가진 라우터로 감싼다
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", ...options }: Options = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
      ...options,
    }),
  };
}
