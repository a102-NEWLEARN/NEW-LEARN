# 입구 요청 수 상한 보강 — 지표 수집 · 상한 서비스 들어오는 길 · 로컬 캐시 · 설정 판 자동 표시

2026-10-29 계획. 사용자가 보강 넷을 모두 고르고, 경보는 남기고, 세 번 나눠 반영하고, 새 Jira 티켓으로 하기로 했다(아래 「정한 것」).

## 무엇을 / 왜

- 10-29 낮에 A14 가입 · A15 로그인 · A19 용어사전에 입구 global 상한을 걸었다(Jira S15P31A102-135, 계획 `docs/plans/2026-10-29-ratelimit-global.md`). 반영 뒤 사후 리뷰가 「고려」 넷을 냈다
- 가장 큰 구멍은 **상한이 소리 없이 풀려도 알 길이 없다**는 것이다. 상한 서비스를 못 부르면 요청은 통과하고(failClosed false) health 도 200 이라, 지금은 사람이 손으로 101번을 보내 봐야 안다
- 그래서 지표를 먼저 모으고, 그 지표를 눈으로 삼아 정책 · Helm 값을 하나씩 바꾼다

## 정한 것 (사용자, 10-29)

| 무엇 | 답 |
|---|---|
| 범위 | 넷 모두 — ① 지표 수집 ② 들어오는 길 정책 ③ 로컬 캐시 1MiB ④ 설정 판 자동 표시 |
| 경보 | 지표만 모으고 경보는 남김(Alertmanager 가 꺼져 있어 받을 곳이 없다) → SSOT 8절 |
| 반영 | 세 번 나눠: ① → ② → ③ · ④ |
| Jira | 새 티켓(스토리 포인트 2, 135 와 연결). 135 는 완료로 둔다 |

## 조사한 것 (2026-10-29, 클러스터는 읽기만)

- **수집 대상 0**: `up{namespace="envoy-gateway-system"}` 결과 없음. Prometheus 는 모든 네임스페이스의 PodMonitor 를 읽는다(`infra/k8s/bootstrap/monitoring-values.yaml` 의 `podMonitorSelectorNilUsesHelmValues: false`, Prometheus 의 `podMonitorNamespaceSelector` `{}`). PodMonitor CRD 있음
- **상한 서비스 지표**(`envoy-ratelimit` Pod, 포트 이름 `metrics` 19001 `/metrics`): `ratelimit_service_rate_limit_{total_hits,within_limit,over_limit,near_limit}` · `ratelimit_service_response_time_seconds` · `ratelimit_redis_pool_cx_*`. Go 런타임 · statsd_exporter 지표도 섞여 나온다
- **Envoy 지표**(Envoy Pod, 포트 이름 `metrics` 19001 `/stats/prometheus`): 판정 결과는 `envoy_cluster_ratelimit_ok` · `envoy_cluster_ratelimit_over_limit`(이름표 `envoy_cluster_name="httproute/app/app/rule/1"` 등). `error` · `failure_mode_allowed` 는 처음 생길 때 만들어지는 셈이라 지금은 줄이 없다. 전체는 약 4,960줄 · 494KB 인데 `?filter=^cluster\..*\.ratelimit\.` 를 주면 6줄 · 577B 만 온다
  - 규칙 번호는 `routes.yaml` HTTPRoute `app` 의 규칙 순서다 — rule/1 용어사전(1분 100) · rule/2 로그인(20) · rule/3 가입(10)(상한 서비스 `/rlconfig` 로 확인)
- **Prometheus 여유**: 시계열 73,761개, 메모리 462MiB / 상한 1Gi
- **상한 서비스가 연 포트**(관리 서버 호스트에서 Pod IP 로 GET)
  - 8081 gRPC(mTLS) — Envoy 가 부르는 길
  - 8080 평문 HTTP — `/healthcheck` 200(kubelet 상태 확인). `/json` 도 있다 — 없는 도메인으로 POST 하면 `{"overallCode":"OK"}` 200. 실제 도메인 · IP 를 넣으면 남의 IP 바구니를 채울 수 있다
  - 6070 평문 HTTP 디버그 — `/debug/pprof/`(CPU 프로파일) · `/rlconfig`(상한 규칙 전체) · `/stats` 가 인증 없이 열려 있다
  - 19001 지표
