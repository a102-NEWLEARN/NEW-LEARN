import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { Dialog } from "@seed-design/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ExpandedViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 창 이름 · 머리 글 — 기사 제목 */
  title: string;
  /** 창을 채울 보기 — 흐름지도나 마인드맵 */
  children: ReactNode;
};

// 크게 보기 — 흐름지도 · 마인드맵을 화면을 꽉 채운 창으로 다시 그린다 (2026-11-12 사용자, Jira 195).
// 아이폰 사파리는 Fullscreen API 를 영상에만 허락해서 브라우저 전체 화면 대신 화면을 덮는 창이다 — 홈 화면 앱(PWA)이면 꽉 찬다.
// 포커스 가두기 · 바깥 스크롤 막기 · 바깥 숨기기 · 닫으면 포커스 돌려주기는 SEED Dialog 가 한다. Esc 는 이 창을 닫는다
// (그래프 · 흐름지도의 Esc 는 창 안에서 누르면 창 몫으로 넘긴다 — EXPERIENCE.md 닫는 순서).
// 창은 본문(<main>) 밖 body 에 그린다 — 본문 안에서는 화면 전환 움직임이 고정 위치의 기준이 되어 헤더 아래에 갇히고,
// 본문이 isolate 라 z-index 도 본문 안에서만 통한다(사건 시트와 같다, EventDetailPane).
// 창 안의 글을 드래그하면 용어사전 말풍선을 창(data-drawer) 안에 그린다 — 밖에 그리면 SEED 가 바깥을 숨긴다(MeaningBubble).
// SEED 기본 모양(가운데 둥근 카드 · 폭 90%)을 덮어 화면 끝까지 채운다
export function ExpandedView({
  open,
  onOpenChange,
  title,
  children,
}: ExpandedViewProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        // 창 안의 탐색 설정 · 용어사전 말풍선이 먼저 받아 막은(preventDefault) Esc 는 그쪽 몫이다 — 창은 그대로 둔다.
        // SEED 는 막힌 Esc 도 창을 닫으라고 알려서 둘이 함께 닫혔다 (EXPERIENCE.md 닫는 순서, 리뷰 Jira 195)
        if (
          !next &&
          details?.reason === "escapeKeyDown" &&
          details.event.defaultPrevented
        )
          return;
        onOpenChange(next);
      }}
    >
      {createPortal(
        <Dialog.Positioner className="p-0">
          {/* SEED 는 창 글을 글자마다 끊는다(break-all) — 앱 규칙(DESIGN.md Typography)대로 단어 단위로 되돌린다 */}
          <Dialog.Content
            data-drawer
            width="100vw"
            maxWidth="100vw"
            className="h-dvh max-h-none rounded-none bg-bg-layer-default break-keep [overflow-wrap:break-word]"
          >
            <div className="flex h-[52px] shrink-0 items-center gap-x2 border-b border-stroke-neutral-weak pr-x2 pl-x5 md:pl-x8">
              <Dialog.Title className="t5-bold min-w-0 flex-1 truncate text-fg-neutral">
                {title}
              </Dialog.Title>
              <Dialog.CloseButton
                aria-label="작게 보기"
                title="작게 보기"
                className="static m-0 flex size-x10 items-center justify-center rounded-r2 p-0 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
              >
                <IconXmarkLine aria-hidden size={20} />
              </Dialog.CloseButton>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </Dialog.Content>
        </Dialog.Positioner>,
        document.body,
      )}
    </Dialog.Root>
  );
}
