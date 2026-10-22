#!/usr/bin/env bash
# 비밀값을 봉인해 저장소에 넣을 SealedSecret 파일을 만든다 — EC2 에서, sudo 없이, 터미널에서 (값을 물어본다)
# 평문은 화면 · 파일 · 명령 인자(ps)에 남기지 않는다. 남는 것은 ~/sealed/ 의 봉인 파일뿐이다 (컨트롤러만 풀 수 있다)
#
# 쓰는 법 (infra/server/README.md 「봉인한 Secret 만들기」)
#   bash infra/server/seal-secrets.sh basic-auth    관리 화면(/argocd · /grafana) 팝업 계정 하나 → argocd · monitoring 두 곳
# 만든 파일은 관리자 PC 로 가져와 저장소의 자리에 넣고 커밋한다 (봉인 파일은 저장소에 둬도 된다)
#   ssh <EC2> 'cat ~/sealed/sealed-basic-auth-argocd.yaml' > infra/k8s/admin-ui/sealed-basic-auth-argocd.yaml
# 봉인은 Secret 이름 · 네임스페이스에 묶인다(strict). 다른 이름 · 네임스페이스로 옮기면 못 푼다
set -euo pipefail

OUT="$HOME/sealed"
CONTROLLER_NS=sealed-secrets # infra/k8s/apps/templates/sealed-secrets.yaml

usage() { sed -n '5,6p' "$0" | sed 's/^# *//'; }

[ "$(id -u)" -ne 0 ] || { echo "❌ sudo 없이 돌린다" >&2; exit 1; }
for c in kubectl kubeseal openssl; do
  command -v "$c" >/dev/null || { echo "❌ $c 가 없다 — infra/server/bootstrap-argocd.sh 를 먼저 돌린다" >&2; exit 1; }
done
[ -t 0 ] || { echo "❌ 값을 물어야 한다 — 터미널에서 직접 돌린다 (ssh -t)" >&2; exit 1; }
install -d -m 0700 "$OUT"

# 표준 입력의 값을 Secret 하나로 만들어 바로 봉인한다 — 이름 네임스페이스 키 출력파일
seal() {
  kubectl create secret generic "$1" -n "$2" --from-file="$3"=/dev/stdin --dry-run=client -o yaml \
    | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"$4"
  echo "봉인: $4"
}

case "${1:-}" in
  basic-auth)
    read -rp "팝업 아이디 (영문 소문자로 시작, 3~32자): " user
    [[ "$user" =~ ^[a-z][a-z0-9_-]{2,31}$ ]] || { echo "❌ 아이디 모양이 아니다" >&2; exit 2; }
    read -rsp "팝업 비밀번호 (16자 이상, 화면에 안 보인다): " pw
    echo
    read -rsp "한 번 더: " pw2
    echo
    [ "$pw" = "$pw2" ] || { echo "❌ 두 번이 다르다" >&2; exit 2; }
    [ "${#pw}" -ge 16 ] || { echo "❌ 16자 이상으로 — Envoy 기본 인증은 SHA1 해시만 받아 짧으면 풀리기 쉽다" >&2; exit 2; }
    # Envoy Gateway 는 htpasswd 의 SHA 형식만 받는다 — {SHA} + base64(SHA1(비밀번호)) (Envoy Gateway API BasicAuth)
    # printf 는 셸 안 명령이라 ps 에 안 보이고, openssl 은 표준 입력으로 받는다
    line="$user:{SHA}$(printf '%s' "$pw" | openssl dgst -binary -sha1 | openssl base64 -A)"
    unset pw pw2
    for ns in argocd monitoring; do
      printf '%s\n' "$line" | seal basic-auth "$ns" .htpasswd "$OUT/sealed-basic-auth-$ns.yaml"
    done
    unset line
    echo "아이디 「$user」 — 팀에 알릴 때 비밀번호는 저장소 · 채팅이 아닌 곳으로"
    ;;
  *)
    usage
    exit 2
    ;;
esac
