# Jira 121 — app · ai · data 네임스페이스에 들어오는 길 정책

## 무엇을 / 왜

2026-10-26 `kubectl get` 으로 보니 `app` · `ai` · `data` 에는 네트워크 정책이 없다. 클러스터 안 어느 Pod 에서든(러너 잡 · 모니터링 부품 · 시험 Pod) PostgreSQL · Redis · backend · AI 워커에 바로 닿는다. Jira 119(Grafana)와 같은 방식으로, Pod 마다 **실제로 부르는 쪽만** 들어오게 CiliumNetworkPolicy 를 둔다. 나가는 길은 이번에 건드리지 않는다.

## 지금 누가 누구를 부르나 (2026-10-27 매니페스트 · 클러스터에서 확인)

| 받는 쪽(이름표 · 포트) | 부르는 쪽 | 근거 |
|---|---|---|
| frontend(`app: frontend`, 8080) | 공개 Gateway Envoy | `services/app/routes.yaml` |
| backend(`app: backend`, 8080) | 공개 Gateway Envoy · AI 워커(W1, `BACKEND_URL=http://backend.app.svc:8080`) | `routes.yaml` · `services/ai/ai.yaml:113` |
| ai(`app: ai`, 8000) | 없음 — 아무도 안 부른다(상태 확인은 kubelet) | backend 에 AI 주소 설정 없음 |
| postgres(`app: postgres`, 5432) | backend · 매일 백업 잡(관리 서버, `postgres-backup`) | `backend.yaml:46` · `postgres-backup.yaml:60` |
| redis(`app: redis`, 6379) | backend · AI 워커 | `backend.yaml:50` · `ai.yaml:94` |

- Prometheus 는 이 셋을 긁지 않는다(ServiceMonitor · PodMonitor 없음). kubelet 상태 확인은 Cilium 이 로컬 호스트 통신을 기본으로 허용해 그대로 된다(Jira 119 에서 확인).
- 백업 잡 Pod 에는 `app` 이름표가 없다 → 매일 덤프 잡 템플릿에 `app: postgres-backup` 을 붙여 그 이름표만 허용한다. 주간 S3 잡은 DB 에 붙지 않아 이름표를 안 단다.

## 바꿀 파일

- `infra/k8s/services/data/netpol.yaml`(새) — `postgres-ingress`(backend · `postgres-backup` → 5432), `redis-ingress`(backend · ai → 6379). data 앱은 폴더째 읽어서 파일만 두면 된다
- `infra/k8s/services/data/postgres-backup.yaml` — 매일 덤프 잡 Pod 템플릿에 이름표 `app: postgres-backup`
- `infra/k8s/services/app/netpol.yaml`(새) + `kustomization.yaml` resources — `backend-ingress`(Envoy · ai → 8080), `frontend-ingress`(Envoy → 8080)
- `infra/k8s/services/ai/netpol.yaml`(새) + `kustomization.yaml` resources — `ai-ingress`: 빈 규칙 `ingress: - {}` 로 다른 Pod 는 아무도 못 들어옴(Cilium 「Ingress/Egress Default Deny」)
- `SSOT.md` — 6절 보안(네트워크 정책 줄)과 「클러스터 안에서 backend 를 직접 시험할 때는 port-forward 로」 한 줄
- `infra/server/README.md:374` — 굽기 정책 대조의 「`default` 는 여섯 곳 다 열림」은 이제 막힘이 정상이라는 한 마디
- `docs/plans/2026-10-27-app-ai-data-netpol.md` — 승인한 계획 사본

정책 꼴은 Jira 119 의 `infra/k8s/admin-ui/grafana-netpol.yaml`(이름표 `k8s:io.kubernetes.pod.namespace` + `app`, `toPorts`)을 그대로 따른다. Envoy 는 `gateway.envoyproxy.io/owning-gateway-name: public` 으로 고른다.

## 작업 순서

