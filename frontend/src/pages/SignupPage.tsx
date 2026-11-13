import {
  IconCheckmarkLine,
  IconPlusLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { ActionButton } from "seed-design/ui/action-button";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
import { ApiError } from "@/api/error";
import { meQuery, signUp } from "@/api/members";
import { AuthSwitch } from "@/components/AuthSwitch";
import { chipClassName, InterestChips } from "@/components/InterestChips";
import { Logo } from "@/components/Logo";
import { FollowCursor } from "@/components/motion/FollowCursor";
import { StepProgress } from "@/components/motion/StepProgress";
import { errorDescription } from "@/components/state/ErrorState";
import { usePageTitle } from "@/components/usePageTitle";
import { useSnackbar } from "@/components/useSnackbar";
import { loginPath, nextPath } from "@/lib/login-path";
import { startOnboarding } from "@/components/home/OnboardingTour";

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

// 가입 단계 — 한 화면에 질문 하나 (does.kr 채용 화면 참고). 단계마다 그 단계 칸만 검사하고 넘어간다.
// 안내 줄은 모든 단계에 둔다 — 없는 단계가 있으면 넘길 때마다 질문 띠 높이와 진행 막대 자리가 오르내린다
const STEPS: { title: string; hint: string; fields: Field[] }[] = [
  {
    title: "이름을 알려 주세요.",
    hint: "홈에서 이 이름으로 인사해요.",
    fields: ["name"],
  },
  {
    title: "아이디와 비밀번호를 정해 주세요.",
    hint: "아이디는 4자, 비밀번호는 8자 이상이에요.",
    fields: ["loginId", "password", "passwordConfirm"],
  },
  {
    title: "관심 분야를 골라 주세요.",
    hint: "고른 분야의 이슈를 홈에서 먼저 보여드려요.",
    fields: ["categoryCodes"],
  },
  {
    title: "NEW:LEARN 을 어디에 쓰실 건가요?",
    hint: "고르지 않고 가입해도 돼요.",
    fields: [],
  },
];
const LAST_STEP = STEPS.length - 1;

// 사용 목적 — 하나만 고르고, 다시 누르면 푼다. 후보는 EXPERIENCE.md Key Flows 의 두 사람(취준생 · 직장인)에 맞췄다.
// A14 에 칸이 없어 서버로 보내지 않는다. 넣기로 하면 백엔드 · PM 확인 뒤 A14 에 칸을 더한다
const PURPOSES = ["취업 준비", "업무 · 업계 동향", "시사 공부", "그 밖에"];

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

/** 보낼 값. 이름 · 아이디는 앞뒤 빈칸을 지운다. 비밀번호는 쓴 그대로 보낸다 (docs/api-screen.md A14) */
function readForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? "").trim(),
    loginId: String(data.get("loginId") ?? "").trim(),
    password: String(data.get("password") ?? ""),
    passwordConfirm: String(data.get("passwordConfirm") ?? ""),
  };
}

/** 모든 칸을 검사한다. 단계마다 그 단계 칸 것만 골라 쓴다 */
function checkFields(
  values: ReturnType<typeof readForm>,
  interests: string[],
): FieldErrors {
  const { name, loginId, password, passwordConfirm } = values;
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
  return errors;
}

const stepOf = (field: Field) =>
  STEPS.findIndex((step) => step.fields.includes(field));

