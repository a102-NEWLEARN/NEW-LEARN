# 인프라 배포 끝까지 (승인 2026-10-22) — Jira 91 클러스터 기본 구성 → 93 도메인 · HTTPS → 서비스 첫 배포

## 무엇을 / 왜

워커 join(Jira 90)까지 끝나 이제 서비스를 올릴 차례다. 세 단계로 나눠 한 단계씩 끝내고 다음으로 간다.
1. **A · Jira 91** — Argo CD · Sealed Secrets · Envoy Gateway. 워커 공인 IP:80 에서 시험 앱이 응답한다.
2. **B · Jira 93** — 가비아 `newlearn.io.kr` 을 워커에 잇는다. cert-manager 가 인증서를 자동으로 받고, `https://newlearn.io.kr` 과 `/grafana` · `/argocd` 를 연다.
3. **C · 새 티켓** — PostgreSQL · Redis · backend · frontend · ai 를 GitOps 로 띄운다. CI 가 「배포 태그 바꾸기」 MR 을 열고 사람이 머지하면 반영된다. C1 저장소 · DB · Redis → C2 앱 셋 · 입구 → C3 태그 MR 잡, MR 셋으로.

설계 조수 검토(2026-10-22)에서 나온 함정 — 라우트 `sectionName` · hello 라우트 겹침 · allowedRoutes 와 인증서 갱신 · 루트 앱 finalizer · Sealed Secrets 이름 · 태그 MR 충돌 · MTU 측정 착오 — 을 아래 단계에 넣었다.

단계마다 브랜치 · MR · 검증 · Jira 를 따로 둔다. 단계 하나가 검증을 통과해야 다음 단계를 시작한다.

## 정한 것 (2026-10-22 사용자 답 + 이 계획에서 정하는 것)

| 항목 | 정한 것 | 근거 |
|---|---|---|
| 인증서 | cert-manager + Let's Encrypt HTTP-01 (80 확인), 자동 갱신 | 사용자 선택. 가비아는 DNS API 가 없음 |
| 반영 방식 | 이미지를 구운 dev 파이프라인이 「태그 바꾸기」 MR 을 열고 → 사람이 머지 → Argo CD 반영. 되돌리기는 revert | 사용자 선택. dev 는 push 금지라 MR 이 맞음 |
| 공개 화면 | `/argocd` · `/grafana` · Swagger 셋 다 연다. HTTPS 가 붙은 B 단계에서(Swagger 경로는 C2) | 사용자 선택 |
| 화면 잠금 | `/argocd` · `/grafana` 는 Envoy 앞단의 브라우저 팝업(HTTP 기본 인증, Envoy Gateway SecurityPolicy) **하나로 끝**. 계정은 둘이 같이 쓰는 하나. Grafana 는 팝업 아이디로 바로 들어감(프록시 로그인, 보기 권한). Argo CD 는 팝업 뒤 읽기 전용으로 바로 보이고, 동기화 · 설정 변경은 admin 으로 한 번 더 로그인. **Swagger 는 입력 없이** — 개발하는 동안 FE 가 편하게 | 사용자 선택 (2026-10-20 「Swagger 도 팝업」 결정을 바꿈 → SSOT 6절 고침) |
| AI 워커 | `LLM_MODE=mock` 으로 먼저. GMS 키는 AI 팀이 준비되면 | 사용자 선택 |
| Argo CD 가 읽는 브랜치 | `dev` (검증 중에는 잠깐 작업 브랜치) | `root-app.yaml` 4줄의 빈칸을 채움 |
| 도메인 | `newlearn.io.kr` · `www.newlearn.io.kr` 둘 다 인증서, www 는 apex 로 넘김 | — |
| 저장소(디스크) | local-path-provisioner + StorageClass `newlearn-local`(지워도 데이터 남김 Retain), 워커 `/var/lib/newlearn/local-path` | SSOT 6절 「저장소·백업」 이미 결정 |
| 네임스페이스 | `argocd` · `envoy-gateway-system` · `cert-manager` · `sealed-secrets`(kube-system 대신) · `app`(backend · frontend) · `ai` · `data`(postgres · redis) | SSOT 6절 「클러스터 구성」을 이름으로 풂 |
| Redis | AOF 켜고 `maxmemory 1gb` · `noeviction`(세션 · 큐가 지워지면 안 됨) | `docs/api-screen.md` 「Infra 와 정한다」 |
| 러너 · 모니터링 | Argo CD 로 옮기지 않는다 — Helm 그대로 (발표 전 위험만 큼). 11/18 뒤 할 일도 아님 | Jira 91 「정하기」 |
| MR 머지 | **이 계획 승인 = 아래 MR 을 검증 뒤 머지해도 된다는 지시.** 머지 직전마다 원격 dev · 열린 MR 을 다시 본다 | 사용자 「쭉 진행」 |

