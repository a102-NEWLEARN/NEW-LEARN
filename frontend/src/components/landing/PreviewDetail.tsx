import type { BranchType } from "@/api/mindmap";
import { AiBadge } from "@/components/AiBadge";
import { BRANCHES } from "@/components/article/branches";

type PreviewDetailProps = {
  branch: BranchType;
  text: string;
};

// 미리보기 아래 강조한 잎 — 가지 색 왼쪽 줄 · 가지 이름 칩 · 잎 글 · AI 생성 표시. 바뀔 때마다 320ms 로 떠오른다
// (프로토타입 v21). 프로토타입의 「원문 근거 · N번째 문단」 인용은 F05 노드 상세 및 근거 확인(추후)이라 뺐다
export function PreviewDetail({ branch, text }: PreviewDetailProps) {
  const { name, tone } = BRANCHES[branch];
  return (
    <div
      data-detail
      className={`border-l-[3px] py-x1 pl-x4 motion-safe:animate-[newlearn-rise-in_320ms_cubic-bezier(0.2,0.8,0.2,1)_backwards] ${tone.mark}`}
    >
      <div className="flex items-start gap-x2">
        <span
          className={`shrink-0 rounded-full border px-[9px] py-[2px] text-[12px] font-bold whitespace-nowrap ${tone.chip}`}
        >
          {name}
        </span>
        <span className="min-w-0 flex-1 text-[14px] leading-[1.5] font-bold text-fg-neutral">
          {text}
        </span>
        <AiBadge />
      </div>
    </div>
  );
}
