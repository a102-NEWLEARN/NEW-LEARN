import {
  IconMagnifyingglassLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { type IssueSummary, issuesQuery } from "@/api/issues";
import { type SearchResult, searchQuery } from "@/api/search";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";

// 비어 있을 때 보일 최근 업데이트된 이슈 수, 묶음마다 보일 결과 수 (프로토타입 v21)
const RECENT_COUNT = 5;
const LIMITS = { issues: 4, events: 4, articles: 5 };
// 글자를 칠 때마다 부르지 않고 잠깐 기다렸다가 A13 을 부른다
const SEARCH_DELAY = 200;

type Option = { key: string; title: string; sub?: string; href: string };
type Group = { label: string; options: Option[]; total: number };

// 0이면 그 항목을 뺀다 (EXPERIENCE.md Voice and Tone)
function issueSub(issue: IssueSummary) {
  return [
    ...issue.categories.map((category) => category.name),
    issue.eventCount > 0 && `사건 ${issue.eventCount}`,
    issue.articleCount > 0 && `기사 ${issue.articleCount}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function recentGroup(issues: IssueSummary[]): Group {
  return {
    label: "최근 업데이트된 이슈",
    total: issues.length,
    options: issues.map((issue) => ({
      key: `issue-${issue.id}`,
      title: issue.title,
      sub: issueSub(issue),
      href: `/issues/${issue.id}`,
    })),
  };
}

// 이슈는 이슈 화면, 사건은 그 이슈에서 사건을 고른 채, 기사는 기사 마인드맵 (EXPERIENCE.md 이동 규칙)
function searchGroups(result: SearchResult): Group[] {
  const groups: Group[] = [
    {
      label: "이슈",
      total: result.issues.length,
      options: result.issues.slice(0, LIMITS.issues).map((issue) => ({
        key: `issue-${issue.id}`,
        title: issue.title,
        href: `/issues/${issue.id}`,
      })),
    },
    {
      label: "사건",
      total: result.events.length,
      options: result.events.slice(0, LIMITS.events).map((event) => ({
        key: `event-${event.id}`,
        title: event.title,
        href: `/issues/${event.issueId}?event=${event.id}`,
      })),
    },
    {
      label: "기사",
      total: result.articles.length,
      options: result.articles.slice(0, LIMITS.articles).map((article) => ({
        key: `article-${article.id}`,
        title: article.title,
        href: `/articles/${article.id}`,
      })),
    },
  ];
  return groups.filter((group) => group.options.length > 0);
}

// 제목에서 검색어와 맞는 첫 부분을 청록 굵게 (프로토타입 v21)
function highlight(title: string, word: string): ReactNode {
  const at = word ? title.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (at < 0) return title;
  return (
    <>
      {title.slice(0, at)}
      <mark className="bg-transparent font-bold text-fg-brand">
        {title.slice(at, at + word.length)}
      </mark>
      {title.slice(at + word.length)}
    </>
  );
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type SearchBoxProps = {
  /** 값이 바뀔 때마다 입력 칸에 포커스하고 목록을 연다 — ⌘/Ctrl+K · 빠른 이동 (AppShell) */
  focusRequest?: unknown;
};

// 홈 검색창 — 통합 검색 (EXPERIENCE.md IA 통합 검색 행, 프로토타입 v21).
// 비어 있으면 최근 업데이트된 이슈(A2), 글자를 치면 A13 결과를 이슈 · 사건 · 기사로 나눠 아래에 펼친다.
// 포커스는 입력 칸에 둔 채 ↑↓ 로 고른 줄만 바꾼다(combobox · aria-activedescendant)
export function SearchBox({ focusRequest }: SearchBoxProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Enter 를 누르고 결과를 기다리는 검색어. 목록을 닫으면 지운다 — 그 사이에 Esc 를 누르거나
  // 검색창 밖으로 나가면(바깥 누르기 · Tab · 창 바꾸기) 이동을 취소한다. Tab 으로 ✕ 에 가는 것은 안이라 그대로다
  const waiting = useRef<string | null>(null);
  const word = text.trim();
  const searched = useDebounced(word, SEARCH_DELAY);

  const recent = useQuery({
    ...issuesQuery({ size: RECENT_COUNT }),
    enabled: open,
  });
  const results = useQuery({
    ...searchQuery(searched),
    enabled: open && searched !== "",
    // 검색어를 고치는 동안 앞 결과를 두어 목록이 깜빡이지 않게
    placeholderData: keepPreviousData,
  });

  // 보이는 결과가 지금 친 검색어의 것인가. 200ms 기다림과 응답 사이에는 앞 검색어의 결과가 남아 있는데,
  // 그때는 줄을 고를 수 없게 하고 강조도 칠하지 않는다
  const current =
    word === "" ||
    (searched === word &&
      results.data !== undefined &&
      !results.isPlaceholderData);

  let groups: Group[] = [];
  let message: ReactNode = null;
  if (word === "") {
    if (recent.data) groups = [recentGroup(recent.data.items)];
    else if (recent.isError)
      message = (
        <ErrorState
          title="최근 이슈를 불러오지 못했어요"
          error={recent.error}
          onRetry={() => void recent.refetch()}
        />
      );
    else message = <RowsSkeleton label="최근 이슈 불러오는 중" />;
  } else if (results.data) {
    groups = searchGroups(results.data);
    if (groups.length === 0)
      message = current ? (
        <p
          role="status"
          className="t4-regular px-x4 pt-x3 pb-x4 text-fg-neutral-muted"
        >
          {`'${searched}'에 맞는 이슈·사건·기사가 없어요`}
        </p>
      ) : (
        <RowsSkeleton label="검색하는 중" />
      );
  } else if (results.isError) {
    message = (
      <ErrorState
        title="검색 결과를 불러오지 못했어요"
        error={results.error}
        onRetry={() => void results.refetch()}
      />
    );
  } else {
    message = <RowsSkeleton label="검색하는 중" />;
  }

  const options = groups.flatMap((group) => group.options);
  // 줄마다 목록 전체에서 몇 번째인지 — ↑↓ 와 aria-activedescendant 가 쓴다
  const numbered = groups.map((group, groupIndex) => ({
    ...group,
    labelId: `${listId}-group-${groupIndex}`,
    countId: `${listId}-count-${groupIndex}`,
    options: group.options.map((option) => ({
      ...option,
      at: options.indexOf(option),
    })),
  }));
  const activeIndex = current ? Math.min(active, options.length - 1) : -1;
  // 줄 id 는 순번이 아니라 그 줄의 이슈 · 사건 · 기사로 짓는다. 결과가 바뀌면 id 도 바뀌어야
  // aria-activedescendant 가 바뀌고 스크린 리더가 새로 골라진 줄을 읽는다
  const optionId = (option: Option) => `${listId}-${option.key}`;
  const activeOption =
    open && activeIndex >= 0 ? options[activeIndex] : undefined;
  const activeId = activeOption ? optionId(activeOption) : undefined;

  // 셸이 포커스를 부탁하면 목록을 열고(그리는 중에 새 부탁을 알아챈다) 입력 칸에 포커스한다.
  // 이미 포커스가 있으면 onFocus 가 안 불려서 여는 일을 따로 한다
  const [seenRequest, setSeenRequest] = useState<unknown>(undefined);
  if (focusRequest !== seenRequest) {
    setSeenRequest(focusRequest);
    if (focusRequest) setOpen(true);
  }
  useEffect(() => {
    if (focusRequest) inputRef.current?.focus();
  }, [focusRequest]);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      waiting.current = null;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // ↑↓ 로 고른 줄이 목록 밖이면 보이게 스크롤한다
  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({
        block: "nearest",
      });
  }, [activeId]);

  const close = () => {
    waiting.current = null;
    setOpen(false);
  };

  const pick = (option: Option) => {
    close();
    setText("");
    inputRef.current?.blur();
    navigate(option.href);
  };

  // 앞 검색어의 결과가 보이는 동안 Enter 를 누르면 지금 검색어의 결과를 받아 맨 앞 줄을 연다.
  // 받는 사이에 검색어를 고쳤거나 목록을 닫았으면 열지 않는다. 실패 안내는 목록이 보여 준다.
  // Enter 를 누른 채로 두거나 한글 입력기가 keydown 을 두 번 보내도 한 번만 연다 — 두 번 열면 같은 주소가 기록에 두 번 쌓인다
  const openFirst = (asked: string) => {
    waiting.current = asked;
    queryClient.fetchQuery(searchQuery(asked)).then(
      (result) => {
        if (waiting.current !== asked) return;
        waiting.current = null;
        if (inputRef.current?.value.trim() !== asked) return;
        const first = searchGroups(result)[0]?.options[0];
        if (first) pick(first);
      },
      () => {
        if (waiting.current === asked) waiting.current = null;
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (current)
        setActive(Math.max(0, Math.min(options.length - 1, activeIndex + 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (current) setActive(Math.max(0, activeIndex - 1));
    } else if (event.key === "Enter" && open) {
      // 한글 조합 중에 누른 Enter 도 받는다 — 칸에는 이미 그 글자가 들어 있다
      if (current && options[activeIndex]) {
        event.preventDefault();
        pick(options[activeIndex]);
      } else if (!current && word !== "") {
        event.preventDefault();
        openFirst(word);
      }
    } else if (event.key === "Escape" && open) {
      // 맨 위에 열린 것 하나만 닫는다 (EXPERIENCE.md Interaction Primitives)
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      ref={wrapRef}
      // Tab 으로 검색창 밖으로 나가면 닫는다. 검색어 지우기 버튼은 안이다
      onBlur={(event) => {
        if (!wrapRef.current?.contains(event.relatedTarget as Node)) close();
      }}
      className="relative mx-auto mt-x7 w-full max-w-[680px] text-left"
    >
      {/* 지우기 버튼은 label 안에 둘 수 없어서(label 안의 다른 입력 요소) 테두리를 바깥 상자가 그린다 */}
      <div className="flex h-[58px] items-center rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default pr-x2 transition-colors hover:border-palette-gray-500 focus-within:outline-2 focus-within:outline-stroke-focus-ring">
        <label className="flex h-full min-w-0 flex-1 cursor-text items-center gap-x3 pl-x5">
          <IconMagnifyingglassLine
            aria-hidden
            size={20}
            className="shrink-0 text-fg-neutral-muted"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="이슈, 사건, 기사 검색"
            placeholder="이슈, 사건, 기사 검색"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            enterKeyHint="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="t6-regular h-full min-w-0 flex-1 bg-transparent text-fg-neutral outline-none placeholder:text-fg-placeholder"
          />
        </label>
        {text && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setText("");
              setActive(0);
              inputRef.current?.focus();
            }}
            className="flex size-x10 shrink-0 items-center justify-center rounded-r2 text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
          >
            <IconXmarkLine aria-hidden size={16} />
          </button>
        )}
      </div>
      {open && (
        // 화면 위에 뜨는 요소라 그림자를 쓴다 (DESIGN.md Elevation & Depth).
        // 목록 안 어디를 눌러도(묶음 이름 · 안내 · 다시 시도) 입력 칸이 포커스를 잃지 않게 한다 —
        // 잃으면 목록이 닫히고 ↑↓ · Enter 가 듣지 않는다
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-r3 border border-stroke-neutral-weak bg-bg-layer-floating shadow-s3"
        >
          <div className="max-h-[420px] overflow-y-auto pt-x1_5">
            <div
              role="listbox"
              id={listId}
              aria-label={word === "" ? "최근 업데이트된 이슈" : "검색 결과"}
              aria-busy={!current}
              className={current ? undefined : "opacity-60"}
            >
              {numbered.map((group) => (
                <div
                  key={group.label}
                  role="group"
                  aria-labelledby={
                    group.total > group.options.length
                      ? `${group.labelId} ${group.countId}`
                      : group.labelId
                  }
                  className="pb-x1_5"
                >
                  <div className="t2-bold flex items-center justify-between px-x4 pt-x1_5 pb-x1 text-fg-neutral-muted">
                    <span id={group.labelId}>{group.label}</span>
                    {group.total > group.options.length && (
                      <span id={group.countId} className="font-medium">
                        {group.options.length} / {group.total}개
                      </span>
                    )}
                  </div>
                  {group.options.map(({ at, ...option }) => {
                    const selected = at === activeIndex;
                    return (
                      <div
                        key={option.key}
                        id={optionId(option)}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(at)}
                        onClick={() => pick(option)}
                        className={`flex cursor-pointer flex-col gap-x0_5 px-x4 py-x2 transition-colors ${selected ? "bg-bg-layer-default-pressed" : ""}`}
                      >
                        <span className="truncate text-[0.875rem] leading-[1.25rem] font-medium text-fg-neutral">
                          {highlight(option.title, current ? searched : "")}
                        </span>
                        {option.sub && (
                          <span className="t2-regular truncate text-fg-neutral-muted">
                            {option.sub}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {message}
          </div>
          <p className="t2-regular border-t border-stroke-neutral-subtle px-x4 py-x2 text-fg-neutral-subtle">
            ↑↓ 이동 · Enter 열기 · Esc 닫기
          </p>
        </div>
      )}
    </div>
  );
}

// 결과 줄 자리
function RowsSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="flex flex-col gap-x2 px-x4 pt-x1_5 pb-x3">
        {Array.from({ length: 3 }, (_, at) => (
          <Skeleton key={at} radius="8" width="full" height="lineHeight.t4" />
        ))}
      </div>
    </LoadingState>
  );
}
