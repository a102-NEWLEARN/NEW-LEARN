import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { DictionaryWindow } from "@/components/shell/DictionaryWindow";
import { problem } from "@/mocks/handlers";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

// 용어사전 창 — F13 용어사전 (EXPERIENCE.md Component Patterns 「용어사전 창」, 프로토타입 v21 GlossaryChat).
// 가짜 A19 는 금리 · 사과(4개) · 구원^투수만 안다 (src/mocks/handlers.ts)

const openButton = () => screen.getByRole("button", { name: "용어 사전 열기" });
const dictionary = () => screen.getByRole("dialog", { name: "용어 사전" });
const input = () => screen.getByRole("textbox", { name: "용어 입력" });
const sendButton = () => screen.getByRole("button", { name: "보내기" });

function openWindow() {
  fireEvent.click(openButton());
}

function ask(word: string) {
  fireEvent.change(input(), { target: { value: word } });
  fireEvent.click(sendButton());
}

// 결과 말풍선의 뜻 목록. 보내고 나서 새로 생긴 것을 기다린다
const meanings = (word: string) =>
  screen.findByRole("list", { name: `'${word}'의 뜻` });

// 응답을 시험이 풀 때까지 잡아 둔다 — 「찾는 중」을 시간에 기대지 않고 본다
function holdDictionary() {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get("/api/v1/dictionary", async () => {
      await held;
      return HttpResponse.json({
        query: "금리",
        items: [{ word: "금리", pos: "명사", definition: "이자의 비율." }],
        source: "국립국어원 표준국어대사전",
      });
    }),
  );
  return release;
}

test("버튼을 누르면 창이 열리고 입력칸에 포커스가 간다. 접으면 버튼으로 포커스가 돌아온다", () => {
  renderWithProviders(<DictionaryWindow />);
  // 창을 여는 버튼이라고 알린다. 열려 있는 동안 버튼은 없어서 aria-expanded 는 두지 않는다
  expect(openButton().getAttribute("aria-haspopup")).toBe("dialog");
  expect(openButton().hasAttribute("aria-expanded")).toBe(false);

  openWindow();

  expect(dictionary()).toBeDefined();
  expect(document.activeElement).toBe(input());
  expect(
    within(dictionary()).getByText("모르는 용어를 입력하면 뜻을 알려드려요."),
  ).toBeDefined();
  // 창이 열린 동안 버튼은 창 뒤로 숨는다
  expect(screen.queryByRole("button", { name: "용어 사전 열기" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "용어 사전 접기" }));

  expect(screen.queryByRole("dialog", { name: "용어 사전" })).toBeNull();
  expect(document.activeElement).toBe(openButton());
});

test("단어를 보내면 내 말풍선 · 찾는 중 다음에 표제어 · 품사 · 뜻풀이와 출처를 보인다", async () => {
  const release = holdDictionary();
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("금리");

  expect(within(dictionary()).getByText("금리")).toBeDefined();
  expect(within(dictionary()).getByText("찾는 중")).toBeDefined();
  expect((input() as HTMLInputElement).value).toBe("");

  act(() => release());

  const list = await meanings("금리");
  const [item] = within(list).getAllByRole("listitem");
  expect(within(item).getByText("금리").tagName).toBe("STRONG");
  expect(within(item).getByText("명사")).toBeDefined();
  expect(within(item).getByText("이자의 비율.")).toBeDefined();
  expect(
    within(dictionary()).getByText("출처: 국립국어원 표준국어대사전"),
  ).toBeDefined();
  expect(within(dictionary()).queryByText("찾는 중")).toBeNull();
});

test("결과가 3개를 넘으면 3개만 보이고 더 보기로 나머지를 펼친다", async () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("사과");

  const list = await meanings("사과");
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  // 사전은 흔한 뜻을 뒤에 준다 — 「용서를 빎」은 4번째라 처음엔 안 보인다
  expect(
    within(list).queryByText("자기의 잘못을 인정하고 용서를 빎."),
  ).toBeNull();

  fireEvent.click(
    // 대답마다 같은 버튼이 생기니 이름에 그 말을 넣어 스크린리더가 가르게 한다. 보이는 글자는 「1개 더 보기」
    within(dictionary()).getByRole("button", { name: "'사과' 뜻 1개 더 보기" }),
  );

  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(
    within(items[3]).getByText("자기의 잘못을 인정하고 용서를 빎."),
  ).toBeDefined();
  // 펼친 버튼은 사라지고 포커스는 새로 보인 첫 뜻으로 간다
  expect(
    within(dictionary()).queryByRole("button", { name: /더 보기/ }),
  ).toBeNull();
  expect(document.activeElement).toBe(items[3]);
});

