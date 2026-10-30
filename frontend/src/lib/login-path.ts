// 로그인 화면 주소와 로그인을 마친 뒤 갈 곳 (EXPERIENCE.md 이동 규칙)
const HOME = "/home";

/** 로그인을 마치면 next 로 돌아오는 로그인 화면 주소. 읽기 좋게 / 는 그대로 둔다 */
export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next).replaceAll("%2F", "/")}`;
}

/**
 * 로그인을 마친 뒤 갈 곳. 이 사이트 안의 주소만 받는다 — 주소창에 다른 사이트(`https://…` · `//…`)를
 * 넣어 로그인한 사람을 밖으로 보내지 못하게 한다. 없거나 로그인 화면 자신이면 홈으로 간다
 */
export function nextPath(raw: string | null) {
  if (!raw?.startsWith("/")) return HOME;
  const url = new URL(raw, window.location.origin);
  if (url.origin !== window.location.origin || url.pathname === "/login")
    return HOME;
  return url.pathname + url.search + url.hash;
}
