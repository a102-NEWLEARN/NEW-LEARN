#!/usr/bin/env bash
# 비밀값을 봉인해 저장소에 넣을 SealedSecret 파일을 만든다 — EC2 에서, sudo 없이, 터미널에서 (값을 물어본다)
# 평문은 화면 · 파일 · 명령 인자(ps)에 남기지 않는다. 남는 것은 ~/sealed/ 의 봉인 파일뿐이다 (컨트롤러만 풀 수 있다)
#
# 쓰는 법 (infra/server/README.md 「봉인한 Secret 만들기」)
#   bash infra/server/seal-secrets.sh basic-auth    관리 화면(/argocd · /grafana) 팝업 계정 하나 → argocd · monitoring 두 곳
#   bash infra/server/seal-secrets.sh db            PostgreSQL 계정 — 비밀번호는 무작위로 만든다(묻지 않음) → data · app 두 곳
#   bash infra/server/seal-secrets.sh ghcr          워커가 GHCR 비공개 이미지를 받을 읽기 토큰 → app · ai 두 곳
#   bash infra/server/seal-secrets.sh argocd-webhook  GitLab 웹훅 토큰 — 무작위로 만들어 봉인한다(묻지 않음) → argocd
#   bash infra/server/seal-secrets.sh mattermost    Argo CD 배포 알림을 받을 Mattermost 들어오는 웹훅 주소 → argocd
#   bash infra/server/seal-secrets.sh pg-backup-s3  DB 주간 백업을 S3 에 올리는 키(올리기만 되는 IAM 사용자) · 버킷 이름 → data
#   bash infra/server/seal-secrets.sh gms           AI 워커가 SSAFY GMS 를 부를 키 — 봉인 전에 그 키로 GMS 를 불러 본다 → ai
#   bash infra/server/seal-secrets.sh internal-api  직원용 문(/internal/v1) 출입증 — 워커 · 배치 키를 무작위로 만든다(묻지 않음) → app 에 둘 · ai 에 워커 키
# 만든 파일은 관리자 PC 로 가져와 저장소의 자리에 넣고 커밋한다 (봉인 파일은 저장소에 둬도 된다)
#   ssh <EC2> 'cat ~/sealed/sealed-basic-auth-argocd.yaml' > infra/k8s/admin-ui/sealed-basic-auth-argocd.yaml
# 봉인은 Secret 이름 · 네임스페이스에 묶인다(strict). 다른 이름 · 네임스페이스로 옮기면 못 푼다
set -euo pipefail

OUT="$HOME/sealed"
CONTROLLER_NS=sealed-secrets # infra/k8s/apps/templates/sealed-secrets.yaml

