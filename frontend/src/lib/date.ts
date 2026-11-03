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

/** 「2026.10.06」 — 사건 발생 날짜처럼 연도까지 적는 날짜 */
export function formatFullDate(iso: string): string {
  const { year, month, day } = kstParts(new Date(iso));
  return `${year}.${month}.${day}`;
}

const hourMinute = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 「2026.10.06 14:30」 — 기사 헤더의 발행 일시. 한국 시각 00:00 이면 시각 없이 날짜만 온 기사로 보고 날짜만 적는다
 * (프로토타입 v21 fmtDateTime)
 */
export function formatFullDateTime(iso: string): string {
  const time = hourMinute.format(new Date(iso));
  const date = formatFullDate(iso);
  return time === "00:00" ? date : `${date} ${time}`;
}

// 한국 날짜의 날 수 — 오늘 · 어제를 가를 때 쓴다
function kstDayNumber(date: Date) {
  const { year, month, day } = kstParts(date);
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000;
}

/**
 * 기사 날짜 — 오늘은 「방금 전」 · 「N분 전」 · 「N시간 전」, 어제는 「1일 전」, 그 밖은 「10월 14일」,
 * 올해가 아니면 「2025년 10월 14일」. 오늘 · 어제 · 올해는 한국 날짜로 가린다 (EXPERIENCE.md 날짜 표 「기사 날짜」)
 */
export function formatArticleDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  const days = kstDayNumber(now) - kstDayNumber(date);
  if (days <= 0) {
    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    return `${Math.floor(minutes / 60)}시간 전`;
  }
  if (days === 1) return "1일 전";
  const { year, month, day } = kstParts(date);
  const monthDay = `${Number(month)}월 ${Number(day)}일`;
  return year === kstParts(now).year ? monthDay : `${year}년 ${monthDay}`;
}
