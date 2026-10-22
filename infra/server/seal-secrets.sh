#!/usr/bin/env bash
# 비밀값을 봉인해 저장소에 넣을 SealedSecret 파일을 만든다 — EC2 에서, sudo 없이, 터미널에서 (값을 물어본다)
# 평문은 화면 · 파일 · 명령 인자(ps)에 남기지 않는다. 남는 것은 ~/sealed/ 의 봉인 파일뿐이다 (컨트롤러만 풀 수 있다)
#
# 쓰는 법 (infra/server/README.md 「봉인한 Secret 만들기」)
#   bash infra/server/seal-secrets.sh basic-auth    관리 화면(/argocd · /grafana) 팝업 계정 하나 → argocd · monitoring 두 곳
#   bash infra/server/seal-secrets.sh db            PostgreSQL 계정 — 비밀번호는 무작위로 만든다(묻지 않음) → data · app 두 곳
#   bash infra/server/seal-secrets.sh ghcr          워커가 GHCR 비공개 이미지를 받을 읽기 토큰 → app · ai 두 곳
# 만든 파일은 관리자 PC 로 가져와 저장소의 자리에 넣고 커밋한다 (봉인 파일은 저장소에 둬도 된다)
#   ssh <EC2> 'cat ~/sealed/sealed-basic-auth-argocd.yaml' > infra/k8s/admin-ui/sealed-basic-auth-argocd.yaml
# 봉인은 Secret 이름 · 네임스페이스에 묶인다(strict). 다른 이름 · 네임스페이스로 옮기면 못 푼다
set -euo pipefail

OUT="$HOME/sealed"
CONTROLLER_NS=sealed-secrets # infra/k8s/apps/templates/sealed-secrets.yaml

usage() { sed -n '5,8p' "$0" | sed 's/^# *//'; }
need_tty() { [ -t 0 ] || { echo "❌ 값을 물어야 한다 — 터미널에서 직접 돌린다 (ssh -t)" >&2; exit 1; }; }

[ "$(id -u)" -ne 0 ] || { echo "❌ sudo 없이 돌린다" >&2; exit 1; }
for c in kubectl kubeseal openssl; do
  command -v "$c" >/dev/null || { echo "❌ $c 가 없다 — infra/server/bootstrap-argocd.sh 를 먼저 돌린다" >&2; exit 1; }
done
install -d -m 0700 "$OUT"

# 표준 입력의 값을 Secret 하나로 만들어 바로 봉인한다 — 이름 네임스페이스 키 출력파일
seal() {
  kubectl create secret generic "$1" -n "$2" --from-file="$3"=/dev/stdin --dry-run=client -o yaml \
    | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"$4"
  echo "봉인: $4"
}

case "${1:-}" in
  basic-auth)
    need_tty
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
  db)
    # PostgreSQL 은 처음 초기화할 때만 비밀번호를 읽는다 — 다시 만들면 DB 와 어긋난다. 봉인 파일이 있으면 건너뛴다
    # 다시 만들어야 하면(DB 를 새로 만들 때만) ~/sealed/sealed-postgres-auth-*.yaml 을 지우고 돌린다
    files=("$OUT/sealed-postgres-auth-data.yaml" "$OUT/sealed-postgres-auth-app.yaml")
    if [ -e "${files[0]}" ] || [ -e "${files[1]}" ]; then
      echo "이미 있다 — 건너뛴다: ${files[*]}"
      exit 0
    fi
    # DB 이름 · 사용자는 비밀이 아니다(.env.example 과 같다). 비밀번호만 무작위 32자 — 화면 · 파일에 평문을 남기지 않는다
    pw="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)"
    [ "${#pw}" -eq 32 ] || { echo "❌ 비밀번호를 만들지 못했다" >&2; exit 1; }
    env_lines="$(printf 'POSTGRES_DB=newlearn\nPOSTGRES_USER=newlearn\nPOSTGRES_PASSWORD=%s\n' "$pw")"
    unset pw
    # 같은 값을 DB(data) 와 backend(app) 네임스페이스에 따로 봉인한다 — 봉인은 네임스페이스에 묶인다
    for ns in data app; do
      printf '%s\n' "$env_lines" \
        | kubectl create secret generic postgres-auth -n "$ns" --from-env-file=/dev/stdin --dry-run=client -o yaml \
        | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"$OUT/sealed-postgres-auth-$ns.yaml"
      echo "봉인: $OUT/sealed-postgres-auth-$ns.yaml"
    done
    unset env_lines
    ;;
  ghcr)
    need_tty
    # 이미지 창고(GHCR)는 인프라 담당 개인 계정 아래 비공개다 (SSOT 6절 「배포 흐름」, .gitlab-ci.yml 의 IMAGE_PREFIX)
    echo "GitHub › Settings › Developer settings › Personal access tokens › Tokens (classic) — read:packages 하나만, 만료 2026-11-30"
    read -rp "GitHub 사용자 이름 (이미지 창고 주인): " gh_user
    # 복사해 붙이면 눈에 안 보이는 공백(줄바꿈 없는 공백 등)이 따라온다 — 이름 · 토큰에 쓸 수 있는 글자만 남긴다 (2026-10-22 겪음)
    gh_user="$(printf '%s' "$gh_user" | LC_ALL=C tr -cd 'A-Za-z0-9-')"
    [[ "$gh_user" =~ ^[A-Za-z0-9-]{1,39}$ ]] || { echo "❌ GitHub 사용자 이름 모양이 아니다" >&2; exit 2; }
    echo "사용자 이름: $gh_user"
    read -rsp "토큰 (ghp_…, 화면에 안 보인다): " gh_token
    echo
    gh_token="$(printf '%s' "$gh_token" | LC_ALL=C tr -cd 'A-Za-z0-9_')"  # secret-scan:allow — 값이 아니라 변수
    [[ "$gh_token" =~ ^ghp_[A-Za-z0-9]{30,}$ ]] || { echo "❌ classic 토큰(ghp_…) 모양이 아니다 — GHCR 은 fine-grained 토큰을 받지 않는다" >&2; exit 2; }
    # 봉인하기 전에 이 토큰으로 backend 이미지를 받을 수 있는지 본다 — 계정은 curl 설정을 표준 입력으로 넘긴다(ps 에 안 보임)
    code="$(printf 'user = "%s:%s"\n' "$gh_user" "$gh_token" \
      | curl -s -o /dev/null -w '%{http_code}' -K - "https://ghcr.io/token?scope=repository:$gh_user/newlearn-backend:pull&service=ghcr.io")"
    [ "$code" = 200 ] || { echo "❌ 이 토큰으로 GHCR 받기 권한을 못 얻었다 (HTTP $code) — 범위 read:packages · 사용자 이름 확인" >&2; exit 1; }
    echo "GHCR 받기 권한 확인 (HTTP 200)"
    auth="$(printf '%s:%s' "$gh_user" "$gh_token" | base64 -w0)"
    config="$(printf '{"auths":{"ghcr.io":{"username":"%s","password":"%s","auth":"%s"}}}' "$gh_user" "$gh_token" "$auth")"
    unset gh_token auth
    for ns in app ai; do
      printf '%s' "$config" \
        | kubectl create secret generic ghcr-pull -n "$ns" --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=/dev/stdin --dry-run=client -o yaml \
        | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"$OUT/sealed-ghcr-pull-$ns.yaml"
      echo "봉인: $OUT/sealed-ghcr-pull-$ns.yaml"
    done
    unset config
    ;;
  *)
    usage
    exit 2
    ;;
esac