## 사람이 해야 하는 것 (Claude 는 토큰 · 비밀번호를 보지 않는다)

| 언제 | 할 일 |
|---|---|
| ✅ 끝 (2026-10-22) | 가비아 DNS A 레코드 `@` · `www` → 워커 공인 IP, TTL 600. 가비아 네임서버 셋 · 8.8.8.8 모두 워커 IP 로 답함 (처음 `@` 에 DNS 서버 주소가 들어가 고침) |
| A 시작 | GitLab 배포 토큰(`read_repository`) 만들기 → 서버 스크립트 질문에 붙여 넣기(`read -rs`, 화면에 안 보임) |
| A 중간 | Sealed Secrets 개인키를 내 PC 로 백업 (명령은 그때 드림. 저장소 · 기록에는 안 둠) |
| A 끝 (B 에서 공개하기 전) | Argo CD 첫 admin 비밀번호를 port-forward 로 들어가 직접 바꾸고 첫 비밀번호 Secret 지우기 |
| B 중간 | 팝업 아이디 · 비밀번호 하나를 서버 스크립트 질문에 입력(`read -rs`) — 스크립트가 htpasswd 로 바꿔 `argocd` · `monitoring` 에 봉인. 비밀번호는 길게(Envoy 기본 인증은 SHA1 해시만 받음) |
| C 시작 | GitHub classic 토큰 `read:packages` 만, 만료 11-30 → 서버 스크립트 질문에 붙여 넣기 (워커가 GHCR 에서 이미지를 받음) |
| C3 시작 | GitLab 프로젝트 액세스 토큰(Maintainer 가 만듦 · 역할 Developer · `api`, 만료 11-30) → CI 변수 `DEPLOY_MR_TOKEN`(Masked and hidden · Protected) |

DB 비밀번호는 서버 스크립트가 무작위로 만들어 바로 봉인한다 — 화면 · 로그에 찍지 않는다.

## 작업 순서

### 0. 준비
- [x] dev → infra 반영 MR (infra 가 !84 · !85 등 문서만큼 뒤짐) — !87, 시험 병합 충돌 0, 파이프라인 236675 통과, infra 90c6fec
- [x] 판 고정: Argo CD 차트 10.10.5(kind 와 같음) · Envoy Gateway v1.9.2(그대로) · Sealed Secrets 차트 2.20.0(v0.40.0, 09-10) · cert-manager v1.21.2(09-11) · local-path-provisioner v0.0.37(08-05) — 모두 나온 지 2주 넘은 최신 안정판