- **들어오는 길 정책**: `envoy-gateway-system` 에 CiliumNetworkPolicy 가 하나도 없다. Cilium 설정 `enable-policy=default`, 호스트 방화벽 꺼짐 — Pod 를 고르는 정책이 생기면 그 Pod 만 기본 거부로 바뀌고, 같은 노드 호스트(kubelet)에서 오는 길은 열려 있다(지금 `ai-ingress` 가 이렇게 돈다)
- **캐시 env**: Envoy Gateway v1.9.2 는 `rateLimitDeployment.container.env` 를 기본 env 뒤에 붙이고 같은 이름이면 바꾼다(`internal/infrastructure/kubernetes/resource/resource.go` 의 `ExpectedContainerEnv`). 상한 서비스 이미지(`envoyproxy/ratelimit:0482748e`)의 `LOCAL_CACHE_SIZE_IN_BYTES` 는 기본 0(꺼짐)이고, 켜면 넘긴 키를 freecache 에 두어 그 키는 Redis 를 다시 읽지 않는다(이미지 커밋의 `src/settings/settings.go` · README 「Local Cache」)
- **상한 서비스 교체 전략**: Pod 1개, RollingUpdate maxSurge 25% · maxUnavailable 25% → 새 Pod 가 먼저 뜬다. `FORCE_START_WITHOUT_INITIAL_CONFIG=true` 라 규칙을 받기 전에도 Ready 가 될 수 있다
- **`infra/k8s/apps/`** 는 Argo CD 가 Helm 차트로 그린다(템플릿이 이미 `.Values.repoURL` 을 쓴다). 이 PC 에 helm 이 있어 `helm template` 으로 그려 볼 수 있다

## 바꿀 파일

**① 지표 수집 (MR → infra → dev)**

- `infra/k8s/gateway/ratelimit-podmonitor.yaml`(새) — PodMonitor 둘, 네임스페이스 `envoy-gateway-system`
  - `envoy-ratelimit`: 이름표 `app.kubernetes.io/name: envoy-ratelimit`, 포트 `metrics` `/metrics`, `metricRelabelings` 로 `ratelimit_service_.*|ratelimit_redis_.*` 만 남긴다
  - `envoy-proxy-ratelimit`: 이름표 `gateway.envoyproxy.io/owning-gateway-name: public` · `app.kubernetes.io/component: proxy`, 포트 `metrics` `/stats/prometheus`, `params.filter` `^cluster\..*\.ratelimit\.`(Envoy 가 6줄만 만든다), 혹시 filter 가 무시될 때를 막으려고 `envoy_cluster_ratelimit_.*` 만 남기는 `metricRelabelings`
  - 수집 간격은 Prometheus 기본(30초)
- `infra/k8s/apps/templates/gateway.yaml` — 머리 주석의 내용 목록에 「입구 상한 서비스 지표 수집 · 들어오는 길」
- `SSOT.md` 6절 「외부 입구」 상한 줄 — 지표를 모은다는 것과 확인 질의 셋(아래 「확인 질의」)
- `SSOT.md` 8절 — 「상한이 풀릴 때 경보」 줄(받을 곳이 생기면 위 질의로 규칙을 만든다, Alertmanager 꺼짐)
- 이 계획 → `docs/plans/2026-10-29-ratelimit-hardening.md`

확인 질의(SSOT 에 적을 것 — reviewer 지적으로 고침)
- 수집이 살아 있나: `up{namespace="envoy-gateway-system"}` — 상한 서비스 · Envoy 두 대상 모두 1 이어야 아래 0 을 믿는다(`or vector(0)` 는 수집이 끊겨도 0 을 낸다)
- 풀렸나: `sum(envoy_cluster_ratelimit_failure_mode_allowed) or vector(0)` · `sum(envoy_cluster_ratelimit_error) or vector(0)` — Envoy 가 뜬 뒤 쌓인 수라 0 이 정상. 처음 `increase(…[10m])` 로 적었는데, 이 줄은 처음 풀릴 때 생겨서 첫 묶음이 0 으로 사라진다
- 얼마나 막았나: `sum by (envoy_cluster_name) (increase(envoy_cluster_ratelimit_over_limit[1h]))`

**② 상한 서비스 들어오는 길 (MR → infra → dev)**

