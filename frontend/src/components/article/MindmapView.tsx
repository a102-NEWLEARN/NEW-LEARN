import { IconGearLine } from "@karrotmarket/react-monochrome-icon";
import { useEffect, useRef, useState } from "react";
import { Switch } from "seed-design/ui/switch";
import type { BranchType, MindmapBranch } from "@/api/mindmap";
import { BRANCHES } from "@/components/article/branches";
import { MindmapGraph } from "@/components/article/MindmapGraph";

type MindmapViewProps = {
  /** 가운데 글자 — A9 title */
  title: string;
  /** A9 가지 — 내용이 있는 것만 온다 */
  branches: MindmapBranch[];
};

// 기사 마인드맵의 마인드맵 보기 — 범례(가지 토글 · 전망 · 해석) · 그래프 · 탐색 설정 (Jira S15P31A102-58).
// 가지 토글은 범례 칩이 맡는다 — 누르면 그 가지를 숨기고 다시 누르면 되살린다. 숨긴 것이 있으면 「모두 보기」.
// 탐색 설정은 「라벨 표시」 하나다 (2026-10-30 사용자 결정, 프로토타입 v21 그래프 설정 가운데 하나)
export function MindmapView({ title, branches }: MindmapViewProps) {
  const [hidden, setHidden] = useState<ReadonlySet<BranchType>>(new Set());
  const [showLabels, setShowLabels] = useState(true);
  const toggle = (type: BranchType) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(type)) next.add(type);
      return next;
    });
  const outlookShown = branches.some(
    (branch) => branch.type === "OUTLOOK" && !hidden.has("OUTLOOK"),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x2 border-b border-stroke-neutral-subtle px-x4 py-x2_5 md:px-x8">
        <div
          role="group"
          aria-label="가지 보기"
          className="flex flex-wrap items-center gap-x2"
        >
          {branches.map(({ type }) => {
            const { name, tone } = BRANCHES[type];
            const shown = !hidden.has(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={shown}
                onClick={() => toggle(type)}
                className={`t4-medium flex h-x8 items-center gap-x1_5 rounded-r2 border px-x3 focus-visible:outline-2 focus-visible:outline-stroke-focus-ring ${
                  shown
                    ? tone.chip
                    : "border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`size-x2_5 rounded-full ${shown ? tone.dot : "border-2 border-stroke-neutral-weak"}`}
                />
                {name}
              </button>
            );
          })}
          {/* 전망 가지의 잎은 점선 — 기사가 다룬 사실이 아니라 앞으로의 전망 · 해석이다 */}
          {outlookShown && (
            <span className="t3-regular flex items-center gap-x1_5 pl-x1 text-fg-neutral-muted">
              <svg aria-hidden width={14} height={14} viewBox="0 0 14 14">
                <circle
                  cx={7}
                  cy={7}
                  r={5}
                  fill="none"
                  strokeWidth={2}
                  strokeDasharray="3 2.4"
                  className="stroke-mindmap-outlook-stroke"
                />
              </svg>
              전망·해석
            </span>
          )}
        </div>
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={() => setHidden(new Set())}
            className="t4-medium h-x8 rounded-r2 px-x2 text-fg-brand hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
          >
            모두 보기
          </button>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MindmapGraph
          title={title}
          branches={branches}
          hidden={hidden}
          showLabels={showLabels}
        />
        <GraphSettings showLabels={showLabels} onShowLabels={setShowLabels} />
      </div>
    </div>
  );
}

type GraphSettingsProps = {
  showLabels: boolean;
  onShowLabels: (show: boolean) => void;
};

// 탐색 설정 — 그래프 오른쪽 위 톱니 버튼과 그 아래로 열리는 팝오버 (프로토타입 v21 「그래프 설정」은 오른쪽 아래.
// 오른쪽 아래는 개발 도구 버튼 · 스낵바와 겹쳐 위로 옮겼다).
// 열면 포커스를 창 안으로, Esc · 바깥 누르기로 닫고 포커스를 버튼으로 돌린다 (EXPERIENCE.md Accessibility Floor)
function GraphSettings({ showLabels, onShowLabels }: GraphSettingsProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("input")?.focus();
    // 캡처 단계 — 그래프의 Esc(포커스 · 강조 풀기)보다 먼저 이 창을 닫고 preventDefault 로 알린다
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || key.isComposing) return;
      key.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (pointer: PointerEvent) => {
      const target = pointer.target as Node | null;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  return (
    <div className="absolute top-[16px] right-[16px] flex flex-col items-end gap-x2">
      <button
        ref={buttonRef}
        type="button"
        aria-label="탐색 설정"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex size-x10 items-center justify-center rounded-r2 border border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
      >
        <IconGearLine aria-hidden size={18} />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="탐색 설정"
          className="w-[240px] rounded-r3 border border-stroke-neutral-weak bg-bg-layer-floating p-x3_5 shadow-s3"
        >
          <p className="t4-bold mb-x2_5 text-fg-neutral">탐색 설정</p>
          <Switch
            label="라벨 표시"
            checked={showLabels}
            onCheckedChange={onShowLabels}
          />
          <p className="t2-regular mt-x2 text-fg-neutral-muted">
            끄면 강조하거나 마우스를 올린 잎의 글만 보여요.
          </p>
        </div>
      )}
    </div>
  );
}
