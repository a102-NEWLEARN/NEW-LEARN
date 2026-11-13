import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
import { login } from "@/api/auth";
import { ApiError } from "@/api/error";
import { meQuery } from "@/api/members";
import { AuthClose } from "@/components/AuthClose";
import { AuthSwitch } from "@/components/AuthSwitch";
import { Logo } from "@/components/Logo";
import { GROUP_RISE, SCREEN_FADE } from "@/components/motion/appMotion";
import { errorDescription } from "@/components/state/ErrorState";
import { usePageTitle } from "@/components/usePageTitle";
import { useSnackbar } from "@/components/useSnackbar";
import { guestPath, nextPath, signupPath } from "@/lib/login-path";

type Field = "loginId" | "password";
type FieldErrors = Partial<Record<Field, string>>;

// 오류 코드별 문구 — docs/api.md 2절. 칸 검사 문구는 EXPERIENCE.md State Patterns 「입력 오류」
const FAILURES: Record<string, string> = {
  LOGIN_FAILED: "아이디나 비밀번호를 확인해 주세요",
  TOO_MANY_REQUESTS: "로그인을 5번 틀려 1분 뒤에 다시 할 수 있어요",
  RATE_LIMITED: "요청이 많아요. 잠시 뒤 다시 시도해 주세요",
};

/** 폼 안에 띄울 실패 문구. RATE_LIMITED 는 입구(Envoy)가 만들어서 코드가 없어도 429 면 같은 문구다 */
function failureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code && error.code in FAILURES) return FAILURES[error.code];
    if (error.status === 429) return FAILURES.RATE_LIMITED;
  }
  return errorDescription(error);
}

/** VALIDATION_FAILED 의 칸 오류 중 이 폼의 칸 것만. 하나도 없으면 null */
function serverFieldErrors(error: unknown): FieldErrors | null {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED")
    return null;
  const found: FieldErrors = {};
  for (const { field, reason } of error.errors) {
    if (field === "loginId" || field === "password") found[field] = reason;
  }
  return Object.keys(found).length > 0 ? found : null;
}

// 로그인 — 셸 없이 전체 화면으로 뜬다 (EXPERIENCE.md Information Architecture · Component Patterns 「로그인 · 가입 폼」).
// 아래 *회원가입* 은 가입 화면으로 가며 돌아올 곳(next)을 넘긴다. 그 아래 *로그인 없이 시작하기* 는 손님인 채
// next 로 간다 — 손님도 둘러보기는 다 한다 (EXPERIENCE.md 이동 규칙, 2026-11-13 Jira 205)
export function LoginPage() {
  usePageTitle("로그인");
  const [params] = useSearchParams();
  // 랜딩에서 오면 돌아올 곳이 없다 — 그때 닫기는 랜딩, 로그인하면 홈이다
  const rawNext = params.get("next");
  const next = nextPath(rawNext);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const loginIdRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);

  const focusFirstError = (errors: FieldErrors) =>
    (errors.loginId ? loginIdRef : passwordRef).current?.focus();

  const mutation = useMutation({
    mutationFn: login,
    // 내 정보를 새 회원으로 바꾸면 아래 「이미 로그인했으면」이 next 로 보낸다.
    // 그 전에 손님으로 받아 둔 응답을 모두 버린다 — 기사 · 이슈 응답의 bookmarked · interested 가 손님 기준(false)이다.
    // 순서를 바꾸면 새 내 정보도 지워진다 (useLogout 과 같다, Jira 205)
    onSuccess: (member) => {
      queryClient.removeQueries();
      queryClient.setQueryData(meQuery.queryKey, member);
      snackbar.show("로그인했어요", "positive");
    },
    onError: (error) => {
      const errors = serverFieldErrors(error);
      if (errors) {
        setFieldErrors(errors);
        focusFirstError(errors);
      } else {
        setFailure(failureMessage(error));
      }
    },
  });

  if (me.data) return <Navigate to={next} replace />;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // SEED 버튼은 로딩 중에도 눌린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    const form = new FormData(event.currentTarget);
    // 아이디에는 빈칸이 들어갈 수 없다(docs/api-screen.md A14). 비밀번호는 쓴 그대로 보낸다
    const loginId = String(form.get("loginId") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const errors: FieldErrors = {};
    if (!loginId) errors.loginId = "아이디를 입력해 주세요.";
    if (!password) errors.password = "비밀번호를 입력해 주세요."; // secret-scan:allow — 안내 문구다
    setFieldErrors(errors);
    setFailure(null);
    if (errors.loginId || errors.password) {
      focusFirstError(errors);
      return;
    }
    mutation.mutate({ loginId, password });
  }

  // 고쳐 쓰면 그 칸의 오류와 폼 실패 문구를 지운다
  const clearError = (field: Field) => () => {
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
    setFailure(null);
  };

  return (
    // 열면 화면이 나타나고 폼이 떠오른다 (프로토타입 v21 AuthPage, appMotion.ts)
    <div
      className={`flex min-h-dvh flex-col bg-bg-layer-default ${SCREEN_FADE}`}
    >
      <header className="flex h-[60px] shrink-0 items-center px-x5 md:px-x8">
        <Logo height={26} />
        <AuthClose next={rawNext} />
      </header>
      <main className="flex-1">
        <form
          noValidate
          aria-labelledby="login-title"
          onSubmit={handleSubmit}
          className={`mx-auto flex max-w-[400px] flex-col gap-x5 px-x5 pt-x10 pb-x14 md:pt-x16 ${GROUP_RISE}`}
        >
          <div className="mb-x2">
            <h1 id="login-title" className="screen-title text-fg-neutral">
              로그인
            </h1>
            <p className="t5-regular mt-x2 text-fg-neutral-muted">
              로그인하고 오늘의 이슈를 흐름으로 읽어 보세요.
            </p>
          </div>
          <TextField
            label="아이디"
            invalid={!!fieldErrors.loginId}
            errorMessage={fieldErrors.loginId}
            onValueChange={clearError("loginId")}
          >
            <TextFieldInput
              ref={loginIdRef}
              name="loginId"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="아이디를 입력해 주세요"
            />
          </TextField>
          <TextField
            label="비밀번호"
            invalid={!!fieldErrors.password}
            errorMessage={fieldErrors.password}
            onValueChange={clearError("password")}
          >
            <TextFieldInput
              ref={passwordRef}
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호를 입력해 주세요"
            />
          </TextField>
          {failure && (
            <p
              role="alert"
              className="t4-medium rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
            >
              {failure}
            </p>
          )}
          <ActionButton
            type="submit"
            variant="brandSolid"
            size="large"
            loading={mutation.isPending}
            aria-busy={mutation.isPending || undefined}
            className="mt-x2 w-full"
          >
            로그인
          </ActionButton>
          <AuthSwitch
            question="아직 계정이 없나요?"
            to={rawNext === null ? "/signup" : signupPath(next)}
            label="회원가입"
          />
          {/* 테두리 없는 글자 버튼 — 보조 버튼 *회원가입* 과 겨루지 않게 [가정] (EXPERIENCE.md IA 로그인 행).
              닫기(AuthClose)와 같이 로그인 화면을 기록에서 뺀다 — 뒤로 가기로 다시 오지 않게 */}
          <ActionButton asChild variant="ghost" size="large" className="w-full">
            <Link to={guestPath(rawNext)} replace>
              로그인 없이 시작하기
            </Link>
          </ActionButton>
        </form>
      </main>
    </div>
  );
}