- `infra/k8s/gateway/ratelimit-netpol.yaml`(새) — CiliumNetworkPolicy `ratelimit-ingress`, 네임스페이스 `envoy-gateway-system`
  - 고르는 Pod: `app.kubernetes.io/name: envoy-ratelimit` 하나. Envoy · 컨트롤러 Pod 는 고르지 않는다(Envoy 는 hostPort 로 바깥 손님을 받는다)
  - 받는 길: Envoy(`gateway.envoyproxy.io/owning-gateway-name: public`) → 8081/TCP, Prometheus(`monitoring` · `app.kubernetes.io/name: prometheus`) → 19001/TCP
  - 주석: 왜(8080 `/json` · 6070 디버그), 그대로 남는 길(같은 노드 호스트 — kubelet 상태 확인 8080), 상한 서비스 → 컨트롤러(xDS 18001) · Redis 는 나가는 길이라 상관없음. 꼴은 `infra/k8s/services/data/netpol.yaml` · `admin-ui/grafana-netpol.yaml` 을 따른다
- `SSOT.md` 6절 「클러스터 구성」 들어오는 길 정책 줄 — 「입구 상한 서비스는 Envoy · Prometheus 만」

**③ · ④ 로컬 캐시 · 설정 판 자동 표시 (MR → infra → dev)**

- `infra/k8s/apps/templates/envoy-gateway.yaml`
  - 지금 `valuesObject.config` 덩어리를 같은 파일 위쪽 `{{- define "newlearn-apps.envoyGatewayConfig" -}}` 로 옮기고, 그 자리는 `{{- include "newlearn-apps.envoyGatewayConfig" . | nindent 10 }}`
  - 그 덩어리의 `rateLimitDeployment.container` 에 `env: [{name: LOCAL_CACHE_SIZE_IN_BYTES, value: "1048576"}]`(1MiB)
  - `newlearn.io/config-revision` 값을 `{{ include "newlearn-apps.envoyGatewayConfig" . | sha256sum | trunc 16 | quote }}` 로. 주석: 덩어리 안의 주석만 바꿔도 값이 바뀌어 컨트롤러가 한 번 새로 뜬다(해는 없다)
- `SSOT.md` 6절 「외부 입구」 — 「설정을 바꾸면 `newlearn.io/config-revision` 을 같이 올린다」 → 「config 덩어리의 sha256 이라 저절로 바뀐다」, 캐시 한 문장

**마지막 — 실측 기록 (문서 MR → dev)**

- `SSOT.md` 10절 — 세 번의 반영 결과 줄(아래 「어떻게 검증하나」의 수치)
- 이 계획의 체크박스

## 작업 순서

- [x] Jira 새 티켓(스토리 포인트 2, 135 와 연결) 만들고 진행 중. 브랜치는 `origin/infra` 가 `origin/dev` 와 같은지 본 뒤 그 위에 — S15P31A102-136. 그사이 infra 에 Jira 135 문서 바로잡기(966173c)가, dev 에 계획 체크(9a5362f)가 따로 들어가 서로 조금씩 앞서 있다 → `origin/infra`(32e8dcc) 위에 만들고, infra → dev MR 이 두 쪽을 합친다
- [x] ① 지표 — 파일 · 서버 쪽 시험 적용(`--dry-run=server`) · 게이트 · reviewer 조수 → MR → infra → dev(머지 직전 원격 dev · 열린 MR 다시 봄, infra → dev 는 사용자 승인) → 확인 → 증거를 infra → dev MR 댓글로 — !401 → infra 8df85ce6, !406 → dev 0fce0529(15:31, GitLab 장애로 「conflict」 표시가 남아 MR 을 닫았다 열어 다시 계산). 15:32:55 동기화, 15:34 두 대상 `up` 1 · 오류 없음, 판정 지표 rule/1 ~ 3, 새 시계열 47개 · Prometheus 메모리 482 → 492MiB
- [x] ② 정책 — 반영 전 접속 시험(사용자) → 파일 · 시험 적용 · 게이트 · reviewer → MR → infra → dev → 반영 뒤 접속 시험 · 상한 다시 재기 → MR 댓글 — !407 → infra 78a16792, !408 → dev 8bb6468a(16:15:07, 정책 16:15:12 생성 · VALID). 시험 Pod(워커 · 관리 서버) 포트 넷: 전 15:48 모두 open → 뒤 16:21 · 16:22 두 번 모두 timed out. 관리 서버 호스트 길도 200 → 시간 초과. 용어사전 16:16:17 ~ 23 에 101번 → 100번 200 · 1번 429, 같은 때 EC2 200. 풀림 · 오류 0, 수집 up 1. 첫 MR 파이프라인은 GitLab 장애로 잡이 코드를 못 받아(500) 실패 → MR 에 새 파이프라인
- [x] ③ · ④ Helm 값 — 파일 · `helm template` 대조 · 게이트 · reviewer → MR → infra → dev → 컨트롤러 · 상한 서비스 새 Pod 확인 · 상한 다시 재기 · 캐시 지표 → MR 댓글 — !409 → infra e0ffd5a1, !410 → dev bcdeb05f(16:47:31). 결과는 `SSOT.md` 10절. reviewer 지적으로 바로잡은 사실 둘: v1.9.2 컨트롤러는 설정 파일을 감시해 다시 읽기도 한다(그래도 kubelet 반영을 기다리지 않으려고 해시 주석을 둔다), 상한 키 만료는 1분이 아니라 칸 끝 + 0 ~ 299초. 캐시 수는 statsd 이름 규칙 때문에 따로 이름이 없어 「상한 서비스 over_limit − Envoy over_limit」으로 읽었다(계획 때 짐작한 `…over_limit_with_local_cache` 이름은 나오지 않음)
- [ ] 실측 문서 MR → dev, Jira 새 티켓 완료, 분야 브랜치 넷 dev 에 맞춤

