import { IconExclamationmarkCircleLine } from "@karrotmarket/react-monochrome-icon";
import { ActionButton } from "seed-design/ui/action-button";
import { isNetworkError } from "@/api/error";

// 안내 문구 — EXPERIENCE.md Voice and Tone · State Patterns 「일반 오류 안내」
const NETWORK_ERROR = "네트워크 상태를 확인한 뒤 다시 시도해 주세요.";
const GENERAL_ERROR =
  "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.";

type ErrorStateProps = {
  /** 무엇을 못 불러왔나. 예: 「타임라인을 불러오지 못했어요」 */
  title: string;
  error: unknown;
  onRetry: () => void;
};

/** 실패 안내 한 줄 — 서버에 닿지 못했으면 네트워크 안내, 아니면 일반 오류 안내 */
export function errorDescription(error: unknown) {
  return isNetworkError(error) ? NETWORK_ERROR : GENERAL_ERROR;
}

// 불러오기 실패 — 화면 전체가 아니라 실패한 영역 자리에 둔다 (EXPERIENCE.md State Patterns).
// 서버의 detail · code 는 화면에 내지 않는다 (docs/api.md 2절)
export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  const description = errorDescription(error);

  return (
    <div className="flex flex-col items-center gap-x2_5 p-x6 text-center">
      <IconExclamationmarkCircleLine
        aria-hidden
        size={32}
        className="text-fg-neutral-muted"
      />
      <p className="t6-bold text-fg-neutral">{title}</p>
      <p className="t4-regular text-fg-neutral-muted">{description}</p>
      {/* 보조 버튼 테두리는 SEED(stroke-neutral-muted) 대신 DESIGN.md 의 stroke-neutral-weak */}
      <ActionButton
        variant="neutralOutline"
        className="mt-x2 border-stroke-neutral-weak"
        onClick={onRetry}
      >
        다시 시도
      </ActionButton>
    </div>
  );
}