test("품사가 없으면 품사를 빼고, 표제어의 ^ 는 띄어 쓴다", async () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("구원투수");

  const [item] = within(await meanings("구원투수")).getAllByRole("listitem");
  expect(within(item).getByText("구원 투수")).toBeDefined();
  expect(item.textContent).not.toContain("^");
  expect(within(item).queryByText("명사")).toBeNull();
});

test("표제어 글자 사이의 - 는 지우고, 접사 · 어미를 뜻하는 맨 앞 · 맨 끝의 - 는 남긴다", async () => {
  // 사전은 낱말이 붙은 자리를 - 로 적는다(「이-자」, 2026-11-03 사이트에서 확인)
  server.use(
    http.get(PATH, () =>
      HttpResponse.json({
        query: "이자",
        items: [
          { word: "이-자", pos: "대명사", definition: "이 사람." },
          { word: "-자", pos: "접사", definition: "뒤에 붙는 말." },
          { word: "먹-", pos: "동사", definition: "어간." },
        ],
        source: "국립국어원 표준국어대사전",
      }),
    ),
  );
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("이자");

  const words = within(await meanings("이자"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("strong")?.textContent);
  expect(words).toEqual(["이자", "-자", "먹-"]);
});

test("결과가 없으면 그 말의 뜻을 찾지 못했다고 알린다", async () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("  없는말 ");

  expect(
    await within(dictionary()).findByText(
      "'없는말'의 뜻을 찾지 못했어요. 다른 표현으로 물어봐 주세요.",
    ),
  ).toBeDefined();
  expect(within(dictionary()).queryByText(/^출처/)).toBeNull();
});

const PATH = "/api/v1/dictionary";

test.each([
  [
    "사전 서버가 답하지 않으면(502)",
    () => problem(502, "DICTIONARY_UNAVAILABLE", "사전 오류", PATH),
    "지금은 찾을 수 없어요",
  ],
  [
    "입구가 막으면(429 RATE_LIMITED)",
    () => problem(429, "RATE_LIMITED", "상한", PATH),
    "요청이 많아요. 잠시 뒤 다시 시도해 주세요",
  ],
  [
    "코드 없는 429 도",
    () => new HttpResponse(null, { status: 429 }),
    "요청이 많아요. 잠시 뒤 다시 시도해 주세요",
  ],
  [
    "검색어를 받지 못하면(400) 서버가 준 까닭을",
    () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: "q",
          instance: PATH,
          code: "VALIDATION_FAILED",
          errors: [{ field: "q", reason: "찾을 단어는 50자까지예요" }],
        },
        { status: 400 },
      ),
    "찾을 단어는 50자까지예요",
  ],
  [
    "까닭 없는 400 은 일반 오류 안내를",
    () => problem(400, "VALIDATION_FAILED", "쿼리 인자를 읽지 못했다", PATH),
    "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  ],
  [
    "서버에 닿지 못하면 네트워크 안내를",
    () => HttpResponse.error(),
    "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  ],
])("%s 창 안에 알린다", async (_case, respond, message) => {
  let calls = 0;
  server.use(
    http.get(PATH, () => {
      calls += 1;
      return respond();
    }),
  );
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("금리");

  expect(await within(dictionary()).findByText(message)).toBeDefined();
  // 실패는 받아 두지 않는다 — 다시 보내면 A19 를 다시 부른다
  ask("금리");
  await waitFor(() =>
    expect(within(dictionary()).getAllByText(message)).toHaveLength(2),
  );
  expect(calls).toBe(2);
});

test("빈칸 · 공백만 있으면 보내기가 꺼지고, 입력은 50자까지 받는다", () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input(), { target: { value: "   " } });
  expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input(), { target: { value: "금리" } });
  expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
  expect((input() as HTMLInputElement).maxLength).toBe(50);
});

test("찾는 동안에는 보내지 않는다", async () => {
  const release = holdDictionary();
  renderWithProviders(<DictionaryWindow />);
  openWindow();
  ask("금리");

  fireEvent.change(input(), { target: { value: "사과" } });
  expect((sendButton() as HTMLButtonElement).disabled).toBe(true);

  act(() => release());
  await meanings("금리");
  expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
});