## 안 바꿀 것

- 상한 숫자(100 · 20 · 10 / 1분) · 코드 `RATE_LIMITED` · 429 본문 · `Retry-After` · `ratelimit.yaml` · `routes.yaml`
- Redis 설정 · `data/netpol.yaml`(상한 서비스 → Redis 길은 이미 있다), 상한 서비스용 Redis 를 따로 두지 않는다
- Envoy Pod · 컨트롤러 Pod 를 고르는 정책 — Envoy 는 바깥 손님을 hostPort 로 받아 정책을 걸면 위험이 크다
- 나가는 길(egress), Envoy Gateway 판(v1.9.2), 컨트롤러 지표(1,270줄 — 이번 목적에 필요 없음)
- 경보 규칙(PrometheusRule) · Grafana 대시보드 — 경보는 SSOT 8절에 남김
- 상한 서비스의 `DEBUG_HOST`(6070 을 Pod 안에서만 열기) — 정책으로 다른 Pod 길은 막히고, 남는 길은 워커 호스트뿐이라(그 호스트에 들어온 사람은 무엇이든 한다) 이번엔 넣지 않는다
- 발표장에서 같은 공인 IP 를 여럿이 쓰는 숫자 문제 — 사용자가 따로 정한다

## 리스크

- **② 이름표가 틀리면 상한이 소리 없이 풀린다** — Envoy 가 8081 에 못 닿으면 요청은 통과하고 health 는 200 그대로다. ① 의 `envoy_cluster_ratelimit_error` · `failure_mode_allowed` 가 오르는지와, 용어사전 101번 재기(100번째까지 200, 그 뒤 429)로 반영 직후 본다. 안 되면 바로 Revert
- **② Prometheus 이름표가 틀리면** 상한 서비스 지표만 끊긴다(`up` 0). 사이트 영향 없음
- **③ · ④ 렌더가 틀리면** 루트 앱(`infra/k8s/apps` 차트)이 그리기 오류로 멈춘다 — 이미 돌던 앱은 그대로지만 다른 앱 반영도 막힌다. 이 PC 에서 `helm template` 으로 그려 지금 렌더와 줄 단위로 대조한 뒤 올린다
- **③ · ④ 반영 때 컨트롤러가 한 번 새로 뜬다** — 판 표시가 `ratelimit-global-1` 에서 해시로 바뀌어서다. Envoy 는 마지막 설정으로 계속 받는다(10-29 12:58 같은 교체 때 health 266번 모두 200)
- **③ 상한 서비스 Pod 교체 동안 몇 초 상한이 풀릴 수 있다** — 새 Pod 가 규칙을 받기 전에 Ready 가 될 수 있어서다(`FORCE_START_WITHOUT_INITIAL_CONFIG`). 교체가 끝난 뒤 다시 잰다
- **캐시 메모리** — freecache 는 1MiB 를 처음에 잡는다. 지금 사용량 11.4MiB, 상한 256Mi
- **같은 Redis**: 캐시는 쓰기를 줄이는 쪽이라 새 위험은 없다

## 어떻게 검증하나

모든 반영 동안 EC2 에서 1초마다 health(`curl -m 3 https://newlearn.io.kr/actuator/health`)를 재어 실패 0 을 본다. 클러스터를 바꾸는 명령(시험 Pod · 동기화)은 사용자가 치고, Claude 는 읽기만 한다.

