import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation, useOutletContext } from "react-router";
import { meQuery } from "@/api/members";
import { loginPath } from "@/lib/login-path";

// 손님은 로그인부터 한다 — 랜딩 밖 화면을 손님이 열면 로그인 화면으로 보내고, 로그인하면 이 주소로 돌아온다
// (EXPERIENCE.md 이동 규칙. 팀 확인 남음). A17 이 손님(401) 말고 다른 오류로 실패하면 막지 않는다 —
// 손님인지 모르는데 로그인을 시킬 수는 없고, 화면은 저마다 실패한 자리에 안내를 띄운다
export function RequireMember() {
  const me = useQuery(meQuery);
  const { pathname, search, hash } = useLocation();
  // 셸이 화면에 건네는 일(useShell)을 가로막지 않고 그대로 넘긴다
  const shell = useOutletContext();

  if (me.data === null)
    return <Navigate to={loginPath(pathname + search + hash)} replace />;
  // 손님인지 처음 알아보는 동안에는 화면을 그리지 않는다. 손님에게 앱 화면이 잠깐 보였다 사라지지 않게.
  // A17 이 한 번 실패한 뒤 화면이 다시 부를 때는 그대로 둔다 — 그때도 비우면 화면이 내렸다 올라오며 또 부르기를 되풀이한다
  if (me.isPending && me.errorUpdateCount === 0) return null;
  return <Outlet context={shell} />;
}