// 가입 — 셸 없이 전체 화면으로 뜬다 (EXPERIENCE.md Information Architecture 가입 행 · Component Patterns 「로그인 · 가입 폼」,
// 프로토타입 v21 AuthPage). 가입하면 바로 로그인된다(A14) — 내 정보를 새 회원으로 바꾸면 next 로 간다.
// 질문을 한 단계씩 넘기고 위 막대가 진행을 보인다 (does.kr 채용 화면 참고)
export function SignupPage() {
  usePageTitle("회원가입");
  const [params] = useSearchParams();
  const next = nextPath(params.get("next"));
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  // 다음에 그린 뒤 옮길 포커스. 숨긴 단계의 칸은 포커스를 받지 못해서 단계를 그린 뒤에 옮긴다
  const focusAfterRender = useRef<Field | "step" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const interestsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = focusAfterRender.current;
    if (!target) return;
    focusAfterRender.current = null;
    const form = formRef.current;
    if (target === "categoryCodes") interestsRef.current?.focus();
    else if (target === "step")
      form
        ?.querySelector<HTMLElement>(`[data-step="${step}"] :is(input, button)`)
        ?.focus();
    else form?.querySelector<HTMLElement>(`[name="${target}"]`)?.focus();
  });

  // 틀린 칸이 있는 첫 단계로 돌아가 그 칸에 포커스한다
  const showFirstError = (errors: FieldErrors) => {
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (!first) return;
    setStep(stepOf(first));
    focusAfterRender.current = first;
  };

  const goTo = (to: number) => {
    setStep(to);
    setFailure(null);
    focusAfterRender.current = "step";
  };

  const mutation = useMutation({
    mutationFn: signUp,
    // 내 정보를 새 회원으로 바꾸면 아래 「이미 로그인했으면」이 next 로 보낸다
    onSuccess: (member) => {
      queryClient.setQueryData(meQuery.queryKey, member);
      snackbar.show("가입을 마쳤어요", "positive");
      // 다음에 홈에 들어오면 처음 가입한 사람 가이드를 띄운다 (Jira 204)
      startOnboarding();
    },
    onError: (error) => {
      const errors = serverFieldErrors(error);
      if (errors) {
        setFieldErrors(errors);
        showFirstError(errors);
      } else {
        setFailure(failureMessage(error));
      }
    },
  });

  if (me.data) return <Navigate to={next} replace />;

  // Enter 와 다음 · 가입하기 버튼이 모두 여기로 온다. 마지막 단계가 아니면 그 단계 칸만 보고 넘어간다
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // SEED 버튼은 로딩 중에도 눌린다. 두 번 보내지 않는다
    if (mutation.isPending) return;
    const values = readForm(event.currentTarget);
    const all = checkFields(values, interests);
    setFailure(null);
    if (step < LAST_STEP) {
      // 이 단계 칸 오류만 바꾼다. 서버가 준 뒤 단계 칸 오류는 그 단계에 가서 보이도록 남긴다
      const errors: FieldErrors = {};
      for (const field of STEPS[step].fields) errors[field] = all[field];
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      const first = FIELD_ORDER.find((field) => errors[field]);
      if (first) focusAfterRender.current = first;
      else goTo(step + 1);
      return;
    }
    setFieldErrors(all);
    if (Object.keys(all).length > 0) {
      showFirstError(all);
      return;
    }
    const { name, loginId, password } = values;
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
        name={field}
        type={input.type}
        autoComplete={input.autoComplete}
        autoCapitalize={field === "loginId" ? "none" : undefined}
        spellCheck={field === "loginId" ? false : undefined}
        placeholder={input.placeholder}
      />
    </TextField>
  );

  // 단계 묶음 — 지금 단계만 보이고, 나타날 때 질문보다 조금 늦게 떠오른다.
  // 숨긴 단계의 칸도 폼에 남아 마지막에 한 번에 보낸다
  const stepPanel = (index: number, children: ReactNode) => (
    <div
      data-step={index}
      hidden={step !== index}
      className="flex flex-col gap-x5 motion-safe:animate-[newlearn-rise_300ms_var(--seed-timing-function-enter)_80ms_both]"
    >
      {children}
    </div>
  );

  const current = STEPS[step];
  // 마지막 사용 목적은 고르지 않아도 가입하기로 끝난다
  const submitLabel = step === LAST_STEP ? "가입하기" : "다음";

  return (
    <div className="flex min-h-dvh flex-col bg-bg-layer-default">
      <FollowCursor />
      <header className="flex h-[60px] shrink-0 items-center px-x5 md:px-x8">
        <Logo height={26} />
        <Link
          to="/"
          aria-label="닫기"
          className="ml-auto flex size-x10 items-center justify-center rounded-r2 text-fg-neutral hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          <IconXmarkLine size={20} aria-hidden />
        </Link>
      </header>
      {/* 질문 띠 — 단계가 바뀌면 번호와 질문이 아래에서 떠오른다 */}
      <section className="bg-bg-brand-solid">
        <div
          key={step}
          className="mx-auto max-w-[640px] px-x5 pt-x12 pb-x10 motion-safe:animate-[newlearn-rise_300ms_var(--seed-timing-function-enter)_both] md:pt-x16 md:pb-x14"
        >
          <p className="t5-bold text-bg-accent-lime tabular-nums">
            {String(step + 1).padStart(2, "0")}.
          </p>
          <h1
            id="signup-title"
            className="t10-bold md:t12-bold mt-x2 text-palette-static-white"
          >
            {current.title}
          </h1>
          <p className="t5-regular mt-x2 text-palette-static-white opacity-80">
            {current.hint}
          </p>
        </div>
      </section>
      <StepProgress step={step + 1} total={STEPS.length} label="가입 진행" />
      {/* 화면 읽기에 단계가 바뀐 것을 알린다 */}
      <p aria-live="polite" className="sr-only">
        {`${STEPS.length}단계 중 ${step + 1}단계, ${current.title}`}
      </p>
      <main className="flex-1">
        <form
          ref={formRef}
          noValidate
          aria-labelledby="signup-title"
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-[640px] flex-col gap-x5 px-x5 pt-x10 pb-x14"
        >
          {stepPanel(
            0,
            textField("name", "이름", {
              autoComplete: "name",
              placeholder: "이름을 입력해 주세요",
            }),
          )}
          {stepPanel(
            1,
            <>
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
            </>,
          )}
          {stepPanel(
            2,
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
            />,
          )}
          {stepPanel(
            3,
            <div
              role="group"
              aria-labelledby="signup-title"
              className="flex flex-wrap gap-x2"
            >
              {PURPOSES.map((item) => {
                const on = purpose === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPurpose(on ? null : item)}
                    className={chipClassName(on)}
                  >
                    {on ? (
                      <IconCheckmarkLine aria-hidden size={16} />
                    ) : (
                      <IconPlusLine
                        aria-hidden
                        size={14}
                        className="text-fg-neutral-subtle"
                      />
                    )}
                    {item}
                  </button>
                );
              })}
            </div>,
          )}
          {failure && (
            <p
              role="alert"
              className="t4-medium rounded-r2 bg-bg-critical-weak px-x4 py-x3 text-fg-critical-contrast"
            >
              {failure}
            </p>
          )}
          <div className="mt-x2 flex gap-x2">
            {step > 0 && (
              <ActionButton
                type="button"
                variant="neutralOutline"
                size="large"
                onClick={() => goTo(step - 1)}
              >
                이전
              </ActionButton>
            )}
            <ActionButton
              type="submit"
              variant="brandSolid"
              size="large"
              loading={step === LAST_STEP && mutation.isPending}
              aria-busy={
                (step === LAST_STEP && mutation.isPending) || undefined
              }
              className="flex-1"
            >
              {submitLabel}
            </ActionButton>
          </div>
          {step === 0 && (
            <AuthSwitch
              question="이미 계정이 있나요?"
              to={loginPath(next)}
              label="로그인"
            />
          )}
        </form>
      </main>
    </div>
  );
}
