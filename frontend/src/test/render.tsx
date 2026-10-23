import { QueryClient } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { AppProviders } from "@/providers";
import { routes } from "@/routes";

type Options = Omit<RenderOptions, "wrapper"> & {
  /** 처음 열 주소. 기본은 "/" */
  route?: string;
};

// 테스트마다 새 QueryClient. 실패해도 다시 부르지 않는다
function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// 화면 테스트용 render — 앱과 같은 provider(src/providers.tsx)와 주소를 가진 라우터로 감싼다
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", ...options }: Options = {},
) {
  const queryClient = createTestQueryClient();

  return {
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => (
        <AppProviders queryClient={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </AppProviders>
      ),
      ...options,
    }),
  };
}

// 라우트 테스트용 render — 앱과 같은 provider 와 라우트 목록(src/routes.tsx)으로 path 를 연다
export function renderRoute(path: string) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    queryClient,
    ...render(
      <AppProviders queryClient={queryClient}>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
  };
}