### A. Jira 91 — 브랜치 `chore/infra/S15P31A102-91-cluster-base` (infra 에서)
- [x] `infra/server/bootstrap-argocd.sh` 새로 — kind `up.sh` 4~5단계를 서버용으로: Argo CD helm 설치 → 저장소 Secret(배포 토큰을 `read -rs` 로) → `root-app.yaml` 을 저장소 주소 · 브랜치로 바꿔 건다. 브랜치를 인자로 받아 검증 때는 작업 브랜치, 머지 뒤 `dev`
- [x] `root-app.yaml` 에 finalizer 를 더한다 (지금은 루트를 지워도 자식 앱 · 자원이 남음)
- [x] `infra/k8s/bootstrap/argocd-values.prod.yaml` 새로 — `configs.params` 의 `server.insecure: true`(TLS 는 Envoy 가 끝냄) · `server.rootpath` · `server.basehref` 둘 다 `/argocd`, `configs.cm.url: https://newlearn.io.kr/argocd`, 자원 상한. 공통 값(`argocd-values.yaml`)에 Application 건강 Lua 를 더해 sync-wave 가 앞 앱의 준비를 기다리게 함(kind 에도 좋음)
- [x] `infra/k8s/apps/templates/sealed-secrets.yaml` 새로 — 네임스페이스 `sealed-secrets`(CreateNamespace 로만), `fullnameOverride: sealed-secrets-controller`, `keyrenewperiod: "0"`(키가 30일마다 늘어 첫 백업에서 빠지는 것을 막음). 서버의 kubeseal 은 `--controller-namespace sealed-secrets`. 개인키 백업은 이름표 `sealedsecrets.bitnami.com/sealed-secrets-key` 로 전부, 복구 절차를 README 에
- [x] 시험: hello 네임스페이스에 봉인한 Secret 하나 → Pod 가 읽는지(값 길이만) → 시험 Secret 은 지움
- [x] Envoy 가 워커 80 hostPort 로 뜨는지 — 내 PC 에서 `curl http://k15a102.p.ssafy.io/` → `hello v1`
- [x] Argo CD admin 비밀번호 — 사람이 port-forward 로 들어가 바꾸고 첫 비밀번호 Secret 을 지움 (B 에서 공개하기 전에)
- [x] Pod MTU — **고치기 전에 다시 잰다.** 10-22 의 「1420」은 busybox `ip route` 가 mtu 를 안 찍어서 생긴 착오일 가능성이 큼. 새 Pod 의 netns 에서 `nsenter … ip route get <상대 노드 Pod IP>`, netshoot 로 `ping -M do -s 1342`(통과) · `-s 1343`(로컬 mtu=1370 오류면 정상), 큰 전송을 두 방향 모두. 정상이면 문서만 고치고(SSOT 6 · 8 · 10절), 경로 MTU 가 정말 비어 있으면 그때 Cilium agent 재시작 · Pod 재생성부터 — 커밋을 따로
- [x] 문서: `SSOT.md` 6절(Argo CD 가 dev 를 읽음 · 부트스트랩 · Sealed Secrets 키 백업) · 8절(hostPort · MTU 줄 지움) · 10절(잰 것), `infra/server/README.md` 「Argo CD 깔기」, `.claude/stack.md` §6 「어디로」 줄을 지금 상태로, 이 계획 → `docs/plans/2026-10-22-infra-deploy.md`
- [x] MR → infra → infra → dev, 머지 뒤 루트 앱을 `dev` 로 바꿈. Jira 91 완료