test("같은 단어를 다시 찾으면 받아 둔 결과를 쓴다", async () => {
  let calls = 0;
  server.use(
    http.get(PATH, () => {
      calls += 1;
      return HttpResponse.json({
        query: "금리",
        items: [{ word: "금리", pos: "명사", definition: "이자의 비율." }],
        source: "국립국어원 표준국어대사전",
      });
    }),
  );
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("금리");
  await meanings("금리");
  ask(" 금리");

  await waitFor(() =>
    expect(screen.getAllByRole("list", { name: "'금리'의 뜻" })).toHaveLength(
      2,
    ),
  );
  expect(calls).toBe(1);
});

test("결과 없음은 받아 두지 않아 다시 찾으면 A19 를 다시 부른다", async () => {
  // 서버도 결과 없음은 저장하지 않는다 — 틀린 키도 빈 본문이라 그 답을 굳히지 않으려고 (docs/api-screen.md A19)
  let calls = 0;
  server.use(
    http.get(PATH, () => {
      calls += 1;
      return HttpResponse.json({
        query: "없는말",
        items: [],
        source: "국립국어원 표준국어대사전",
      });
    }),
  );
  const notFound =
    "'없는말'의 뜻을 찾지 못했어요. 다른 표현으로 물어봐 주세요.";
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("없는말");
  await within(dictionary()).findByText(notFound);
  ask("없는말");

  await waitFor(() =>
    expect(within(dictionary()).getAllByText(notFound)).toHaveLength(2),
  );
  expect(calls).toBe(2);
});

test("창을 접었다 펴도 대화가 남는다", async () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();
  ask("금리");
  await meanings("금리");

  fireEvent.click(screen.getByRole("button", { name: "용어 사전 접기" }));
  openWindow();

  expect(
    within(dictionary()).getByRole("list", { name: "'금리'의 뜻" }),
  ).toBeDefined();
});

test("Esc 로 닫는다. 다른 창 안에서 누른 Esc 로는 닫지 않는다", () => {
  renderWithProviders(
    <>
      <DictionaryWindow />
      <div role="dialog" aria-label="다른 창">
        <button type="button">다른 창 단추</button>
      </div>
    </>,
  );
  openWindow();

  const other = screen.getByRole("button", { name: "다른 창 단추" });
  fireEvent.keyDown(other, { key: "Escape" });
  expect(dictionary()).toBeDefined();

  // 한글 조합 중 Esc 는 조합을 끝내는 키다
  fireEvent.keyDown(input(), { key: "Escape", isComposing: true });
  expect(dictionary()).toBeDefined();

  fireEvent.keyDown(input(), { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "용어 사전" })).toBeNull();
  expect(document.activeElement).toBe(openButton());
});

test("창 밖에 포커스가 있을 때 Esc 로 닫으면 포커스를 그 자리에 둔다", () => {
  renderWithProviders(
    <>
      <DictionaryWindow />
      <button type="button">본문 단추</button>
    </>,
  );
  openWindow();
  const outside = screen.getByRole("button", { name: "본문 단추" });
  act(() => outside.focus());

  fireEvent.keyDown(outside, { key: "Escape" });

  expect(screen.queryByRole("dialog", { name: "용어 사전" })).toBeNull();
  expect(document.activeElement).toBe(outside);
});

test("먼저 처리된 Esc(preventDefault)로는 닫지 않는다", () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();
  // TIP · 검색 목록이 캡처 단계에서 먼저 닫고 preventDefault 한 Esc
  const takeFirst = (key: KeyboardEvent) => key.preventDefault();
  window.addEventListener("keydown", takeFirst, true);

  fireEvent.keyDown(input(), { key: "Escape" });
  window.removeEventListener("keydown", takeFirst, true);

  expect(dictionary()).toBeDefined();
});

test("결과 · 실패 안내는 aria-live 영역 안에 뜬다", async () => {
  renderWithProviders(<DictionaryWindow />);
  openWindow();

  ask("금리");
  const list = await meanings("금리");
  ask("없는말");
  const notFound = await within(dictionary()).findByText(
    "'없는말'의 뜻을 찾지 못했어요. 다른 표현으로 물어봐 주세요.",
  );

  for (const element of [list, notFound])
    expect(element.closest("[aria-live]")?.getAttribute("aria-live")).toBe(
      "polite",
    );
});

test("오른쪽 패널 폭(inset)만큼 버튼과 창이 왼쪽으로 비킨다", () => {
  const { rerender } = renderWithProviders(<DictionaryWindow inset={420} />);

  expect(openButton().style.right).toBe("444px");
  openWindow();
  expect(dictionary().style.right).toBe("444px");

  rerender(<DictionaryWindow inset={0} />);
  expect(dictionary().style.right).toBe("24px");
});
