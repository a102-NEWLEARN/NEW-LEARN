import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { signupPath } from "@/lib/login-path";

/** 손님이 무엇을 눌렀나 — 창의 설명 한 줄이 이것에 따라 다르다 */
export type SignupPromptReason = "bookmark" | "interest" | "categories";

const TITLE = "가입하면 더 편하게 이용할 수 있어요";

const DESCRIPTION: Record<SignupPromptReason, string> = {
  bookmark: "마음에 드는 기사를 나의 뉴스함에 모아 볼 수 있어요.",
  interest: "관심 이슈로 저장하면 홈 추천에서 먼저 보여 드려요.",
  categories: "관심 분야를 고르면 그 분야 이슈부터 추천해 드려요.",
};

/**
 * 가입 권유 창 — 손님이 회원만 하는 저장(북마크 · 관심 이슈 별 · 관심사 편집)을 누르면 띄운다
 * (EXPERIENCE.md Component Patterns 「가입 권유 창」, 2026-11-13 Jira 205). 마이페이지의 확인 창(ConfirmDialog)과 같은 모양이다.
 * *가입하기* 는 지금 화면으로 돌아오는 가입 화면으로 간다. *닫기* · Esc 는 창만 닫고, 포커스는 누른 버튼으로 돌아간다.
 * 계정이 있는 손님은 헤더 *로그인* 이나 가입 화면 첫 단계의 「이미 계정이 있나요?」로 간다.
 * 창은 처음 열 때 붙인다 — 기사 행마다 버튼이 있어서 열지도 않은 창을 행마다 그려 두지 않는다. 한 번 붙이면 닫혀도 둔다
 */
export function useSignupPrompt(reason: SignupPromptReason) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  return {
    /**
     * 연다. 누른 버튼을 넘기면 먼저 포커스를 준다 — Safari · iOS 는 눌러도 버튼에 포커스를 주지 않아서,
     * 창이 닫힐 때 돌아갈 자리(열기 전 포커스)가 body 가 된다 (리뷰, Jira 205. ArticlePage 크게 보기와 같다)
     */
    open(trigger?: HTMLElement | null) {
      trigger?.focus();
      setOpen(true);
      setOpened(true);
    },
    dialog: opened && (
      <ConfirmDialog
        open={open}
        title={TITLE}
        description={DESCRIPTION[reason]}
        cancelLabel="닫기"
        confirmLabel="가입하기"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          navigate(signupPath(pathname + search + hash));
        }}
      />
    ),
  };
}
