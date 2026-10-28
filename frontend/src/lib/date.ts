// 날짜 표기 — 보는 사람의 컴퓨터 시간대와 상관없이 한국 시간으로 적는다 (EXPERIENCE.md Voice and Tone 「날짜 · 숫자」)
const TIME_ZONE = "Asia/Seoul";

const yearMonthDay = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
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

function kstParts(date: Date) {
  const parts = yearMonthDay.formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value;
  return { year: part("year"), month: part("month"), day: part("day") };
}

/**
 * 사건 날짜 — 올해면 「10.09」, 올해가 아니면 「2025.12.01」. API 시각 문자열(ISO 8601)을 받는다.
 * 올해인지는 한국 날짜로 가린다 (이슈 카드 최근 사건, 2026-10-23 사용자 결정)
 */
export function formatEventDate(iso: string, now = new Date()): string {
  const { year, month, day } = kstParts(new Date(iso));
  const monthDay = `${month}.${day}`;
  return year === kstParts(now).year ? monthDay : `${year}.${monthDay}`;
}

/** 「10월 23일 금요일」 — 홈 인사 줄의 오늘 날짜 */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

/** 한국 시간으로 몇 시인지 (0 ~ 23) */
export function kstHour(date: Date): number {
  return Number(hour.format(date));
}

/** 한국 날짜로 몇 년인지. API 시각 문자열을 받는다 */
export function kstYear(iso: string): number {
  return Number(kstParts(new Date(iso)).year);
}

/**
 * 이슈 기간 — 「2026.08.04 ~ 10.09」. 해가 다르면 끝에도 연도, 같은 날이면 날짜 하나
 * (EXPERIENCE.md 날짜 표 「이슈 기간」)
 */
export function formatPeriod(firstIso: string, lastIso: string): string {
  const first = kstParts(new Date(firstIso));
  const last = kstParts(new Date(lastIso));
  const start = `${first.year}.${first.month}.${first.day}`;
  if (first.year !== last.year)
    return `${start} ~ ${last.year}.${last.month}.${last.day}`;
  if (first.month === last.month && first.day === last.day) return start;
  return `${start} ~ ${last.month}.${last.day}`;
}

/**
 * 타임라인 사건 날짜 — 「MM.DD」. 앞 사건과 해가 바뀌는 사건에만 「2026.01.04」처럼 연도를 붙인다.
 * 맨 앞 사건은 올해가 아니면 붙인다 (EXPERIENCE.md 날짜 표 「타임라인 사건 날짜」)
 */
export function formatTimelineDates(
  isoList: string[],
  now = new Date(),
): string[] {
  let previousYear = kstParts(now).year;
  return isoList.map((iso) => {
    const { year, month, day } = kstParts(new Date(iso));
    const label =
      year === previousYear ? `${month}.${day}` : `${year}.${month}.${day}`;
    previousYear = year;
    return label;
  });
}
