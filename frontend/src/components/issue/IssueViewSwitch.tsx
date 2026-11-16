// 넓은 화면 이슈 흐름의 보기 — 지도(기본) · 세로 (Jira 221)
export type IssueView = "list" | "map";

const VIEWS: { value: IssueView; label: string }[] = [
  { value: "map", label: "지도" },
  { value: "list", label: "세로" },
];

type IssueViewSwitchProps = {
  view: IssueView;
  onChange: (view: IssueView) => void;
};

// 「지도 | 세로」 — 이슈 흐름 도구줄에 둔다. 기본 보기를 앞에 둔다. 탭이 아니라 보기를 고르는 버튼 묶음이라 관련 기사 정렬(EventPanel)과 같은
// 알약 모양 · aria-pressed 를 쓴다 (DESIGN.md 보기 전환). 이미 고른 보기를 다시 누르면 아무것도 하지 않는다
export function IssueViewSwitch({ view, onChange }: IssueViewSwitchProps) {
  return (
    <div
      role="group"
      aria-label="이슈 흐름 보기"
      className="flex items-center gap-x0_5 rounded-full bg-bg-neutral-weak p-x0_5"
    >
      {VIEWS.map(({ value, label }) => {
        const on = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!on) onChange(value);
            }}
            className={`h-x8 rounded-full px-x3_5 whitespace-nowrap transition-[color,background-color] duration-[var(--seed-duration-color-transition)] ease-[var(--seed-timing-function-easing)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus-ring ${
              on
                ? "t4-bold bg-bg-layer-default text-fg-neutral shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                : "t4-medium text-fg-neutral-subtle hover:text-fg-neutral"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
