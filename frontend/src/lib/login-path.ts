// 로그인 화면 주소와 로그인을 마친 뒤 갈 곳 (EXPERIENCE.md 이동 규칙)
const HOME = "/home";

/** 로그인을 마치면 next 로 돌아오는 로그인 화면 주소. 읽기 좋게 / 는 그대로 둔다 */
export function loginPath(next: string) {
  return `/login?next=${encodeNext(next)}`;
}

/** 가입을 마치면 next 로 돌아오는 가입 화면 주소. 로그인 ↔ 가입을 오가도 돌아올 곳을 잃지 않는다 */
export function signupPath(next: string) {
  return `/signup?next=${encodeNext(next)}`;
}

function encodeNext(next: string) {
  return encodeURIComponent(next).replaceAll("%2F", "/");
}

/**
 * 로그인을 마친 뒤 갈 곳. 이 사이트 안의 주소만 받는다 — 주소창에 다른 사이트(`https://…` · `//…`)를
 * 넣어 로그인한 사람을 밖으로 보내지 못하게 한다. 없거나 로그인 · 가입 화면이면 홈으로 간다
 */
export function nextPath(raw: string | null) {
  if (!raw?.startsWith("/")) return HOME;
  const url = new URL(raw, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.pathname === "/login" ||
    url.pathname === "/signup"
  )
    return HOME;
  return url.pathname + url.search + url.hash;
}

// 손님은 못 여는 회원 화면 (routes.tsx 의 RequireMember)
const MEMBER_PAGES = new Set(["/me", "/bookmarks"]);

/**
 * 로그인하지 않고 갈 곳 — 로그인 화면의 *로그인 없이 시작하기*, 로그인 · 가입 화면의 닫기 (Jira 205).
 * next 와 같되 회원 화면이면 홈이다. 회원 화면으로 보내면 다시 로그인 화면으로 돌아온다
 */
export function guestPath(raw: string | null) {
  const path = nextPath(raw);
  const { pathname } = new URL(path, window.location.origin);
  return MEMBER_PAGES.has(pathname) ? HOME : path;
}
