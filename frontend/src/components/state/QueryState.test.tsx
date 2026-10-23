import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { categoriesQuery } from "@/api/categories";
import { QueryState } from "@/components/state/QueryState";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

// 화면의 한 영역처럼 A1 카테고리를 QueryState 로 그린다
function Categories() {
  const categories = useQuery(categoriesQuery);

  return (
    <QueryState
      query={categories}
      loadingLabel="카테고리 불러오는 중"
      skeleton={<div />}
      errorTitle="카테고리를 불러오지 못했어요"
      empty={{
        when: (data) => data.length === 0,
        message: "카테고리가 아직 없어요",
      }}
    >
      {(data) => <p>{data.map((category) => category.name).join(" · ")}</p>}
    </QueryState>
  );
}

const names = "정치 · 사회 · 경제 · 국제 · IT·과학";

const internalError = () =>
  HttpResponse.json(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "DB 연결 실패: pool exhausted",
      instance: "/api/v1/categories",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );

test("응답 전에는 불러오는 중을 알리고, 응답이 오면 내용을 보여 준다", async () => {
  renderWithProviders(<Categories />);

  expect(
    screen.getByRole("status", { name: "카테고리 불러오는 중" }),
  ).toBeDefined();
  expect(await screen.findByText(names)).toBeDefined();
  expect(
    screen.queryByRole("status", { name: "카테고리 불러오는 중" }),
  ).toBeNull();
});

test("빈 목록이면 빈 결과 문구를 보여 준다", async () => {
  server.use(
    http.get("/api/v1/categories", () => HttpResponse.json({ items: [] })),
  );
  renderWithProviders(<Categories />);

  expect(await screen.findByText("카테고리가 아직 없어요")).toBeDefined();
});

test("서버 오류면 제목 · 일반 안내 · 다시 시도를 보여 주고 서버 설명은 숨긴다", async () => {
  server.use(http.get("/api/v1/categories", internalError));
  renderWithProviders(<Categories />);

  expect(await screen.findByText("카테고리를 불러오지 못했어요")).toBeDefined();
  expect(
    screen.getByText(
      "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
    ),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeDefined();
  expect(screen.queryByText(/pool exhausted/)).toBeNull();
  expect(screen.queryByText(/INTERNAL_ERROR/)).toBeNull();
});

test("서버에 닿지 못하면 네트워크 안내를 보여 준다", async () => {
  server.use(http.get("/api/v1/categories", () => HttpResponse.error()));
  renderWithProviders(<Categories />);

  expect(
    await screen.findByText("네트워크 상태를 확인한 뒤 다시 시도해 주세요."),
  ).toBeDefined();
});

test("다시 시도를 누르면 다시 불러와 내용을 보여 준다", async () => {
  // 다시 부른 요청은 테스트가 풀어 줄 때까지 붙잡는다. 응답이 빠른 환경(CI 의 Node 26)에서도
  // 불러오는 중이 그려지기 전에 지나가 버리지 않게 한다. 아무것도 돌려주지 않으면 다음 핸들러(가짜 A1)가 답한다
  let respond!: () => void;
  const held = new Promise<void>((resolve) => (respond = resolve));
  server.use(
    http.get("/api/v1/categories", async () => {
      await held;
    }),
  );
  // 나중에 넣은 핸들러가 먼저 받는다 — 첫 요청은 500, 다시 부른 요청은 위에서 붙잡힌다
  server.use(http.get("/api/v1/categories", internalError, { once: true }));
  renderWithProviders(<Categories />);

  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

  // 데이터 없이 실패한 쿼리를 다시 부르면 다시 불러오는 중이 된다
  expect(
    await screen.findByRole("status", { name: "카테고리 불러오는 중" }),
  ).toBeDefined();
  respond();
  expect(await screen.findByText(names)).toBeDefined();
});