**① 지표**
- `up{namespace="envoy-gateway-system"}` — 대상 2개 모두 1
- `envoy_cluster_ratelimit_ok` · `_over_limit` 가 rule/1 ~ 3 으로, `ratelimit_service_rate_limit_over_limit` 이 Prometheus 에 있음
- 늘어난 시계열 수(`count({namespace="envoy-gateway-system"})`)와 Prometheus 메모리 전후 — 수십 개 수준이어야 한다

**② 정책**
- 반영 전 · 뒤 같은 명령(Jira 121 과 같은 꼴, 사용자가 서버 터미널에서): `default` 시험 Pod(`busybox:1.37`, `nc -zv -w 3`)에서 상한 서비스 Pod IP 의 8080 · 6070 · 8081 · 19001 → 전: 넷 다 열림, 뒤: 넷 다 timed out. 관리 서버에 띄운 시험 Pod(노드를 건너는 길)도 뒤에 넷 다 timed out
- 관리 서버 호스트에서 8080 `/healthcheck` · 6070 GET(Claude, 읽기) — 전후 결과를 그대로 적는다(원격 노드 호스트 길이 막히는지는 실측으로)
- 열려야 하는 길
  - Envoy → 8081: 용어사전 같은 1분 칸 안 101번 → 100번째까지 200, 101번째 429 `RATE_LIMITED` · `Retry-After: 60`, 같은 때 EC2 는 200. `envoy_cluster_ratelimit_error` · `failure_mode_allowed` 0
  - Prometheus → 19001: `up` 1 그대로
  - kubelet → 8080: 상한 서비스 Pod Ready, 재시작 0
- 정책 VALID, Argo CD gateway Synced · Healthy

**③ · ④ Helm 값**
- 이 PC: `helm template infra/k8s/apps`(repoURL · targetRevision 을 임시로) — envoy-gateway Application 의 `valuesObject` 가 지금 dev 렌더와 env 한 줄 · 주석 값만 다름. 스크래치 복사본에서 env 값을 바꾸면 주석 값도 바뀜(저절로 올라감)
- 사이트: 컨트롤러 Pod 주석이 이 PC 에서 그린 해시와 같음 · 상한 서비스 Pod env 에 `LOCAL_CACHE_SIZE_IN_BYTES=1048576` · 두 Pod 재시작 0 · 상한 서비스 메모리
- 용어사전 101번 + 20번 더 → 429 그대로, 캐시로 답한 수가 오름(넘긴 뒤 요청은 Redis 대신 캐시로 답함). 같은 때 EC2 는 200
  - 상한 서비스는 이 수를 `…over_limit_with_local_cache` 로 세는데(이미지 커밋의 `src/stats/manager_impl.go`), Envoy Gateway 가 넣은 statsd 이름 규칙(`statsd-exporter-config`)에 이 줄이 없다. 그래서 이름이 도메인 · 키를 붙여 자동으로 만들어질 것으로 본다(`ratelimit_go_*` 처럼 — 반영 뒤 실제 이름을 확인한다). Prometheus 에서 `{__name__=~"ratelimit_service_.*over_limit_with_local_cache"}` 로 찾는다(① 의 남기기 규칙 `ratelimit_service_.*` 에 든다)
- `envoy_cluster_ratelimit_error` · `failure_mode_allowed` 가 상한 서비스 교체가 끝난 뒤로 늘지 않음(교체 순간 옛 Pod 와의 연결이 끊기며 오를 수 있고, Envoy 가 뜬 뒤 쌓이는 수라 내려가지 않는다 — reviewer 지적)
- Envoy Pod 생성 시각이 그대로(hostPort 라 다시 뜨면 잠깐 끊긴다 — 이번 변경은 Envoy 를 건드리지 않아야 한다)

## 되돌리는 법

- 셋 모두 해당 MR 을 Revert → infra → dev. Argo CD 가 prune · selfHeal 이라 PodMonitor · 정책이 지워지고 Helm 값이 돌아간다. 데이터 변화 없음
- ② 에서 상한이 풀린 것이 보이면 Revert 를 먼저 머지한다(손으로 지워도 selfHeal 이 다시 만든다)
- ③ · ④ 를 되돌리면 주석 값이 다시 바뀌어 컨트롤러가 한 번 더 새로 뜬다. 상한 서비스는 캐시 없이 다시 뜬다
- Redis 의 상한 키는 1분 칸이 끝나고 0 ~ 299초 뒤 사라진다(만료 흔들기 기본 300초)
