# Jira 119 — Grafana 는 Envoy 만 부르게 (monitoring 들어오는 길 정책)

## 무엇을 / 왜

Grafana 프록시 로그인은 `X-WEBAUTH-USER` 머리에 든 이름으로 바로 들여보낸다(`infra/k8s/bootstrap/monitoring-values.yaml` `auth.proxy`). 손님이 보낸 머리는 Envoy 가 맨 앞에서 지우지만(`infra/k8s/gateway/client-traffic.yaml`), Envoy 를 거치지 않고 클러스터 안에서 Grafana Service 로 오는 길은 막는 것이 없다. 2026-10-26 `kubectl get` 으로 보니 `monitoring` 에는 네트워크 정책이 없다(클러스터 전체에 굽기 `build-egress` 와 Argo CD 차트 정책 다섯뿐).

Grafana Pod 에 들어오는 길을 **공개 Gateway 의 Envoy** 와 **같은 네임스페이스의 Prometheus 수집**만 받게 CiliumNetworkPolicy 하나를 둔다.

## 정한 것

| 항목 | 정한 것 |
|---|---|
| 정책 | CiliumNetworkPolicy `grafana-ingress`(`monitoring`). Grafana Pod(`app.kubernetes.io/name: grafana`)만 고른다. 들어오는 길 둘 — ① `envoy-gateway-system` 의 공개 Gateway Envoy(`gateway.envoyproxy.io/owning-gateway-name: public`) ② 같은 네임스페이스 Prometheus(`app.kubernetes.io/name: prometheus`). 둘 다 3000/TCP 만 |
| 두는 곳 | `infra/k8s/admin-ui/grafana-netpol.yaml` — Argo CD `admin-ui` 앱(prune · selfHeal)이 이미 `monitoring` 의 Grafana 입구(HTTPRoute · 팝업 잠금)를 맡는다. 굽기 정책처럼 손으로 `kubectl apply` 하지 않고 Git 으로 |
| 그대로 남는 길 | kubelet 상태 확인 — Cilium 은 로컬 호스트에서 오는 통신을 기본으로 허용(공식 문서 Layer 3 「host」). Grafana 사이드카 — 같은 Pod 의 localhost. 관리자 `kubectl port-forward` — Pod 안 localhost 로 들어가는 길이라 남을 것으로 보지만 문서로 확인 못 함 → 반영 뒤 실제로 본다 |
| whitelist | 이번에는 두지 않는다 — Envoy Pod 주소가 바뀌고, 정책이 같은 일을 한다 |

```yaml
# 정책 초안 (머리 주석은 파일에서 더 적는다)
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: grafana-ingress
  namespace: monitoring
spec:
  endpointSelector:
    matchLabels:
      app.kubernetes.io/name: grafana
  ingress:
    - fromEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: envoy-gateway-system
            gateway.envoyproxy.io/owning-gateway-name: public
      toPorts:
        - ports:
            - port: "3000"
              protocol: TCP
    - fromEndpoints:
        - matchLabels:
            app.kubernetes.io/name: prometheus
      toPorts:
        - ports:
            - port: "3000"
              protocol: TCP
```

## 바꿀 파일

- `infra/k8s/admin-ui/grafana-netpol.yaml`(새) — 위 정책 + 왜 · 무엇이 남는지 주석
- `infra/k8s/bootstrap/monitoring-values.yaml` — `auth.proxy` 주석에 「Envoy 를 거치지 않는 길은 `admin-ui/grafana-netpol.yaml` 이 막는다」 한 줄. 값은 그대로라 helm upgrade 없음
- `infra/k8s/admin-ui/grafana.yaml` — 머리 주석에 같은 한 줄
- `SSOT.md` 6절 「도메인 · HTTPS」의 Grafana 줄(220)에 한 줄 — 다른 Pod 는 막고 관리 서버 호스트 길은 열려 있다는 것. 268줄 「확인」 기록에 바뀐 뒤를 한 마디
- `infra/server/README.md` 「되돌리기」 표 「관리 화면만 닫기」 — 앱째 지우지 말고 `grafana-netpol.yaml` 만 남기게(리뷰 뒤 더함)
- `docs/plans/2026-10-26-grafana-netpol.md` — 승인한 계획 사본

> 리뷰(2026-10-26, reviewer 조수) 뒤 바꾼 것: ① 정책이 `admin-ui` 앱에 있어 README 대로 앱째 지우면 정책도 사라진다 → README 절차를 고침 ② 「들어오는 길은 Envoy · Prometheus 뿐」은 사실이 아니다 — Cilium 은 로컬 호스트 통신을 기본으로 허용해 관리 서버 호스트(호스트 네트워크 Pod · API 서버 프록시 · SSH 터널)에서 오는 길은 남는다 → SSOT · 주석 문장을 「다른 Pod 에서 오는 길」로 좁힘. 위험이 큰 CI 잡 Pod 는 호스트 네트워크가 아니라 막힌다

