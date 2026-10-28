import { expect, test } from "vitest";
import {
  formatEventDate,
  formatLongDate,
  formatPeriod,
  formatTimelineDates,
  kstHour,
  kstYear,
} from "@/lib/date";

// 날짜는 늘 한국 시간으로 적는다. CI 는 UTC 로 돌아서 그 차이를 함께 본다

const NOW = new Date("2026-10-23T09:00:00+09:00");

test("올해 사건은 「10.09」 꼴로 적는다", () => {
  expect(formatEventDate("2026-10-09T08:41:00+09:00", NOW)).toBe("10.09");
  expect(formatEventDate("2026-03-04T09:00:00+09:00", NOW)).toBe("03.04");
});

test("올해가 아닌 사건은 「2025.12.01」 꼴로 연도를 붙인다", () => {
  expect(formatEventDate("2025-12-01T10:00:00+09:00", NOW)).toBe("2025.12.01");
});

test("UTC 로는 전날이어도 한국 날짜로 적는다", () => {
  // UTC 10월 9일 23:30 = 한국 10월 10일 08:30
  expect(formatEventDate("2026-10-09T23:30:00Z", NOW)).toBe("10.10");
});

test("올해인지도 한국 날짜로 가린다", () => {
  // 한국 2027년 1월 1일 01:00 (UTC 로는 아직 2026년 12월 31일)
  const newYear = new Date("2027-01-01T01:00:00+09:00");
  expect(formatEventDate("2026-12-31T23:00:00+09:00", newYear)).toBe(
    "2026.12.31",
  );
  // UTC 12월 31일 15:30 = 한국 1월 1일 00:30 — 올해다
  expect(formatEventDate("2026-12-31T15:30:00Z", newYear)).toBe("01.01");
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

test("한국 날짜로 몇 년인지 준다", () => {
  // UTC 2025년 12월 31일 15:30 = 한국 2026년 1월 1일
  expect(kstYear("2025-12-31T15:30:00Z")).toBe(2026);
});

test("이슈 기간은 「2026.08.04 ~ 10.09」, 해가 다르면 끝에도 연도를 붙인다", () => {
  expect(
    formatPeriod("2026-08-04T00:00:00+09:00", "2026-10-09T08:41:00+09:00"),
  ).toBe("2026.08.04 ~ 10.09");
  expect(
    formatPeriod("2025-12-01T09:00:00+09:00", "2026-10-23T08:00:00+09:00"),
  ).toBe("2025.12.01 ~ 2026.10.23");
});

test("이슈 기간이 하루면 그 날짜 하나만 적는다", () => {
  expect(
    formatPeriod("2026-08-04T00:00:00+09:00", "2026-08-04T18:00:00+09:00"),
  ).toBe("2026.08.04");
});

test("타임라인 날짜는 「MM.DD」, 앞 사건과 해가 바뀌는 사건에만 연도를 붙인다", () => {
  expect(
    formatTimelineDates(
      [
        "2025-11-12T09:00:00+09:00",
        "2025-12-30T09:00:00+09:00",
        "2026-01-04T09:00:00+09:00",
        "2026-02-03T10:00:00+09:00",
      ],
      NOW,
    ),
  ).toEqual(["2025.11.12", "12.30", "2026.01.04", "02.03"]);
});

test("타임라인 맨 앞 사건은 올해면 연도 없이 적는다", () => {
  expect(
    formatTimelineDates(
      ["2026-08-04T00:00:00+09:00", "2026-08-21T00:00:00+09:00"],
      NOW,
    ),
  ).toEqual(["08.04", "08.21"]);
});
