import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { ApiError, isSessionExpired } from "@/api/error";
import { changeCategories, type Member, meQuery } from "@/api/members";
import { InterestChips } from "@/components/InterestChips";
import { MyPageSection } from "@/components/mypage/MyPageSection";
import { errorDescription } from "@/components/state/ErrorState";
import { useSnackbar } from "@/components/useSnackbar";

// EXPERIENCE.md State Patterns 「관심 분야 0개」
const KEEP_ONE = "관심 분야를 1개 이상 골라 주세요.";

/** VALIDATION_FAILED 의 관심 분야 칸 문장. 없으면 null */
function categoryError(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED")
    return null;
  return (
    error.errors.find((item) => item.field === "categoryCodes")?.reason ?? null
  );
}

// 마이페이지 관심 분야 — 지금 관심 분야를 고른 칩으로 시작해 고치고 제목 오른쪽 *저장* 으로 A18 에 보낸다.
// 저장하면 알림만 띄우고 마이페이지에 남는다 (EXPERIENCE.md IA 마이페이지 행). v21 은 화면 아래 저장 줄
// (*홈으로* · *저장하고 홈으로*)이었지만 카드 가운데 버튼 줄이 어수선했다 (2026-11-05 사용자)
export function InterestSettings({ member }: { member: Member }) {
  const headingId = useId();
  const [codes, setCodes] = useState(() =>
    member.categories.map((category) => category.code),
  );
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: changeCategories,
    onSuccess: (updated) => {
      queryClient.setQueryData(meQuery.queryKey, updated);
      snackbar.show("관심사를 저장했어요", "positive");
    },
    onError: (cause) => {
      // 세션이 끝났다 — QueryClient 가 손님으로 바꿔 로그인 화면으로 보낸다(query-client.ts). 로그인하면 여기로 돌아온다
      if (isSessionExpired(cause)) return;
      const reason = categoryError(cause);
      if (reason) {
        setError(reason);
        chipsRef.current?.focus();
      } else {
        setFailure(errorDescription(cause));
      }
    },
  });

  function save() {
    // SEED 버튼은 로딩 중에도 눌린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    setFailure(null);
    if (codes.length === 0) {
      setError(KEEP_ONE);
      chipsRef.current?.focus();
      return;
    }
    mutation.mutate(codes);
  }

  return (
    <MyPageSection
      title="관심 분야"
      description="홈 추천 탭에 고른 분야가 나와요."
      headingId={headingId}
      action={
        <ActionButton
          variant="brandSolid"
          size="small"
          loading={mutation.isPending}
          aria-busy={mutation.isPending || undefined}
          onClick={save}
        >
          저장
        </ActionButton>
      }
    >
      <InterestChips
        ref={chipsRef}
        labelledBy={headingId}
        value={codes}
        onValueChange={(next) => {
          setCodes(next);
          setError(null);
          setFailure(null);
        }}
        onKeepOne={() => setError(KEEP_ONE)}
        error={error ?? undefined}
      />
      {failure && (
        <p
          role="alert"
          className="t4-medium mt-x3 rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
        >
          {failure}
        </p>
      )}
    </MyPageSection>
  );
}
