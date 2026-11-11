#!/usr/bin/env bash
# Alloy 책갈피(읽은 위치)를 컨테이너 안 /tmp/alloy 에서 서버 디스크 /var/lib/newlearn/alloy 로 한 번 옮긴다 (Jira S15P31A102-192)
# alloy-values.yaml 의 storagePath 를 서버 디스크로 바꾼 값을 helm 으로 올리기 *전에* 돌린다
#   안 옮기고 올리면 새 Pod 가 빈 책갈피로 떠 노드 로그를 처음부터 다시 보낸다 — Loki 상한(429)에 걸려 새 로그가 늦게 들어가고
#   버린 로그 경보가 울린다(infra/server/logging.md 「겪은 것」)
#
# 쓰는 법 (순서는 infra/server/logging.md 3절) — EC2 에서, sudo 없이
#   bash infra/server/alloy-positions-seed.sh
# 마지막 줄에 「책갈피 옮김 끝 … HH:MM 까지」가 나와야 helm upgrade alloy 를 친다. 그 시각(첫 노드를 꺼낸 때 + 30분)이 지났으면 다시 돌린다 —
#   옮긴 뒤 새 Pod 가 뜰 때까지의 줄은 한 번 더 보내는데, 1시간을 넘기면 Loki 가 받는 창(스트림 최고 시각 - 1시간) 밖이라
#   400 으로 거절한다. 새 줄은 들어가지만 Alloy 가 그 묶음을 「버림」으로 세어 버린 로그 경보가 거짓으로 울린다
# 다시 돌려도 된다 — 같은 자리에 덮어쓴다. 이미 서버 디스크를 쓰고 있으면 옮길 것이 없어 끝 표시 없이 멈춘다
# 미리 보기: DRY_RUN=1 bash infra/server/alloy-positions-seed.sh — 책갈피를 꺼내 보고 임시 Pod 를 API 서버에 검사만 받는다(만들지 않음)
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
first_taken=""

NS=monitoring
SRC=/tmp/alloy/loki.source.file.pods/positions.yml
# 책갈피는 <storage.path>/<컴포넌트 이름>/positions.yml — 컴포넌트는 수집 설정의 loki.source.file "pods"
SUB=loki.source.file.pods
# alloy-values.yaml controller.volumes.extra 와 같은 자리
HOST_DIR=/var/lib/newlearn/alloy
# local-path 보조 Pod 와 같은 판(infra/k8s/apps/templates/local-path.yaml). digest 는 관리 서버에 받아 둔 것(2026-11-11 crictl)
IMAGE=docker.io/library/busybox:1.37@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e
SEED_LABEL=app.kubernetes.io/name=alloy-positions-seed

TMP="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP"
  kubectl -n "$NS" delete pod -l "$SEED_LABEL" --ignore-not-found --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

log() { printf '\n== %s\n' "$*"; }
fail() { echo "❌ $* — 끝 표시가 없으니 helm upgrade alloy 를 치지 않는다" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || { echo "❌ sudo 없이 돌린다 — bash $0" >&2; exit 1; }
case "$DRY_RUN" in 0 | 1) ;; *) fail "DRY_RUN 은 0 이나 1 만 받는다 ($DRY_RUN)" ;; esac
kubectl get nodes >/dev/null </dev/null || fail "kubectl 이 클러스터에 닿지 않는다 (~/.kube/config)"

args="$(kubectl -n "$NS" get ds alloy -o jsonpath='{.spec.template.spec.containers[0].args}' </dev/null)"
case "$args" in
  *--storage.path=/var/lib/alloy*) echo "이미 서버 디스크(/var/lib/alloy)를 쓴다 — 옮길 것이 없다"; exit 0 ;;
  *--storage.path=/tmp/alloy*) ;;
  *) fail "Alloy 데몬셋의 저장 경로를 못 읽었다: $args" ;;
esac

desired="$(kubectl -n "$NS" get ds alloy -o jsonpath='{.status.desiredNumberScheduled}' </dev/null)"
mapfile -t pods < <(kubectl -n "$NS" get pods -l app.kubernetes.io/name=alloy \
  -o jsonpath='{range .items[*]}{.metadata.name} {.spec.nodeName} {.status.phase}{"\n"}{end}' </dev/null)
[ "${desired:-0}" -gt 0 ] || fail "Alloy 데몬셋이 띄울 노드가 없다"
[ "${#pods[@]}" -eq "$desired" ] || fail "Alloy Pod ${#pods[@]}개 — 노드 수($desired)와 다르다. 다시 뜨는 중이면 잠시 뒤 다시"
# 한 노드에 교체 중인 Pod 둘이 있으면 개수는 맞아도 한 노드를 두 번 옮긴다 — 노드가 모두 다른지도 본다
nodes="$(printf '%s\n' "${pods[@]}" | awk '{print $2}' | sort -u | wc -l)"
[ "$((nodes))" -eq "$desired" ] || fail "Alloy Pod 가 있는 노드 $((nodes))곳 — 노드 수($desired)와 다르다. 다시 뜨는 중이면 잠시 뒤 다시"

