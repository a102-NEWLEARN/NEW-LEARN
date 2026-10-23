import { expect, test } from "vitest";
import { formatLongDate, formatMonthDay, kstHour } from "@/lib/date";

// 날짜는 늘 한국 시간으로 적는다. CI 는 UTC 로 돌아서 그 차이를 함께 본다

test("「10.09」 꼴로 적는다", () => {
  expect(formatMonthDay("2026-10-09T08:41:00+09:00")).toBe("10.09");
  expect(formatMonthDay("2026-03-04T09:00:00+09:00")).toBe("03.04");
});

test("UTC 로는 전날이어도 한국 날짜로 적는다", () => {
  // UTC 10월 9일 23:30 = 한국 10월 10일 08:30
  expect(formatMonthDay("2026-10-09T23:30:00Z")).toBe("10.10");
});

test("오늘 날짜를 「10월 23일 금요일」 꼴로 적는다", () => {
  // UTC 10월 22일 16:00 = 한국 10월 23일 01:00
  expect(formatLongDate(new Date("2026-10-22T16:00:00Z"))).toBe(
    "10월 23일 금요일",
  );
});

test("한국 시간으로 몇 시인지 0 ~ 23 으로 준다", () => {
  expect(kstHour(new Date("2026-10-23T01:00:00Z"))).toBe(10);
  expect(kstHour(new Date("2026-10-23T15:00:00Z"))).toBe(0);
  expect(kstHour(new Date("2026-10-23T14:59:00Z"))).toBe(23);
});
