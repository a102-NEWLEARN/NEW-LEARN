import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type RefObject, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
import { ApiError } from "@/api/error";
import { meQuery, signUp } from "@/api/members";
import { AuthSwitch } from "@/components/AuthSwitch";
import { InterestChips } from "@/components/InterestChips";
import { Logo } from "@/components/Logo";
import { errorDescription } from "@/components/state/ErrorState";
import { usePageTitle } from "@/components/usePageTitle";
import { useSnackbar } from "@/components/useSnackbar";
import { loginPath, nextPath } from "@/lib/login-path";

// 칸 이름은 A14 요청 필드와 같다. 확인 칸만 화면에 있다
type Field =
  "name" | "loginId" | "password" | "passwordConfirm" | "categoryCodes";
type FieldErrors = Partial<Record<Field, string>>;
type TextFieldName = Exclude<Field, "categoryCodes">;

// 틀린 칸이 여럿이면 이 차례로 첫 칸에 포커스한다
const FIELD_ORDER: Field[] = [
  "name",
  "loginId",
  "password",
  "passwordConfirm",
  "categoryCodes",
];

// 칸 검사 문구는 EXPERIENCE.md State Patterns 「입력 오류」 · 「관심 분야 0개」, 오류 코드별 문구는 docs/api.md 2절
const KEEP_ONE = "관심 분야를 1개 이상 골라 주세요.";
const LOGIN_ID_TAKEN = "이미 쓰는 아이디예요";
const RATE_LIMITED = "요청이 많아요. 잠시 뒤 다시 시도해 주세요";

/** VALIDATION_FAILED 의 칸 오류 중 이 폼의 칸 것만. 하나도 없으면 null */
function serverFieldErrors(error: unknown): FieldErrors | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "LOGIN_ID_TAKEN") return { loginId: LOGIN_ID_TAKEN };
  if (error.code !== "VALIDATION_FAILED") return null;
  const found: FieldErrors = {};
  for (const { field, reason } of error.errors) {
    if (FIELD_ORDER.includes(field as Field)) found[field as Field] = reason;
  }
  return Object.keys(found).length > 0 ? found : null;
}

/** 폼 안에 띄울 실패 문구. RATE_LIMITED 는 입구(Envoy)가 만들어서 코드가 없어도 429 면 같은 문구다 */
function failureMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 429) return RATE_LIMITED;
  return errorDescription(error);
}