## 작업 순서

- [x] Jira 119 진행 중. 원래 작업 폴더를 `infra` 로 돌리고(지금 머지된 34 브랜치에 있음) 브랜치 `feat/infra/S15P31A102-119-grafana-netpol` ← `origin/infra`
- [x] 반영 전 기준 재기 — 아래 「검증」의 nc 대조를 정책 없이 한 번(열림이어야 함)
- [x] 정책 파일 · 주석 · SSOT · 계획 사본, `kubectl apply --dry-run=server -f` 로 스키마 확인, 게이트(`pre-commit --ci infra`)
- [x] reviewer 조수 → MR → `infra` → `dev`(머지 직전 원격 dev · 열린 MR 확인, 소스 삭제 끔) → Argo CD `admin-ui` 동기화
- [ ] 반영 뒤 확인 → Jira 119 완료 · 브랜치 맞추기 · zoo_docs. 잰 값(SSOT 10절 한 줄)은 Jira 123(SSOT 정정) 문서 MR 에 함께

## 안 바꿀 것

- Grafana Helm 값(`auth.proxy` · whitelist) · 버전, helm upgrade
- `monitoring` 의 다른 Pod(Prometheus · operator · exporter 들) — 이번 정책은 Grafana Pod 만 고른다
- 나가는 길(egress)
- 다른 네임스페이스 정책(Jira 121), 화면 보안 머리(120), 워커 SSH(122)
- 꾸민 머리를 실제로 보내는 시험 — 「Envoy 아닌 곳에서 닿지 않음」(nc)으로 판정한다

## 리스크

- **이름표가 틀리면 `/grafana` 가 막힌다**(Envoy 가 Grafana 에 못 닿음) → 반영 직후 팝업 로그인으로 보고, 안 되면 바로 Revert
- **Envoy(워커) → Grafana(관리 서버)는 노드를 건넌다** — Cilium 은 터널(VXLAN)로 출발 신원을 실어 나르지만 이 클러스터에서 들어오는 길 정책은 처음이다 → 같은 확인으로 잡힌다
- **Prometheus 의 Grafana 수집이 끊길 수 있다** → 수집 대상 up 확인
- **관리자 port-forward 가 막힐 수 있다**(문서로 확인 못 함) → 반영 뒤 사람이 확인, 막히면 Revert 하고 길을 다시 본다
- 시험 Pod 만들기 · server dry-run 은 클러스터에 대는 명령이라, 자동 모드에서 막히면 명령을 사람에게 건넨다

## 어떻게 검증하나

- **닿는지 대조**(반영 전 · 뒤 같은 방법 — 2026-10-23 굽기 정책 때처럼 `kubectl run --rm` busybox `nc -zv -w 3 kps-grafana.monitoring 80`, 끝나면 지움)
  - `default` 시험 Pod → 전: 열림 / 뒤: 막힘
  - `monitoring` 의 이름표 없는 시험 Pod → 뒤: 막힘
  - 관리 서버에 띄운 시험 Pod(control-plane toleration · nodeSelector — CI 잡이 실제로 도는 노드) → 전: 열림 / 뒤: 막힘. 위 둘은 taint 때문에 워커에 떠서 노드를 건너는 경우만 잰다
- **관리자 SSH 터널**(README 「모니터링」 4. 열기, Service 주소로) → 뒤에도 로그인 화면(사람)
- **정책 상태**: `kubectl -n monitoring get cnp grafana-ingress` VALID True, Argo CD `admin-ui` Synced · Healthy
- **사이트**: 팝업 → `/grafana` 대시보드 열림(사람, 브라우저)
- **수집**: Prometheus 대상에서 Grafana up = 1
- **관리자**: `kubectl -n monitoring port-forward svc/kps-grafana 3000:80` 로 로그인 화면(사람)
- reviewer 조수: 이름표 · 포트 · 네임스페이스, 빠진 길이 없는지

## 되돌리는 법

- MR Revert → `dev` → Argo CD `admin-ui` 가 prune 으로 정책을 지운다. 데이터 · 설정 변화가 없어 되돌릴 수 없는 것은 없다
- 급하면 Revert 를 먼저 머지한다(`selfHeal` 이라 손으로 지우면 Git 에 남은 정책을 다시 만든다)