usage() { sed -n '5,13p' "$0" | sed 's/^# *//'; }
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
  argocd-webhook)
    # GitLab 웹훅의 Secret token — Argo CD 는 X-Gitlab-Token 머리가 이 값과 같은 요청만 받는다 (Argo CD 문서 「Git Webhook Configuration」)
    # 봉인 파일이 있으면 건너뛴다 — 새로 만들면 GitLab 에 넣은 값과 어긋난다. 바꿀 때는 파일을 지우고 돌린 뒤 GitLab 값도 바꾼다
    f="$OUT/sealed-argocd-webhook.yaml"
    if [ -e "$f" ]; then
      echo "이미 있다 — 건너뛴다: $f"
      exit 0
    fi
    token="$(openssl rand -hex 32)"  # secret-scan:allow — 값이 아니라 무작위로 만드는 명령
    [ "${#token}" -eq 64 ] || { echo "❌ 토큰을 만들지 못했다" >&2; exit 1; }
    # Argo CD 는 이름표 app.kubernetes.io/part-of=argocd 가 있는 Secret 만 참조로 읽는다
    # 이름표가 없으면 참조 글자 「$argocd-webhook:gitlab」 그대로가 토큰이 된다 — 봉인 전에 붙인다 (Argo CD util/settings)
    printf '%s' "$token" \
      | kubectl create secret generic argocd-webhook -n argocd --from-file=gitlab=/dev/stdin --dry-run=client -o yaml \
      | kubectl label --local -f - app.kubernetes.io/part-of=argocd -o yaml \
      | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"$f"
    unset token
    echo "봉인: $f"
    # GitLab 에 넣을 값은 봉인 파일이 클러스터에 풀린 뒤 사람 터미널에서 본다 — 저장소 · 채팅에 붙이지 않는다
    echo "GitLab 웹훅을 만들 때: kubectl -n argocd get secret argocd-webhook -o jsonpath='{.data.gitlab}' | base64 -d; echo"
    ;;
  mattermost)
    need_tty
    # Argo CD 배포 알림이 갈 Mattermost 채널의 들어오는 웹훅 주소 — 주소만 있으면 누구나 그 채널에 글을 쓸 수 있다
    # 알림 컨트롤러가 이 이름 · 키를 읽는다 (argocd-values.prod.yaml 의 notifications.notifiers 「$mattermost-url」)
    echo "Mattermost › 통합 › 들어오는 웹훅 — 배포 알림 전용 채널에 만든 주소"
    read -rsp "웹훅 주소 (https://…/hooks/…, 화면에 안 보인다): " url
    echo
    url="$(printf '%s' "$url" | LC_ALL=C tr -cd 'A-Za-z0-9:/._-')"
    [[ "$url" =~ ^https://[A-Za-z0-9.-]+/hooks/[A-Za-z0-9]+$ ]] || { echo "❌ https://<서버>/hooks/<키> 모양이 아니다" >&2; exit 2; }
    # 봉인하기 전에 이 주소로 채널에 연결 시험 글을 하나 쓴다 — 주소는 curl 설정을 표준 입력으로 넘긴다(ps 에 안 보임)
    code="$(printf 'url = "%s"\n' "$url" \
      | curl -s -o /dev/null -w '%{http_code}' -K - -H 'Content-Type: application/json' \
          --data '{"text": "Argo CD 배포 알림을 이 채널로 보냅니다 (연결 시험)"}')"
    [ "$code" = 200 ] || { unset url; echo "❌ 이 주소로 글을 못 썼다 (HTTP $code) — 주소 · 채널 확인" >&2; exit 1; }
    echo "채널에 연결 시험 글을 썼다 (HTTP 200)"
    printf '%s' "$url" | seal argocd-notifications-secret argocd mattermost-url "$OUT/sealed-argocd-notifications.yaml"
    unset url
    ;;
  pg-backup-s3)
    need_tty
    # DB 주간 백업을 S3 에 올리는 키 — 올리기만 되는 IAM 사용자(infra/terraform/iam/pg-backup-uploader-policy.json, infra/README.md)
    # 주간 CronJob 이 이 이름 · 키를 읽는다 (infra/k8s/services/data/postgres-backup.yaml 의 postgres-backup-s3)
    echo "버킷 이름은 관리자 PC 의 terraform output pg_backup_bucket, 키는 IAM › 사용자 newlearn-pg-backup-uploader › 보안 자격 증명"
    read -rp "버킷 이름: " bucket
    [[ "$bucket" =~ ^newlearn-pg-backup-[a-z0-9-]{4,40}$ ]] || { echo "❌ newlearn-pg-backup-<접미사> 모양이 아니다" >&2; exit 2; }
    read -rsp "액세스 키 ID (화면에 안 보인다): " key_id
    echo
    read -rsp "비밀 액세스 키 (화면에 안 보인다): " secret
    echo
    [[ "$key_id" =~ ^AKIA[A-Z0-9]{16}$ ]] || { unset key_id secret; echo "❌ 액세스 키 ID 모양이 아니다 (AKIA 로 시작하는 20자)" >&2; exit 2; }
    [ "${#secret}" -eq 40 ] || { unset key_id secret; echo "❌ 비밀 액세스 키는 40자다" >&2; exit 2; }
    # 키 셋을 한 Secret 으로 — printf 는 셸 안에서 돌아 ps 에 값이 안 보인다
    printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nS3_BUCKET=%s\n' "$key_id" "$secret" "$bucket" \
      | kubectl create secret generic pg-backup-s3 -n data --from-env-file=/dev/stdin --dry-run=client -o yaml \
      | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"$OUT/sealed-pg-backup-s3.yaml"
    unset key_id secret
    echo "봉인: $OUT/sealed-pg-backup-s3.yaml — 관리자 PC 로 가져와 infra/k8s/services/data/sealed-pg-backup-s3.yaml 로"
    ;;
  gms)
    need_tty
    # AI 워커가 SSAFY GMS(OpenAI 호환 API)를 부를 키 — ai Deployment 의 GMS_API_KEY 가 이 이름 · 키를 읽는다
    # 주소는 비밀이 아니라 매니페스트(infra/k8s/services/ai/ai.yaml)에 있다. 같은 값을 두 곳에 적지 않게 클러스터에 반영된 값을 읽는다
    base="$(kubectl -n ai get deploy ai -o jsonpath='{.spec.template.spec.containers[?(@.name=="ai")].env[?(@.name=="GMS_BASE_URL")].value}' 2>/dev/null || true)"
    [[ "$base" =~ ^https://[A-Za-z0-9./_-]+$ ]] || { echo "❌ ai Deployment 에 GMS_BASE_URL 이 없다 — ai.yaml 의 주소가 클러스터에 반영된 뒤 돌린다" >&2; exit 1; }
    echo "GMS 주소: $base"
    read -rsp "GMS 키 (화면에 안 보인다): " key
    echo
    # 복사해 붙이면 눈에 안 보이는 공백이 따라온다 — 키에 쓰는 글자를 몰라 공백만 지운다
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -n "$key" ] || { echo "❌ 키가 비었다" >&2; exit 2; }
    # 봉인하기 전에 이 키로 모델 목록(GET /models — 답을 만드는 호출이 아니다)을 불러 200 인지 본다
    # 키는 curl 설정을 표준 입력으로 넘긴다(ps 에 안 보임)
    code="$(printf 'header = "Authorization: Bearer %s"\n' "$key" \
      | curl -s -o /dev/null -w '%{http_code}' --max-time 15 -K - "$base/models" || true)"
    [ "$code" = 200 ] || { unset key; echo "❌ 이 키로 GMS 를 못 불렀다 (HTTP $code) — 키 확인" >&2; exit 1; }
    echo "GMS 키 확인 (HTTP 200)"
    printf '%s' "$key" | seal gms-api ai GMS_API_KEY "$OUT/sealed-gms-api.yaml"
    unset key
    echo "관리자 PC 로 가져와 infra/k8s/services/ai/sealed-gms-api.yaml 로"
    ;;
  internal-api)
    # 직원용 문(/internal/v1) 출입증 — backend 는 X-Internal-Key 머리를 두 키와 비교한다. 워커 키는 W1(분석 결과), 배치 키는 B1(기사 넣기)만 연다 (docs/api-internal.md)
    # 봉인 파일이 있으면 건너뛴다 — 한쪽만 새로 만들면 backend 와 워커의 키가 어긋난다. 바꿀 때는 두 파일을 지우고 돌려 둘 다 커밋한다
    files=("$OUT/sealed-internal-api-app.yaml" "$OUT/sealed-internal-api-ai.yaml")
    if [ -e "${files[0]}" ] || [ -e "${files[1]}" ]; then
      echo "이미 있다 — 건너뛴다: ${files[*]}"
      exit 0
    fi
    worker="$(openssl rand -hex 32)"  # secret-scan:allow — 값이 아니라 무작위로 만드는 명령
    batch="$(openssl rand -hex 32)"  # secret-scan:allow — 값이 아니라 무작위로 만드는 명령
    [[ "${#worker}" -eq 64 && "${#batch}" -eq 64 ]] || { echo "❌ 키를 만들지 못했다" >&2; exit 1; }
    # 봉인하다 멈추면 반쪽 파일을 지운다 — 남으면 다시 돌릴 때 건너뛴다
    trap 'rm -f "${files[@]}"' ERR
    # app 에는 둘 다 backend 가 읽는 이름으로, ai 에는 워커 키만 워커가 읽는 이름으로 — 봉인은 네임스페이스에 묶여 따로 봉인한다
    printf 'INTERNAL_WORKER_KEY=%s\nINTERNAL_BATCH_KEY=%s\n' "$worker" "$batch" \
      | kubectl create secret generic internal-api -n app --from-env-file=/dev/stdin --dry-run=client -o yaml \
      | kubeseal --controller-namespace "$CONTROLLER_NS" --format yaml >"${files[0]}"
    echo "봉인: ${files[0]}"
    printf '%s' "$worker" | seal internal-api ai INTERNAL_API_KEY "${files[1]}"
    trap - ERR
    unset worker batch
    echo "관리자 PC 로 가져와 infra/k8s/services/app/sealed-internal-api.yaml · infra/k8s/services/ai/sealed-internal-api.yaml 로 (두 kustomization.yaml 의 resources 에도 한 줄씩)"
    # env 는 컨테이너가 뜰 때만 읽는다 — 봉인 파일만 넣는 MR 은 Pod 를 바꾸지 않는다
    echo "Secret 이 풀린 뒤: kubectl -n app rollout restart deploy/backend && kubectl -n ai rollout restart deploy/ai"
    ;;
  *)
    usage
    exit 2
    ;;
esac