// 가입 — 셸 없이 전체 화면으로 뜬다 (EXPERIENCE.md Information Architecture 가입 행 · Component Patterns 「로그인 · 가입 폼」,
// 프로토타입 v21 AuthPage). 가입하면 바로 로그인된다(A14) — 내 정보를 새 회원으로 바꾸면 next 로 간다
export function SignupPage() {
  usePageTitle("회원가입");
  const [params] = useSearchParams();
  const next = nextPath(params.get("next"));
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [interests, setInterests] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const inputRefs: Record<TextFieldName, RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    loginId: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    passwordConfirm: useRef<HTMLInputElement>(null),
  };
  const interestsRef = useRef<HTMLDivElement>(null);

  const focusFirstError = (errors: FieldErrors) => {
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first === "categoryCodes") interestsRef.current?.focus();
    else if (first) inputRefs[first].current?.focus();
  };

  const mutation = useMutation({
    mutationFn: signUp,
    // 내 정보를 새 회원으로 바꾸면 아래 「이미 로그인했으면」이 next 로 보낸다
    onSuccess: (member) => {
      queryClient.setQueryData(meQuery.queryKey, member);
      snackbar.show("가입을 마쳤어요", "positive");
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
    // 이름 · 아이디는 앞뒤 빈칸을 지운다. 비밀번호는 쓴 그대로 보낸다 (docs/api-screen.md A14)
    const name = String(form.get("name") ?? "").trim();
    const loginId = String(form.get("loginId") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const passwordConfirm = String(form.get("passwordConfirm") ?? "");
    const errors: FieldErrors = {};
    if (!name) errors.name = "이름을 입력해 주세요.";
    if (!loginId) errors.loginId = "아이디를 입력해 주세요.";
    else if (loginId.length < 4)
      errors.loginId = "아이디는 4자 이상으로 입력해 주세요.";
    if (!password)
      errors.password = "비밀번호를 입력해 주세요."; // secret-scan:allow — 안내 문구다
    else if (password.length < 8)
      errors.password = "비밀번호는 8자 이상으로 입력해 주세요."; // secret-scan:allow — 안내 문구다
    if (!passwordConfirm || passwordConfirm !== password)
      errors.passwordConfirm = "비밀번호가 서로 달라요."; // secret-scan:allow — 안내 문구다
    if (interests.length === 0) errors.categoryCodes = KEEP_ONE;
    setFieldErrors(errors);
    setFailure(null);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return;
    }
    mutation.mutate({ name, loginId, password, categoryCodes: interests });
  }

  // 고쳐 쓰면 그 칸의 오류와 폼 실패 문구를 지운다
  const clearError = (field: Field) => () => {
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
    setFailure(null);
  };

  const textField = (
    field: TextFieldName,
    label: string,
    input: {
      type?: string;
      autoComplete: string;
      placeholder: string;
    },
  ) => (
    <TextField
      label={label}
      invalid={!!fieldErrors[field]}
      errorMessage={fieldErrors[field]}
      onValueChange={clearError(field)}
    >
      <TextFieldInput
        ref={inputRefs[field]}
        name={field}
        type={input.type}
        autoComplete={input.autoComplete}
        autoCapitalize={field === "loginId" ? "none" : undefined}
        spellCheck={field === "loginId" ? false : undefined}
        placeholder={input.placeholder}
      />
    </TextField>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg-layer-default">
      <header className="flex h-[60px] shrink-0 items-center px-x4 md:px-x8">
        <Logo height={26} />
        <Link
          to="/"
          aria-label="닫기"
          className="ml-auto flex size-x10 items-center justify-center rounded-r2 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconXmarkLine size={20} aria-hidden />
        </Link>
      </header>
      <main className="flex-1">
        <form
          noValidate
          aria-labelledby="signup-title"
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-[400px] flex-col gap-x5 px-x4 pt-x10 pb-x14 md:pt-x16"
        >
          <div className="mb-x2 break-keep">
            <h1 id="signup-title" className="screen-title text-fg-neutral">
              회원가입
            </h1>
            <p className="t5-regular mt-x2 text-fg-neutral-muted">
              관심 분야를 고르면 홈에서 그 분야 이슈를 먼저 보여드려요.
            </p>
          </div>
          {textField("name", "이름", {
            autoComplete: "name",
            placeholder: "이름을 입력해 주세요",
          })}
          {textField("loginId", "아이디", {
            autoComplete: "username",
            placeholder: "4자 이상",
          })}
          {textField("password", "비밀번호", {
            type: "password",
            autoComplete: "new-password",
            placeholder: "8자 이상",
          })}
          {textField("passwordConfirm", "비밀번호 확인", {
            type: "password",
            autoComplete: "new-password",
            placeholder: "비밀번호를 한 번 더 입력해 주세요",
          })}
          <InterestChips
            ref={interestsRef}
            value={interests}
            onValueChange={(codes) => {
              setInterests(codes);
              clearError("categoryCodes")();
            }}
            onKeepOne={() =>
              setFieldErrors((errors) => ({
                ...errors,
                categoryCodes: KEEP_ONE,
              }))
            }
            error={fieldErrors.categoryCodes}
          />
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
            가입하기
          </ActionButton>
          <AuthSwitch
            question="이미 계정이 있나요?"
            to={loginPath(next)}
            label="로그인"
          />
        </form>
      </main>
    </div>
  );
}