- [ ] Jira 121 진행 중, 브랜치 `feat/infra/S15P31A102-121-app-ai-data-netpol` ← `origin/infra`
- [ ] **반영 전 기준(사람이 서버 터미널에서)**: `default` 시험 Pod 에서 다섯 곳(backend · frontend · ai · postgres · redis) `nc -w 3` → 모두 열림이어야 함
- [ ] 정책 셋 · 이름표 · kustomization · 문서 · 계획 사본, 셋 다 `kubectl apply --dry-run=server`, 게이트
- [ ] reviewer 조수 → MR → infra → dev(머지 직전 원격 dev · 열린 MR) → Argo CD data · app · ai 동기화
- [ ] 반영 뒤 확인(아래) → Jira 121 완료 · 브랜치 맞추기 · zoo_docs

## 안 바꿀 것

- 나가는 길(egress) — 워커의 GMS · 모델 받기 · DNS 길은 그대로
- `monitoring`(119 에서 끝) · 굽기 네임스페이스 · `hello` · 시스템 네임스페이스
- 이미지 · 앱 코드 · DB · Redis 설정, 주간 S3 잡

## 리스크

- **이름표나 포트를 하나 틀리면 사이트가 멈춘다** — backend 가 DB · Redis 에 못 붙으면 readiness 가 떨어져 503. 반영 직후 health 와 첫 화면을 보고, 안 되면 바로 Revert(세 앱 모두 prune · selfHeal 이라 Revert 머지로 정책이 지워짐)
- **처음 뜰 때의 길** — Cilium 은 맺어진 연결도 원래 방향 패킷마다 정책을 본다(리뷰 조수, 기억 기준). 그래서 허용된 쪽 커넥션 풀은 그대로 이어지고 빠뜨린 쪽은 바로 끊긴다. 반영 뒤 backend · ai 를 다시 띄우는 것은 처음 뜰 때의 길(Flyway · Hikari 풀 · Redis · readiness)을 정책 아래에서 보는 확인이다(무중단 교체)
- **백업 잡** — 이름표를 달기 전 잡은 막힌다. 다음 정시(04:00) 전에 손으로 한 번 돌려 성공을 본다
- **클러스터 안 확인 습관이 바뀐다** — 지금까지 `default` 시험 Pod 로 backend `/internal` 을 불러 확인했는데 이제 막힌다 → port-forward 로(문서에 적음)
- **수집 배치(보류)가 생기면** backend · postgres 에 길을 더해야 한다 — SSOT 에 적어 둔다
- 시험 Pod · 재시작 · 수동 잡은 클러스터를 바꾸는 명령이라 자동 모드에서 막힌다 → 사람이 서버 터미널에서, 결과는 Claude 가 터미널을 읽는다

## 어떻게 검증하나

- **막히는지 대조**(반영 전 · 뒤 같은 명령): `default` 시험 Pod → backend · frontend · ai · postgres · redis 다섯 곳 open → timed out. 관리 서버에 띄운 시험 Pod(러너 잡이 도는 노드 — 노드를 건너는 길)도 반영 뒤 같은 다섯 곳 timed out(리뷰 뒤 더함)
- **열려야 하는 길**
  - 사이트 첫 화면 200 · `/api/v1/categories` 200 · `/actuator/health` 200 (Envoy → frontend · backend, backend → DB · Redis)
  - backend · ai `rollout restart` 뒤 둘 다 Ready(새 연결로 DB · Redis 확인), 교체 동안 health 실패 0(서버에서 1초 간격)
  - ai → backend: `kubectl -n ai exec deploy/ai -- python -c …urlopen('http://backend.app.svc:8080/actuator/health')` → 200
  - 백업: `kubectl -n data create job --from=cronjob/postgres-backup …` → Completed, 덤프 파일 생김
- 정책 다섯 VALID, Argo CD data · app · ai Synced · Healthy
- reviewer 조수: 빠진 길 · 이름표 · 포트

## 되돌리는 법

- MR Revert → dev → Argo CD 가 정책 다섯을 지우고 백업 잡 이름표를 뺀다. 데이터 변화 없음
- 급하면 Revert 를 먼저 머지한다(selfHeal 이라 손으로 지우면 다시 생김)
