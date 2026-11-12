import { AlertDialog } from "@seed-design/react";
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
          <AlertDialog.Content>
            <AlertDialog.Header>
              <AlertDialog.Title>{title}</AlertDialog.Title>
              <AlertDialog.Description>{description}</AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer className="flex gap-x2">
              <ActionButton
                variant="neutralWeak"
                size="large"
                className="flex-1"
                onClick={onCancel}
              >
                {cancelLabel}
              </ActionButton>
              <ActionButton
                variant="brandSolid"
                size="large"
                className="flex-1"
                onClick={onConfirm}
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
