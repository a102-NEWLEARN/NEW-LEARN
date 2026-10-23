// 날짜 표기 — 보는 사람의 컴퓨터 시간대와 상관없이 한국 시간으로 적는다 (EXPERIENCE.md Voice and Tone 「날짜 · 숫자」)
const TIME_ZONE = "Asia/Seoul";

const monthDay = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
});

const longDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  month: "long",
  day: "numeric",
  weekday: "long",
});

const hour = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});

/** 「10.09」 — 사건 날짜. API 시각 문자열(ISO 8601)을 받는다 */
export function formatMonthDay(iso: string): string {
  const parts = monthDay.formatToParts(new Date(iso));
  const part = (type: "month" | "day") =>
    parts.find((item) => item.type === type)?.value;
  return `${part("month")}.${part("day")}`;
}

/** 「10월 23일 금요일」 — 홈 인사 줄의 오늘 날짜 */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

/** 한국 시간으로 몇 시인지 (0 ~ 23) */
export function kstHour(date: Date): number {
  return Number(hour.format(date));
}
