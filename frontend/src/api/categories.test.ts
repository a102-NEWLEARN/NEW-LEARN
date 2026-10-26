import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { fetchCategories } from "@/api/categories";
import { server } from "@/mocks/node";

test("A1 카테고리를 가짜 API 에서 받는다", async () => {
  const categories = await fetchCategories();

  expect(categories.map((category) => category.name)).toEqual([
    "정치",
    "사회",
    "경제",
    "국제",
    "IT·과학",
  ]);
});

test("오류 응답은 ApiError 의 status · code 로 받는다", async () => {
  server.use(
    http.get("/api/v1/categories", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
          detail: "서버 오류",
          instance: "/api/v1/categories",
          code: "INTERNAL_ERROR",
        },
        { status: 500 },
      ),
    ),
  );

  await expect(fetchCategories()).rejects.toMatchObject({
    status: 500,
    code: "INTERNAL_ERROR",
  });
});
