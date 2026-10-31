#!/usr/bin/env bash
# 경보 규칙 시험 — infra/k8s/alerts/rules.yaml 을 promtool 로 검사하고(check) 단위 시험을 돌린다(test) (Jira S15P31A102-139)
# .claude/stack.md §3 의 infra_LINT 가 check 를, infra_TEST 가 test 를 부른다. 시험은 옆의 alert_rules_test.yaml
#
# rules.yaml 은 PrometheusRule(쿠버네티스 매니페스트)이라 promtool 이 바로 못 읽는다 — spec: 아래를 두 칸 내어
# 규칙 파일 모양(groups:)으로 임시 폴더에 꺼낸 뒤 그 폴더에서 돌린다
#
# promtool 은 클러스터 Prometheus 와 같은 판을 쓴다 — 2026-10-30 v3.15.0(차트 kube-prometheus-stack 92.10.1)
#   로컬: PATH 에 둔다(docs/dev-environment.md) — 판이 다르면 실패. CI: GitHub 공식 릴리스를 받아 sha256 을 확인하고 /ci-cache 에 둔다
#   잡 이미지(hashicorp/terraform)에 없고, .gitlab-ci.yml 에서 받게 하면 그 파일이 바뀌어 운영 이미지 굽기까지 다시 돌아서 여기서 받는다
set -euo pipefail

PROM_VERSION=3.15.0
PROM_TGZ_SHA256=2a542df32eac02ee17b9d844fb2aa1de00dafa5476579ba8a3ba862e9d572ea0 # 릴리스 sha256sums.txt 의 linux-amd64.tar.gz
PROMTOOL_SHA256=c736d55d3ccd959fe48329965fb5cb671d45585a9483954766448035100ff75c  # 위 tar.gz 를 확인한 뒤 꺼낸 promtool (2026-10-30 잼)

MODE="${1:-}"
case "$MODE" in
  check | test) ;;
  *) echo "❌ check 또는 test 를 준다" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 함수 · $( ) 로 감싸지 않는다 — bash 는 $( ) 안에서 set -e 를 꺼서, sha256 이 틀려도 멈추지 않고 캐시에 넣는다
if command -v promtool >/dev/null 2>&1; then
  # 판이 다르면 range 경계 · 끊김 처리가 달라 CI 와 결과가 갈릴 수 있다
  have="$(promtool --version 2>&1 | head -n 1)"
  case "$have" in
    "promtool, version $PROM_VERSION "*) ;;
    *) echo "❌ promtool 판이 다르다 — 필요 $PROM_VERSION, 있음: $have" >&2; exit 1 ;;
  esac
  PROMTOOL=promtool
elif [ -z "${CI:-}" ]; then
  echo "❌ promtool $PROM_VERSION 이 PATH 에 없다 — docs/dev-environment.md 「내 영역을 호스트에서 띄울 때」" >&2
  exit 1
else
  # /ci-cache 는 팀원 MR 잡도 쓰는 공용 디스크다 — 캐시에서 꺼낸 것도 임시 폴더로 복사해 sha256 을 본 뒤 그 복사본을 돌린다
  PROMTOOL="$TMP/promtool"
  cache="/ci-cache/promtool/$PROM_VERSION/promtool"
  if [ -f "$cache" ]; then
    cp "$cache" "$PROMTOOL"
  fi
  if ! echo "$PROMTOOL_SHA256  $PROMTOOL" | sha256sum -c - >/dev/null 2>&1; then
    name="prometheus-$PROM_VERSION.linux-amd64"
    wget -q -O "$TMP/p.tgz" "https://github.com/prometheus/prometheus/releases/download/v$PROM_VERSION/$name.tar.gz"
    echo "$PROM_TGZ_SHA256  $TMP/p.tgz" | sha256sum -c -
    tar -xzf "$TMP/p.tgz" -C "$TMP" "$name/promtool"
    mv -f "$TMP/$name/promtool" "$PROMTOOL"
    rm -r "$TMP/p.tgz" "$TMP/$name"
    echo "$PROMTOOL_SHA256  $PROMTOOL" | sha256sum -c -
    # 다른 잡이 같은 캐시를 동시에 채워도 반쯤 쓴 파일을 보지 않게 — 같은 폴더의 겹치지 않는 임시 이름으로 복사한 뒤 이름만 바꾼다
    mkdir -p "${cache%/*}"
    part="$(mktemp "$cache.XXXXXX")"
    cp "$PROMTOOL" "$part"
    mv -f "$part" "$cache"
  fi
  chmod +x "$PROMTOOL"
fi

awk 'f { sub(/^  /, ""); print } /^spec:/ { f = 1 }' "$HERE/../k8s/alerts/rules.yaml" > "$TMP/rules.yaml"
if [ "$(head -n 1 "$TMP/rules.yaml")" != "groups:" ]; then
  echo "❌ rules.yaml 에서 spec.groups 를 못 꺼냈다 — spec: 바로 아래가 groups: 여야 한다" >&2
  exit 1
fi

cd "$TMP"
case "$MODE" in
  check) "$PROMTOOL" check rules --lint-fatal rules.yaml ;;
  test)
    cp "$HERE/alert_rules_test.yaml" .
    "$PROMTOOL" test rules alert_rules_test.yaml
    ;;
esac
