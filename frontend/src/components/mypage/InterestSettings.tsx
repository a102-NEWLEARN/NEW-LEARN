import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { ApiError, isSessionExpired } from "@/api/error";
import { changeCategories, type Member, meQuery } from "@/api/members";
import { InterestChips } from "@/components/InterestChips";
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

// 마이페이지 관심 분야 — 지금 관심 분야를 고른 칩으로 시작해 고치고 *저장하고 홈으로* 로 A18 에 보낸다
// (EXPERIENCE.md IA 마이페이지 행, 프로토타입 v21 MyPageScreen). *홈으로* 는 저장하지 않는다.
// v21 은 저장 줄을 화면 아래에 붙여 두지만 좁은 화면에서 용어사전 버튼이 덮어서 섹션 안에 둔다 [가정]
export function InterestSettings({ member }: { member: Member }) {
  const headingId = useId();
  const [codes, setCodes] = useState(() =>
    member.categories.map((category) => category.code),
  );
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: changeCategories,
    onSuccess: (updated) => {
      queryClient.setQueryData(meQuery.queryKey, updated);
      snackbar.show("관심사를 저장했어요", "positive");
      navigate("/home");
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
    <section
      aria-labelledby={headingId}
      className="border-t border-stroke-neutral-weak py-x5"
    >
      <h2 id={headingId} className="t5-bold text-fg-neutral">
        관심 분야
      </h2>
      <p className="t3-regular mt-x1 mb-x3 text-fg-neutral-muted">
        홈 추천 탭에 고른 분야가 나와요.
      </p>
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
      <div className="mt-x5 flex flex-wrap items-center justify-end gap-x2">
        {/* 좁은 화면에서는 안내가 한 줄을 다 쓰고 버튼이 그 아래 오른쪽에 모인다 */}
        <p className="t3-regular w-full text-fg-neutral-muted md:mr-auto md:w-auto">
          고른 관심 분야는 홈 추천에 바로 반영돼요.
        </p>
        <ActionButton asChild variant="ghost">
          <Link to="/home">홈으로</Link>
        </ActionButton>
        <ActionButton
          variant="brandSolid"
          loading={mutation.isPending}
          aria-busy={mutation.isPending || undefined}
          onClick={save}
        >
          저장하고 홈으로
        </ActionButton>
      </div>
      {failure && (
        <p
          role="alert"
          className="t4-medium mt-x3 rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
        >
          {failure}
        </p>
      )}
    </section>
  );
}
