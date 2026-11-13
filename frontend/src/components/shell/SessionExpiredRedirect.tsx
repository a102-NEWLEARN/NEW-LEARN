import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { meQuery } from "@/api/members";
import { loginPath } from "@/lib/login-path";

// 셸이 떠 있는 동안 회원이던 사람의 세션이 끝나면 로그인 화면으로 보내고, 로그인하면 이 주소로 돌아온다
// (EXPERIENCE.md 이동 규칙, 2026-11-13 Jira 205). 어느 조회 · 저장이 401 을 받든 QueryClient 가 내 정보를 손님(null)으로
// 바꾼다(query-client.ts) — 그 바뀜을 여기서 본다. 처음부터 손님이면 아무 데도 보내지 않는다 — 손님도 둘러보기는 다 한다.
// 로그아웃은 먼저 랜딩으로 옮긴 뒤 내 정보를 비워서(useLogout) 셸이 내려간 뒤라 여기에 걸리지 않는다
export function SessionExpiredRedirect() {
  const me = useQuery(meQuery);
  const { pathname, search, hash } = useLocation();
  // 이 셸에서 회원을 본 적이 있나. 렌더 중에 맞춘다 — 회원을 본 그 렌더부터 바로 알아야 해서 효과로 미루지 않는다
  const [wasMember, setWasMember] = useState(false);
  if (me.data && !wasMember) setWasMember(true);

  if (wasMember && me.data === null)
    return <Navigate to={loginPath(pathname + search + hash)} replace />;
  return null;
}