done_nodes=0
i=0
for line in "${pods[@]}"; do
  read -r pod node phase <<<"$line"
  i=$((i + 1))
  log "$i/$desired 노드 $node — $pod"
  [ "$phase" = Running ] || fail "$pod 가 $phase"

  # 1. 지금 책갈피 꺼내기 — Alloy 는 10초마다 이 파일을 다시 쓴다. 꺼낸 뒤의 줄은 새 Pod 가 한 번 더 보낸다(대부분 Loki 가 거른다)
  kubectl -n "$NS" exec "$pod" -c alloy -- cat "$SRC" >"$TMP/$i.yml" </dev/null || fail "$pod 에서 $SRC 를 못 읽었다"
  [ "$(head -n 1 "$TMP/$i.yml")" = "positions:" ] || fail "$pod 의 책갈피가 positions: 로 시작하지 않는다"
  entries="$(grep -c 'path: /var/log/pods/' "$TMP/$i.yml" || true)"
  [ "$entries" -gt 0 ] || fail "$pod 의 책갈피에 로그 파일이 하나도 없다"
  want="$(sha256sum "$TMP/$i.yml" | cut -d ' ' -f 1)"
  [ -n "$first_taken" ] || first_taken="$(date +%s)"
  echo "꺼냄 — 로그 파일 $entries개 ($(TZ=Asia/Seoul date '+%H:%M:%S'))"

  # 2. 그 노드에 서버 디스크를 붙인 임시 Pod — 스케줄러를 거치지 않게 nodeName, 관리 서버 테인트도 견딘다
  seed="alloy-positions-seed-$i"
  apply=(kubectl apply -f -)
  [ "$DRY_RUN" != 1 ] || apply=(kubectl apply --dry-run=server -f -)
  "${apply[@]}" <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $seed
  namespace: $NS
  labels:
    ${SEED_LABEL%%=*}: ${SEED_LABEL#*=}
spec:
  nodeName: $node
  restartPolicy: Never
  automountServiceAccountToken: false
  # busybox sleep 은 PID 1 이라 끝내라는 신호를 무시한다 — 기다리지 않고 지우게
  terminationGracePeriodSeconds: 0
  tolerations:
    - operator: Exists
  containers:
    - name: seed
      image: $IMAGE
      command: ["sleep", "600"]
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          memory: 32Mi
      volumeMounts:
        - name: alloy-storage
          mountPath: /seed
  volumes:
    - name: alloy-storage
      hostPath:
        path: $HOST_DIR
        type: DirectoryOrCreate
EOF
  if [ "$DRY_RUN" = 1 ]; then
    done_nodes=$((done_nodes + 1))
    continue
  fi
  kubectl -n "$NS" wait --for=condition=Ready "pod/$seed" --timeout=120s >/dev/null </dev/null || fail "임시 Pod $seed 가 준비되지 않았다"

  # 3. 하위 폴더까지 만들어 넣는다 — 맨 위에 두면 Alloy 가 못 찾아 처음부터 다시 읽는다. 반쯤 쓴 파일이 남지 않게 임시 이름 → 이름 바꾸기
  kubectl -n "$NS" exec -i "$seed" -- sh -c \
    "mkdir -p /seed/$SUB && cat > /seed/$SUB/positions.yml.part && mv /seed/$SUB/positions.yml.part /seed/$SUB/positions.yml" \
    <"$TMP/$i.yml" || fail "$node 서버 디스크에 못 썼다"

  # 4. 꺼낸 것과 넣은 것이 같은지
  got="$(kubectl -n "$NS" exec "$seed" -- sha256sum "/seed/$SUB/positions.yml" </dev/null | cut -d ' ' -f 1)"
  [ "$got" = "$want" ] || fail "$node 사본의 sha256 이 다르다 ($want / $got)"
  echo "넣음 — $HOST_DIR/$SUB/positions.yml sha256 같음"

  kubectl -n "$NS" delete pod "$seed" --ignore-not-found --wait=true >/dev/null </dev/null
  done_nodes=$((done_nodes + 1))
done

[ "$done_nodes" -eq "$desired" ] || fail "노드 $done_nodes/$desired 만 옮겼다"
if [ "$DRY_RUN" = 1 ]; then
  echo
  echo "미리 보기 끝 — 노드 $done_nodes 모두 꺼내기 · 임시 Pod 검사 통과. 아무것도 옮기지 않았다"
  exit 0
fi
echo
deadline="$(TZ=Asia/Seoul date -d "@$((first_taken + 1800))" '+%H:%M')"
echo "✅ 책갈피 옮김 끝 — 노드 $done_nodes. 한국 시각 $deadline 까지 helm upgrade alloy (첫 노드를 꺼낸 때 + 30분, infra/server/logging.md 3절)"
