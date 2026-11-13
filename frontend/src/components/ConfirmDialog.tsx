import { AlertDialog } from "@seed-design/react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ActionButton } from "seed-design/ui/action-button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  /** 그대로 머무는 버튼 — Esc 도 이것이다 */
  cancelLabel: string;
  /** 진행하는 버튼 */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

// Radix FocusScope(SEED 창 안)가 창이 사라진 뒤 열기 전 포커스 자리로 돌려줄 때 창 칸에 보내는 사건 이름
// (@radix-ui/react-focus-scope AUTOFOCUS_ON_UNMOUNT). 이 사건을 막으면 돌려주지 않는다
const RESTORE_FOCUS_EVENT = "focusScope.autoFocusOnUnmount";

// 작은 확인 창 — 「저장하지 않고 나갈까요?」처럼 답을 기다려야 하는 물음 (SEED AlertDialog, EXPERIENCE.md Accessibility Floor 모달).
// 스낵바는 답을 기다릴 수 없어서 창으로 묻는다 (2026-11-12 사용자, Jira 195).
// 바깥을 눌러도 닫히지 않고(SEED AlertDialog 기본), Esc 는 머무는 쪽이다.
// 창은 본문(<main>) 밖 body 에 그린다 — 본문이 isolate 라 안에서 그리면 z-index 가 본문 안에서만 통한다(사건 시트와 같다)
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  // 진행을 고르면 다른 화면으로 가는 일이 많다 — 셸이 새 화면 제목(h1)에 준 포커스를 SEED 가 창을 연 버튼으로 도로 가져가지 않게
  // 그때만 포커스 돌려주기를 막는다. 머물기를 고르면 그대로 돌려준다 (리뷰, Jira 195).
  // Radix 는 창 칸이 사라진 뒤 타이머로 이 사건을 보낸다 — 그때는 이 컴포넌트도 내려가 있어서 리스너를 떼지 않고 칸에 남긴다
  // (칸과 함께 버려진다)
  const confirmed = useRef(false);
  useEffect(() => {
    if (open) confirmed.current = false;
  }, [open]);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    node?.addEventListener(RESTORE_FOCUS_EVENT, (event) => {
      if (confirmed.current) event.preventDefault();
    });
  }, []);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      {createPortal(
        <AlertDialog.Positioner>
          <AlertDialog.Backdrop />
          {/* SEED 는 창 글을 글자마다 끊는다(break-all) — 앱 규칙(DESIGN.md Typography)대로 단어 단위로 되돌린다.
              글자 · 버튼은 SEED 기본보다 한 단계씩 작게, 버튼은 가로로 나란히 둔다 — 기본은 글씨가 크고 버튼이 세로로 쌓여
              무겁게 보였다 (2026-11-13 사용자 「촌스럽고 글씨가 너무 크다」, Jira 202) */}
          <AlertDialog.Content
            ref={contentRef}
            className="w-full max-w-[min(340px,calc(100vw-48px))] break-keep [overflow-wrap:break-word]"
          >
            <AlertDialog.Header className="gap-x1_5">
              <AlertDialog.Title className="t6-bold text-fg-neutral">
                {title}
              </AlertDialog.Title>
              <AlertDialog.Description className="t4-regular text-fg-neutral-muted">
                {description}
              </AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer className="flex flex-row gap-x2">
              {/* 머물기는 보조 버튼 — 흰 바탕 · 옅은 테두리 (DESIGN.md Components 보조 버튼) */}
              <ActionButton
                variant="neutralOutline"
                size="medium"
                className="flex-1 border-stroke-neutral-weak"
                onClick={onCancel}
              >
                {cancelLabel}
              </ActionButton>
              <ActionButton
                variant="brandSolid"
                size="medium"
                className="flex-1"
                onClick={() => {
                  confirmed.current = true;
                  onConfirm();
                }}
              >
                {confirmLabel}
              </ActionButton>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Positioner>,
        document.body,
      )}
    </AlertDialog.Root>
  );
}
