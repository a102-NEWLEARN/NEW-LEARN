import {
  IconChevronLeftLine,
  IconChevronRightLine,
} from "@karrotmarket/react-monochrome-icon";

type PaginationProps = {
  /** 화면 읽기 이름 — 「이슈 쪽」처럼 무엇의 쪽인지 */
  label: string;
  /** 지금 쪽, 0 부터 */
  page: number;
  totalPages: number;
  /** 고른 쪽, 0 부터 */
  onChange: (page: number) => void;
};

// 한 번에 보이는 쪽 번호 칸 수 — 393px 폰에서도 이전 · 다음과 한 줄에 들어간다
const SLOTS = 7;

/**
 * 보일 쪽 번호(0 부터)와 줄임(「gap」). 처음 · 끝 쪽은 늘 두고, 지금 쪽 앞뒤 하나씩을 둔다.
 * 처음이나 끝에 가까우면 그쪽으로 다섯 칸을 채워 칸 수가 바뀌지 않게 한다
 */
export function pageItems(page: number, totalPages: number) {
  if (totalPages <= SLOTS)
    return Array.from({ length: totalPages }, (_, at) => at);
  const last = totalPages - 1;
  const edge = SLOTS - 2;
  if (page < edge - 1)
    return [...Array.from({ length: edge }, (_, at) => at), "gap", last];
  if (page > last - edge + 1)
    return [
      0,
      "gap",
      ...Array.from({ length: edge }, (_, at) => last - edge + 1 + at),
    ];
  return [0, "gap", page - 1, page, page + 1, "gap", last];
}

const CELL =
  "t4-medium flex h-[36px] min-w-[36px] items-center justify-center rounded-r2 px-x1_5 tabular-nums transition-colors duration-[var(--seed-duration-color-transition)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring";

// 쪽 번호 — ‹ 1 2 3 … 9 › (2026-11-13 사용자, Jira 203). 홈 최신 기사 · 분야별 이슈가 같이 쓴다.
// 지금 쪽은 청록 바탕(aria-current="page"), 첫 쪽 · 마지막 쪽에서는 이전 · 다음을 끈다. 한 쪽뿐이면 그리지 않는다
export function Pagination({
  label,
  page,
  totalPages,
  onChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const go = (next: number) => {
    if (next !== page && next >= 0 && next < totalPages) onChange(next);
  };
  const arrow = `${CELL} text-fg-neutral hover:bg-bg-neutral-weak disabled:text-fg-disabled disabled:hover:bg-transparent`;

  return (
    <nav aria-label={label} className="flex items-center justify-center gap-x1">
      <button
        type="button"
        aria-label="이전 쪽"
        disabled={page === 0}
        onClick={() => go(page - 1)}
        className={arrow}
      >
        <IconChevronLeftLine aria-hidden size={16} />
      </button>
      {pageItems(page, totalPages).map((item, at) =>
        item === "gap" ? (
          <span
            // 줄임은 많아야 둘이라 자리로 구분한다
            key={`gap-${at}`}
            aria-hidden
            className="t4-medium flex h-[36px] w-[20px] items-center justify-center text-fg-neutral-subtle"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`${Number(item) + 1}쪽`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => go(Number(item))}
            className={`${CELL} ${
              item === page
                ? "t4-bold bg-bg-brand-solid text-palette-static-white"
                : "text-fg-neutral-muted hover:bg-bg-neutral-weak hover:text-fg-neutral"
            }`}
          >
            {Number(item) + 1}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="다음 쪽"
        disabled={page === totalPages - 1}
        onClick={() => go(page + 1)}
        className={arrow}
      >
        <IconChevronRightLine aria-hidden size={16} />
      </button>
    </nav>
  );
}
