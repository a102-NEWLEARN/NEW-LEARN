import {
  IconCheckmarkLine,
  IconExclamationmarkCircleFill,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { Skeleton } from "@seed-design/react";
import { useQuery } from "@tanstack/react-query";
import { type Ref, useId } from "react";
import { categoriesQuery, UPCOMING_CATEGORIES } from "@/api/categories";
import { QueryState } from "@/components/state/QueryState";
import { useUpcomingCategory } from "@/components/useSnackbar";

type InterestChipsProps = {
  /** 고른 분야 코드 */
  value: string[];
  onValueChange: (codes: string[]) => void;
  /** 마지막 남은 칩을 풀려고 했다 — 부모가 「관심 분야를 1개 이상 골라 주세요.」를 띄운다 */
  onKeepOne: () => void;
  /** 칩 묶음 아래에 띄울 오류 */
  error?: string;
  /** 오류가 났을 때 부모가 포커스를 옮길 곳 — 칩 묶음 */
  ref?: Ref<HTMLDivElement>;
};

const CHIP =
  "t4-medium inline-flex h-[40px] items-center gap-x1 rounded-r2 border px-x3_5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring";

// 관심 분야 칩 — 가입 · 마이페이지 (EXPERIENCE.md Component Patterns 「관심 분야 칩」, 프로토타입 v21 AuthPage).
// 여러 개 고른다(aria-pressed). 마지막 남은 칩은 풀리지 않는다. 준비 중 분야는 고르지 않고 누르면 안내한다.
// 고른 칩 모양은 DESIGN.md 「선택된 필터 칩」, 높이 40px 은 [가정] (누르는 영역 44px 목표와 v21 38px 사이)
export function InterestChips({
  value,
  onValueChange,
  onKeepOne,
  error,
  ref,
}: InterestChipsProps) {
  const labelId = useId();
  const errorId = useId();
  const categories = useQuery(categoriesQuery);
  const notifyUpcoming = useUpcomingCategory();

  function toggle(code: string) {
    if (!value.includes(code)) {
      onValueChange([...value, code]);
    } else if (value.length === 1) {
      onKeepOne();
    } else {
      onValueChange(value.filter((item) => item !== code));
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-x2_5 outline-none"
    >
      <div className="flex items-baseline gap-x2">
        <span id={labelId} className="t4-bold text-fg-neutral">
          관심 분야
        </span>
        <span className="t3-regular text-fg-neutral-muted">
          여러 개 고를 수 있어요
        </span>
      </div>
      <QueryState
        query={categories}
        loadingLabel="분야 불러오는 중"
        skeleton={<Skeleton radius="8" width="full" height="x10" />}
        errorTitle="분야를 불러오지 못했어요"
      >
        {(items) => (
          <div className="flex flex-wrap gap-x2">
            {items.map((category) => {
              const on = value.includes(category.code);
              return (
                <button
                  key={category.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(category.code)}
                  className={`${CHIP} ${
                    on
                      ? "border-stroke-brand-solid bg-bg-brand-weak text-fg-brand-contrast active:bg-bg-brand-weak-pressed"
                      : "border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral hover:bg-bg-layer-default-pressed"
                  }`}
                >
                  {on ? (
                    <IconCheckmarkLine aria-hidden size={16} />
                  ) : (
                    <IconPlusLine
                      aria-hidden
                      size={14}
                      className="text-fg-neutral-subtle"
                    />
                  )}
                  {category.name}
                </button>
              );
            })}
            {UPCOMING_CATEGORIES.map((category) => (
              <button
                key={category.code}
                type="button"
                aria-disabled="true"
                onClick={() => notifyUpcoming(category.name)}
                className={`${CHIP} border-stroke-neutral-weak text-fg-disabled`}
              >
                {`${category.name} · 준비 중`}
              </button>
            ))}
          </div>
        )}
      </QueryState>
      {error && (
        // 글자 칸(SEED TextField)의 오류와 같은 모양 — 느낌표 아이콘과 문장
        <p
          id={errorId}
          className="t3-regular flex items-center gap-x1 text-fg-critical"
        >
          <IconExclamationmarkCircleFill aria-hidden size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
