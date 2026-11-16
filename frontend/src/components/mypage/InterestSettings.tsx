import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { ApiError, isSessionExpired } from "@/api/error";
import { changeCategories, type Member, meQuery } from "@/api/members";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InterestChips } from "@/components/InterestChips";
import { MyPageSection } from "@/components/mypage/MyPageSection";
import { errorDescription } from "@/components/state/ErrorState";
import { isLogoutNavigation } from "@/components/useLogout";
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

/** 고른 칩이 저장된 관심 분야와 다른가 — 순서는 보지 않는다 */
function differs(codes: readonly string[], member: Member) {
  const saved = new Set(member.categories.map((category) => category.code));
  return codes.length !== saved.size || codes.some((code) => !saved.has(code));
}

type InterestSettingsProps = {
  member: Member;
};

// 마이페이지 관심 분야 — 지금 관심 분야를 고른 칩으로 시작해 고치고, 화면 아래에 붙은 *변경사항 저장하기* 로 A18 에 보낸다.
// 저장하면 알림만 띄우고 마이페이지에 남는다 (EXPERIENCE.md IA 마이페이지 행).
// 섹션 제목 옆 *저장* 이 촌스럽다 → 맨 아래 버튼 하나, 바꾼 것이 없으면 누를 수 없다. 바꾼 채 다른 화면으로 가려 하면
// 「저장하지 않고 나갈까요?」로 묻는다 (2026-11-12 사용자, Jira 195). 로그아웃 · 세션 만료로 떠날 때는 묻지 않는다
export function InterestSettings({ member }: InterestSettingsProps) {
  const headingId = useId();
  const [codes, setCodes] = useState(() =>
    member.categories.map((category) => category.code),
  );
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: changeCategories,
    onSuccess: (updated) => {
      // 저장하면 바꾼 것이 없어져 버튼이 꺼진다 — 버튼에 있던 포커스가 body 로 떨어지지 않게 칩 묶음으로 옮긴다 (리뷰, Jira 195)
      const hadFocus = document.activeElement === saveRef.current;
      queryClient.setQueryData(meQuery.queryKey, updated);
      snackbar.show("관심사를 저장했어요", "positive");
      if (hadFocus) chipsRef.current?.focus();
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
  // 저장된 것(A17)과 다르면 고친 것이다. 저장하면 내 정보가 응답으로 바뀌어 다시 같아진다
  const dirty = differs(codes, member);

  function save() {
    // SEED 버튼은 로딩 중에도 눌린다. 두 번 보내지 않는다
    if (mutation.isPending || !dirty) return;
    setFailure(null);
    mutation.mutate(codes);
  }

  // 고친 채 다른 화면으로 가려 하면 막고 묻는다. 보내는 중이면 막지 않는다. 로그아웃은 묻지 않는다 —
  // 세션 만료(401)는 이 화면이 내려가며 블로커도 함께 지워져 막히지 않는다(RequireMember)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !mutation.isPending &&
      currentLocation.pathname !== nextLocation.pathname &&
      !isLogoutNavigation(nextLocation.state),
  );
  // 새로 고침 · 탭 닫기 — 브라우저가 자기 문구로 묻는다
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <>
      <MyPageSection
        title="관심 분야"
        description="홈 추천 탭에 고른 분야가 나와요."
        headingId={headingId}
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
      </MyPageSection>
      {/* 화면 아래에 붙은 저장 줄 — 좁은 화면에서 칩이 길어도 어디서나 바로 누른다. 좌우 여백까지 바탕을 채운다
          (SEED 테마는 음수 간격 클래스를 만들지 않아 px 로 쓴다) */}
      <div className="sticky bottom-0 z-[2] -mx-[20px] mt-x6 border-t border-stroke-neutral-weak bg-bg-layer-default px-[20px] pt-x3 pb-[max(12px,env(safe-area-inset-bottom))] md:-mx-[24px] md:px-[24px]">
        {failure && (
          <p
            role="alert"
            className="t4-medium mb-x3 rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
          >
            {failure}
          </p>
        )}
        <ActionButton
          ref={saveRef}
          variant="brandSolid"
          size="large"
          className="w-full"
          disabled={!dirty}
          loading={mutation.isPending}
          aria-busy={mutation.isPending || undefined}
          onClick={save}
        >
          변경사항 저장하기
        </ActionButton>
      </div>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="저장하지 않고 나갈까요?"
        description="바꾼 관심 분야가 저장되지 않아요."
        cancelLabel="계속 고치기"
        confirmLabel="나가기"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}