### B. Jira 93 — 브랜치 `chore/infra/S15P31A102-93-domain-https`
- [x] 가비아 레코드 다시 확인(1.1.1.1 포함) + **헤어핀 시험**(워커 Pod → 두 이름 모두 hello — CoreDNS rewrite 필요 없음): 워커 Pod 에서 `curl -I http://newlearn.io.kr/` 가 Envoy 에 닿는지. cert-manager 가 발급 전에 이렇게 스스로 확인하는데, Lightsail 이 자기 공인 IP 로 되돌아오는 요청을 안 받으면 발급이 멈춤 → 그때는 CoreDNS rewrite 로 이 이름을 Envoy Service 로
- [x] `infra/k8s/apps/templates/cert-manager.yaml` — `crds.enabled: true`, `config.apiVersion: controller.config.cert-manager.io/v1alpha1` · `kind: ControllerConfiguration` · `gatewayAPI.enabled: true`(v1.21 에서 `enableGatewayAPI` 는 낡은 이름 — 소스로 확인). Gateway CRD 를 시작할 때 한 번만 보므로 envoy-gateway 앱 뒤 sync-wave(건강 Lua 로 실제로 기다림), 서버를 다시 만들 때 순서가 어긋나면 재시작한다고 README 에
- [x] `infra/k8s/gateway/` — ClusterIssuer 둘(staging · prod, HTTP-01 solver 는 Gateway `public` 의 `http` 리스너), Certificate(apex + www), Gateway 에 `https` 443 리스너, EnvoyProxy patch 에 `10443 → hostPort 443` — **리스너와 같은 커밋**이라 Envoy 교체는 한 번(약 2초 끊김, 서비스 올리기 전)
- [x] 라우트 규칙: 앱 · `/argocd` · `/grafana` 라우트는 모두 `parentRefs[].sectionName: https`. `http` 리스너에는 apex · www 이름을 적은 「→ https 넘기기」 라우트 하나만(ACME 경로는 solver 의 Exact 경로가 이김). hello 는 이름 `k15a102.p.ssafy.io` 로 묶어 겹치지 않게
- [x] staging 인증서로 먼저 발급 확인 → prod 로 바꿈 (Let's Encrypt 발급 한도 보호)
- [x] 팝업 잠금: `infra/server/seal-secrets.sh` 의 첫 기능으로 팝업 계정(htpasswd) 봉인 → `argocd` · `monitoring` 에 SecurityPolicy `basicAuth`. 두 라우트는 앱으로 보낼 때 `Authorization` 머리를 지움(Grafana 가 그 머리를 자기 로그인으로 읽어 팝업이 되풀이되는 것을 막음)
- [x] `/argocd` HTTPRoute(argocd 네임스페이스, 접두사를 떼지 않음, `timeouts.request: 0s` — 화면의 실시간 스트림이 15초에 끊기지 않게). Argo CD 값에 익명 읽기 전용(`users.anonymous.enabled` · `policy.default: role:readonly`). CLI 는 팝업 밖 port-forward 로
- [x] `/grafana` HTTPRoute + `monitoring-values.yaml`: `root_url` · `domain` → `https://newlearn.io.kr/grafana/`, 프록시 로그인(`auth.proxy` — Envoy 가 넘긴 팝업 아이디 머리로 자동 로그인 · 보기 권한, 바깥에서 같은 머리를 꾸며 보내도 Envoy 가 덮어쓰는지 확인). kps helm upgrade, 같은 판. 기존 `grafana-admin` 로그인은 남김. 그 뒤 SSH 터널 접속은 공개 주소로 넘어감
- [x] Envoy Gateway v1.9.2 가 팝업 아이디를 머리로 넘기는 설정을 지원하는지 먼저 확인 — 안 되면 Grafana 는 익명 보기(팝업 뒤)로 바꾸고 계획 차이를 알림
- [x] 문서: `SSOT.md` 6절(도메인 · 인증서 · 공개 경로 · 갱신 확인법) · 8절(인증서 방식 줄 지움), README
- [x] MR → infra → dev. Jira 93 완료

### C. 서비스 첫 배포 — 새 Jira 「[INFRA] 서비스 첫 배포 — DB · Redis · 앱 셋 · 태그 MR」(작업 · 상위 27 · infra newlearn-mvp · SP 5), 브랜치 `feat/infra/S15P31A102-<번호>-services`. 따로 되돌릴 수 있게 MR 셋으로 나눈다

> 계획과 다른 점(2026-10-22): C1 · C2 는 한 브랜치 · 한 MR 로 갔다(둘을 같이 확인). kind 리허설은 은퇴(사용자 선택). 첫 태그 중 frontend · ai 는 MR 파이프라인의 커밋(`9f436817`)을 적었다가 GHCR 에 없어 dev push 태그 `4abd39a2` 로 고침. 「`cmctl renew` 로 갱신 한 번」은 cmctl 대신 같은 방식(Issuing 조건)으로 — 소유 확인은 캐시라 안 돌아 입구 목록 확인으로 대신(SSOT 10절)

**C1 · 저장소 · DB · Redis**
- [x] `infra/k8s/apps/templates/local-path.yaml` — 공식 Helm 저장소가 없어 git 소스를 태그로 고정. `nodePathMap` 에 워커만(`/var/lib/newlearn/local-path`), 기본 SC `local-path`(Delete)는 끄고 `newlearn-local`(Retain · WaitForFirstConsumer)만
- [x] `infra/k8s/services/data/` — postgres StatefulSet(`pgvector/pgvector:0.8.7-pg18`, 마운트 `/var/lib/postgresql` — compose 와 같게, 20Gi) · redis StatefulSet(`redis:8.10.2`, AOF, `maxmemory 1gb noeviction`, limit 2Gi — AOF 재작성 fork 여유). volumeClaimTemplates 는 나중에 못 바꾸니 크기 · SC 를 여기서 확정, StatefulSet 에 `Delete=false`
- [x] `infra/server/seal-secrets.sh` — DB 비밀번호는 무작위로 만들어 바로 봉인, **봉인 파일이 이미 있으면 건너뜀**(postgres 는 처음 초기화 때만 읽음). 평문은 파일 · 화면 · `ps` 에 안 남김
- [x] 확인: postgres Pod 를 지웠다 다시 띄워도 데이터가 남는지. PVC 를 지웠을 때 살리는 법(`claimRef` 풀기)을 README 에

**C2 · 앱 셋 · 입구**
- [x] `infra/k8s/services/app/` — backend · frontend Deployment · Service · HTTPRoute(`sectionName: https`, `/api` → backend, `/actuator/health` 만 → backend, Swagger `/swagger-ui` · `/v3/api-docs` → backend 잠금 없이, `/` → frontend). backend 에 springdoc 이 아직 없어 Swagger 는 BE 가 넣으면 바로 열림 — Spring Security 허용 목록도 BE 몫이라 BE 팀원에게 알림. `infra/k8s/services/ai/` — ai Deployment(`LLM_MODE=mock`, Redis 는 `data` 네임스페이스). readiness · preStop 10초 · requests/limits 는 SSOT 「무중단 배포 조건」대로
- [x] GHCR 받기 Secret — `seal-secrets.sh` 가 사람이 넣은 토큰을 stdin 으로 dockerconfigjson 을 만들어 `app` · `ai` 에 따로 봉인(strict 범위라 이름 · 네임스페이스에 묶임 — kustomize 가 이름을 바꾸지 않게)
- [x] Gateway `allowedRoutes` — `kubernetes.io/metadata.name In [envoy-gateway-system, argocd, monitoring, app]` (cert-manager solver 는 `envoy-gateway-system` 에 생김). 좁힌 뒤 `cmctl renew` 로 실제 갱신을 한 번 돌려 봄. hello 앱은 지움
- [x] 첫 태그 = 지금 GHCR 에 있는 dev 최신 태그(영역별로 확인). 태그는 봇만 고치는 파일 한 곳(`infra/k8s/services/images.yaml` 같은)

**C3 · 태그 MR 잡** (팀 파이프라인이라 따로)
- [x] `.gitlab-ci.yml` — dev 파이프라인 끝에 `when: always` 잡. 성공한 w4 만 dotenv 로 태그를 남기고 그것만 반영. GHCR 에 그 태그가 있는지 HEAD 로 먼저 확인
- [x] 영역별 고정 브랜치(`deploy/backend` 등)를 Commits API(`start_branch=dev`, `force`)로 덮고, 열린 MR 이 있으면 갱신만 — 옛 MR 과 새 MR 이 부딪히지 않게. `resource_group` 으로 줄 세우고, 늦게 끝난 옛 파이프라인이 새 태그를 덮지 않게 조상 검사
- [x] 커밋 · MR 제목은 mr-check 규칙(`chore(infra): …`). dev 로 바로 가는 이 예외를 `docs/git-convention.md` 에 적음. 태그 MR 머지 뒤 전 영역 검사를 다시 도는 낭비는 workflow 규칙으로 건너뛸지 그때 봄
- [x] 토큰: 프로젝트 액세스 토큰(Maintainer 가 만듦, `api`, Developer, 만료 11-30) → CI 변수 `DEPLOY_MR_TOKEN`

- [x] 문서: `SSOT.md` 6절(네임스페이스 · DB · Redis · 반영 방식) · 8절, `.claude/stack.md` §5 L2 · L3 · §6 「새 환경변수」, README 「서비스 배포 · 되돌리기」, 팀 공지 문안(대화로 드림)
- [x] C1 · C2 · C3 각각 MR → infra → dev. C3 뒤 첫 태그 MR 이 자동으로 열리는지까지. 새 티켓 완료

### 기록 (단계마다)
- zoo_docs: status · cheatsheet · troubleshooting · 결과 txt(가림) · 화면 가이드(Argo CD · Grafana 공개 화면 캡처), learn 글은 질문이 나오면
- 메모리: 인프라 진행

## 바꿀 파일 (대표)
- 새로: `infra/server/bootstrap-argocd.sh` · `infra/server/seal-secrets.sh` · `infra/k8s/bootstrap/argocd-values.prod.yaml` · `infra/k8s/apps/templates/{sealed-secrets,cert-manager,local-path,services}.yaml` · `infra/k8s/gateway/{issuers,certificate,redirects}.yaml` · `infra/k8s/services/**`
- 고침: `infra/k8s/gateway/{gateway,envoyproxy}.yaml` · `infra/k8s/hello/`(B 에서 이름 묶기, C2 에서 지움) · `infra/k8s/bootstrap/{root-app,argocd-values,monitoring-values}.yaml` · `cilium-values.prod.yaml`(다시 재서 문제일 때만) · `.gitlab-ci.yml` · `docs/git-convention.md`(태그 MR 예외) · `SSOT.md` · `infra/server/README.md` · `.claude/stack.md` §5 · §6 · `docs/plans/2026-10-22-infra-deploy.md`
- 서버: EC2 · Lightsail 은 쿠버네티스 자원만. 노드 OS · ufw · WireGuard 는 안 건드림 (local-path 폴더는 프로비저너가 만듦)

## 안 바꿀 것
- 앱 코드(backend · frontend · ai 소스, Dockerfile), BE 의 !83 · 인증 코드
- GitLab Runner · kube-prometheus-stack · ci-exporter 를 Argo CD 로 옮기기 (Grafana `root_url` 한 줄만)
- 보안 그룹 · Terraform, WireGuard · ufw · kubeadm 설정
- GMS 키 · springdoc 넣기(BE) · pg_dump 서버 밖 보관 · API 인증 (각자 티켓 · SSOT 8절)
- 분야 브랜치 backend · frontend · ai 반영 (다음 동기화 때)

## 리스크
- **Argo CD · Grafana 를 인터넷에 연다** → HTTPS 뒤 팝업 잠금, admin 비밀번호는 사람이 바꾸고 첫 비밀번호 Secret 은 지움. 팝업을 넘으면 Argo CD 앱 목록 · 매니페스트(Secret 값은 가려짐)와 Grafana 대시보드가 보임. 팝업은 SHA1 해시라 비밀번호를 길게. 닫을 때는 HTTPRoute 하나만 지우면 됨
- **Swagger 를 잠금 없이 연다** → API 목록이 공개됨(API 자체도 공개 주소라 새로 열리는 것은 문서뿐). 발표 전에 다시 잠글지 SSOT 8절에 남김
- Sealed Secrets 개인키를 잃으면 저장소의 봉인 Secret 을 못 푼다 → 사람이 PC 에 백업. 서버를 다시 만들면 키부터 넣고 컨트롤러를 띄움
- Let's Encrypt 발급 한도(같은 이름 주당 5번) → staging 으로 먼저
- 80 · 443 hostPort 를 잡은 Envoy 를 바꿀 때 약 2초 끊김 → B 에서 한 번, 서비스 올리기 전
- Pod MTU 를 바꾸면 Cilium · Pod 가 다시 뜸 → 다시 재서 정말 문제일 때만, A 에서 서비스 올리기 전. 바꾸기 전 · 뒤를 같은 방법으로 잼
- 헤어핀(워커가 자기 공인 IP 로 되돌아오는 요청)이 안 되면 인증서 발급이 멈춤 → B 첫 단계에서 시험, 안 되면 CoreDNS rewrite
- Gateway CRD 보다 cert-manager 가 먼저 뜨면 Gateway 기능이 꺼진 채 돎 → sync-wave + Application 건강 Lua, 어긋나면 cert-manager 재시작
- allowedRoutes 를 좁히면서 `envoy-gateway-system` 을 빼면 60일 뒤 인증서 갱신이 소리 없이 실패 → 목록에 넣고 `cmctl renew` 로 확인
- DB 가 워커 디스크 하나에만 있음 → 워커를 잃으면 데이터도 잃음 (pg_dump 서버 밖은 SSOT 8절, 이 계획 밖). Retain 이라 PVC 를 지워도 폴더는 남음
- `.gitlab-ci.yml` 은 팀 모두의 파이프라인 → 새 잡은 dev 파이프라인에서만, 구운 영역이 있을 때만 돈다. MR 파이프라인은 그대로
- 태그 MR 토큰이 새면 저장소에 쓸 수 있음 → Protected(dev 에서만) · Masked, 권한 Developer · 만료 11-30
- 워커 자원(CPU 4 · 16Gi) — 추정 requests 합 CPU 약 1.5 · 메모리 약 4Gi(Argo CD 1Gi · DB 1Gi · Redis 1Gi · backend 1Gi · 나머지). 띄운 뒤 실제 값을 잰다
- dev 의 backend 이미지는 아직 SecurityConfig(!83) 전이라 기본 보안 — 헬스 말고는 401. 화면이 API 를 부르면 막힐 수 있음 → 배포 확인은 헬스 · 화면 첫 장까지, API 동작은 !83 이 dev 에 들어온 뒤

## 어떻게 검증하나
- **A (Jira 91 완료 기준)**: Argo CD 앱 전부 Synced · Healthy(`kubectl -n argocd get applications`) · 봉인 Secret 이 풀려 Pod 가 읽음(값 길이만 확인) · 내 PC 에서 `curl http://k15a102.p.ssafy.io/` = `hello v1` · Pod MTU 다시 잰 값(경로 MTU · DF ping 1342/1343 · 두 방향 큰 전송 · `nstat`)이 SSOT 10절에 · 루트 앱 finalizer 확인
- **B (Jira 93 완료 기준)**: `curl -sv https://newlearn.io.kr/` 인증서 발급자 Let's Encrypt · 이름 일치 · 만료일, `http://` 의 `/` · `/api` · `/argocd` 가 모두 301 `https://`(평문으로 안 열림), `www` → apex, `kubectl get certificate` Ready, `cmctl renew` 뒤 다시 Ready, `/argocd` · `/grafana` 를 계정 없이 부르면 401 + `WWW-Authenticate`(팝업), 틀린 비밀번호 401, 맞으면 Grafana 는 바로 대시보드 · Argo CD 는 읽기 전용 앱 목록(스크린샷), Argo CD 에서 동기화 버튼은 admin 로그인 뒤에만, 인증서 만료 지표가 Prometheus 에 있는지(Let's Encrypt 는 만료 메일을 안 보내고 Alertmanager 는 꺼져 있음), 갱신 확인법을 SSOT 에
- **C**: `https://newlearn.io.kr/` 화면 첫 장 스크린샷 · `/actuator/health` = `UP`(DB · Redis 포함) · `/v3/api-docs` 가 팝업 없이 backend 까지 감(springdoc 전이면 backend 의 404 · 401 이 보이는 것까지) · ai `/health` 200(클러스터 안) · postgres 재시작 뒤 데이터가 남음 · Argo CD 앱 전부 Synced · Healthy · backend 를 다시 굴리는 동안 `/actuator/health` 를 1초마다 불러 실패 0 · dev 파이프라인이 태그 MR 을 여는 것(같은 영역 두 번이면 MR 하나가 갱신됨) · 태그 MR 을 revert 하면 이전 이미지로 돌아가는 것
- 매 MR: 파이프라인 통과(`w0` · `w12:infra`, C 는 CI 변경이라 전체)

## 되돌리는 법
- A: 루트 앱을 지우면 finalizer 가 자식 앱 · 자원을 지움(A 에서 finalizer 를 더한 뒤. 그 전이면 자식 앱부터 지움) → `helm uninstall argocd -n argocd`. Cilium 을 건드렸으면 `helm rollback cilium`
- B: Gateway 443 리스너 · HTTPRoute · cert-manager 앱 revert(Argo CD 가 지움). 가비아 레코드는 사람이 지움. 발급된 인증서는 그대로 둬도 해 없음
- C: C1 · C2 · C3 MR 을 따로 revert. 서비스 앱을 지워도 StatefulSet 의 PVC 는 Argo CD 가 지우지 않고 PV 는 Retain 이라 데이터 폴더가 남음(되돌릴 때 손으로 지울지 정함). CI 잡은 C3 revert, 토큰은 GitLab · GitHub 에서 폐기
- 🔴 되돌릴 수 없는 것: 없음. 다만 외부에 남는 것 — Let's Encrypt 인증서 투명성 기록(도메인 이름이 공개 로그에 남음), DNS 레코드 캐시(TTL 만큼)
