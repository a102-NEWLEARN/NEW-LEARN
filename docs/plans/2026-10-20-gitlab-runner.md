# GitLab Runner 를 관리 서버에 (Kubernetes executor) · 다음 인프라 Jira 티켓

## 무엇을 / 왜

이 프로젝트에서 잡을 받을 러너가 없어 CI 가 아예 돌지 않는다. 2026-10-20 브라우저 화면으로 다시 확인했다:

| 본 곳 | 결과 |
| --- | --- |
| Help 화면 | GitLab Community Edition **v18.11.5** |
| Settings › CI/CD › Runners › Assigned project runners | No project runners found |
| 같은 화면 › Group | No group runners found |
| 같은 화면 › Instance | 켜기 스위치는 켜져 있으나 No instance runners found |
| 같은 화면 › Other available project runners (2) | 다른 프로젝트의 러너 2개, 둘 다 **Stale**(마지막 연락 2주 전 · 4달 전) — 쓸 수 없다 |
관리 서버(EC2)에 GitLab Runner 를 **클러스터 안 Pod 로**(Kubernetes executor, 2026-10-20 사용자 선택) 올려 GitLab 에 `online` 으로 붙이고, 시험 잡 하나가 도는 것까지 확인한다.
같이, 서버 받기 뒤 남은 인프라 일을 Jira 티켓 다섯 개로 만든다(러너 + 네 개).

왜 Kubernetes executor 인가: 서버에 Docker 를 깔면 kubelet 과 containerd(Ubuntu 패키지 2.2.1)를 같이 쓰고, Docker 의 iptables 규칙이 Cilium(호스트 라우팅 Legacy · iptables 마스커레이드)과 같은 표를 만진다. Pod 로 띄우면 서버 패키지 · 네트워크 설정이 그대로이고 잡마다 CPU · 메모리 상한을 건다.

## 잡 CPU 상한 1 이면 충분한가 (2026-10-20 사용자 질문)

**시작은 1 로 충분하고, 진짜 천장은 상한이 아니라 CPU 크레딧이다.** 실제 CI 잡(4번 티켓)에서 재고 필요하면 1.5 로 올린다.

| 본 것 | 값 | 출처 |
| --- | --- | --- |
| 관리 서버가 지금 쓰는 CPU | 유휴 88 ~ 92% → 2 vCPU 중 약 0.2 | `vmstat 2 6` (2026-10-20) |
| 이미 잡힌 CPU 요청 | 950m / 2000m (47%) — apiserver 250m · controller 200m · etcd · scheduler · CoreDNS 2개 각 100m | `kubectl describe node` |
| t3.large 크레딧 | 시간당 36 적립, 최대 864, 기준선 vCPU 당 30%(= 전체 0.6 vCPU) | AWS 문서 「Key concepts for burstable performance instances」 |
| 크레딧 방식 | `standard` — 다 쓰면 노드 **전체**가 기준선(0.6 vCPU)으로 묶임. T3 는 시작 크레딧이 없어 오늘 0 에서 쌓이는 중 | `describe-instance-credit-specifications` · 같은 문서 |
| 지금 잔액 | 못 잼 — apply 키에 CloudWatch 읽기 권한이 없음 (AccessDenied) | — |

- **상한 1 의 몫:** 잡이 아무리 바빠도 1 vCPU 는 apiserver · etcd 에 남는다. 요청 500m 를 더해도 1450m 로 노드에 들어간다
- **크레딧 계산:** 동시 1 · 상한 1 이면 노드는 최대 약 1.2 vCPU 를 쓴다 → 시간당 72 소비, 36 적립 → 쉬지 않고 돌려도 순감 36/시간. 꽉 찬 잔액(864)이면 **24시간 연속 CI** 를 버틴다
- **상한을 2 로 올리면:** 같은 일의 총 CPU 시간은 거의 같아 크레딧은 비슷하게 쓰고(조금 더 씀) 빨리 끝난다. 대신 잡이 도는 동안 컨트롤 플레인 몫이 요청 비율로만 지켜진다
- **느릴 수 있는 곳:** 백엔드 Gradle 컴파일 · 테스트(여러 스레드). 4번 티켓에서 실제 잡 시간을 재서 오래 걸리면 1.5 로 올린다
- **오늘 조심할 것:** 오늘 띄운 서버라 잔액이 적다. 처음 며칠 무거운 빌드를 몰아 돌리면 기준선으로 묶일 수 있다 → 잔액은 사용자가 EC2 콘솔 Monitoring 탭(CPUCreditBalance)에서 본다

## 바꿀 파일

- `infra/k8s/bootstrap/gitlab-runner-values.yaml` (새 파일) — 차트 `gitlab/gitlab-runner` **0.88.4**(러너 18.11.4, GitLab 18.11 과 판 맞춤) 값
  - `gitlabUrl: https://lab.ssafy.com/`, `runners.secret: gitlab-runner-token`(토큰은 파일에 안 씀), `concurrent: 1`, `rbac.create: true`
  - 러너 Pod 와 잡 Pod 모두 관리 서버에만: `nodeSelector`/`node_selector` `node-role.kubernetes.io/control-plane`, control-plane `NoSchedule` 견딤(`tolerations`/`node_tolerations`)
  - 잡 상한: 빌드 CPU 1 · 메모리 2Gi(요청 500m · 1Gi), helper · service 상한, `privileged = false`, `allow_privilege_escalation = false`, `automount_service_account_token = false`, 기본 이미지 alpine(판 고정)
- `infra/server/README.md` — 「GitLab Runner」 절 추가: GitLab 화면에서 러너 만들기 → 서버에서 토큰 Secret 만들기(`read -rs`, 화면 · 기록에 안 남김) → `helm upgrade --install` → 확인 → 지우기. 「되돌리기」 절에 한 줄
- `SSOT.md` — 6절: Runner 줄을 「관리 서버 · Kubernetes executor · 동시 1」로, 「관리 서버 주의 — containerd」에 Docker 를 안 깔아서 해당 없음을 한 줄, 「현재 상태」에 러너. 10절: 러너 설치 · 시험 잡 시간
- `docs/plans/2026-10-20-gitlab-runner.md` — 이 계획 파일 이름을 날짜 형식으로 바꿔 남김 (`.claude/stack.md` §7)

## 작업 순서

- [x] **Jira 티켓 5개** (89 러너 · 90 워커 연결 · 91 클러스터 기본 구성 · 92 CI 파이프라인 · 93 도메인 · HTTPS) — 88 과 같은 형식: `[INFRA] …` · 작업 · 상위 S15P31A102-27 · 라벨 `infra` `newlearn-mvp` · 스프린트 「1차 개발」 · 담당 나 · 설명은 왜 / 할 일 / 완료 기준
  1. GitLab Runner 를 관리 서버에 (이번 일, 바로 「진행 중」)
  2. Lightsail 워커 연결 — 받는 날 첫 확인(UDP 응답 · 443 · 고정 IP) → `worker_cidrs` apply → WireGuard → kubeadm join
  3. 클러스터 기본 구성 — Argo CD · Sealed Secrets · Envoy Gateway, 공인 IP 80 확인 (2 뒤)
  4. CI 파이프라인 — `.gitlab-ci.yml` 게이트(커밋 검사와 같은 명령) · 이미지 빌드 방식(클러스터 안 빌더) · 이미지 저장소 · 태그 형식 결정 (1 뒤)
  5. 도메인 · HTTPS — 가비아 DNS(newlearn.io.kr) · 인증서 발급 방식 결정 · 443 (3 뒤)
  — 확인: 다섯 개가 보드 「1차 개발」에 보이고 1번만 진행 중
- [x] **작업 브랜치 · 값 파일** — `infra` 에서 `chore/infra/S15P31A102-89-gitlab-runner`. 값 파일 작성 → 서버에서 `helm template` 으로 렌더링만 해서 config.toml · Pod 사양 확인
- [x] **러너 만들기 (사용자가 GitLab 화면에서)** — 칸은 Claude 가 채우고 Create 는 사용자. 「Lock to current projects」 켬 · 「Maximum job timeout」 3600 을 더함 — Settings › CI/CD › Runners › New project runner: 태그 `newlearn-k8s`, 「Run untagged jobs」 켬, 설명 `newlearn-ec2-k8s`. 나오는 `glrt-` 토큰은 **사용자만** 본다 — Claude 는 토큰 화면을 캡처하거나 읽지 않는다
- [x] **토큰 Secret (사용자가 서버에서)** — README 의 `read -rs` 명령을 사용자 터미널에서 친다. Claude 는 Secret 이 있는지(키 이름 · 길이 > 0)만 본다
- [x] **설치** — 첫 설치에서 TOML 표 순서 실수로 등록 실패(`node_tolerations` 뒤의 키가 그 표로 들어감) → 표를 맨 끝으로 옮겨 다시 설치 — 폴더 보내기(README 「서버로 보내기」 tar 줄) → `helm upgrade --install gitlab-runner gitlab/gitlab-runner --version 0.88.4 -n gitlab-runner -f …` (서버의 helm 4.3.1, 차트 저장소 추가 포함) — 확인: 러너 Pod Running(관리 서버), 로그에 오류 없음, GitLab API 에서 러너 `online`
- [x] **시험 잡** — 첫 push 에 `-o ci.skip=false` 를 붙여 파이프라인이 skipped 로 남음(옵션이 있으면 값과 상관없이 건너뜀) → API 로 다시 돌려 성공. 임시 브랜치 삭제는 권한 확인에서 막혀 사용자에게 물음 — 임시 브랜치 `chore/infra/S15P31A102-89-runner-smoke` 에 `alpine` 으로 `echo · uname -m · nproc` 만 하는 `.gitlab-ci.yml` 을 올려 파이프라인 1번 → 성공 · 잡 Pod 가 관리 서버에서 생겼다 사라짐 확인 → **임시 브랜치는 원격 · 로컬 모두 지운다**(이 브랜치는 머지하지 않는다)
- [x] **클러스터 건강 다시** — 노드 Ready, kube-system Pod 9개 Running, `free -m`
- [ ] **문서 · MR** — SSOT · README 고치고 커밋(게이트 통과) → MR(→ infra), 템플릿 본문 → 머지 직전 원격 확인 후 Merge 버튼 → Jira 1번 완료. infra → dev 반영은 끝나고 따로 묻는다
- [ ] **zoo_docs** — learn 28(러너 · executor 종류 · 왜 Pod 로), decisions 19, 캡처(러너 만들기 화면 · online 화면 — 토큰 칸 없는 것만), 화면 가이드 갱신, status.md, 커밋 · push

## 안 바꿀 것

- 서버 패키지(apt) · containerd 설정 · Cilium 값 · Terraform · 보안 그룹 — 손대지 않는다
- 저장소의 실제 `.gitlab-ci.yml`(게이트) — 4번 티켓 일. 이번에는 임시 브랜치 시험 파일만
- 머지 막기 설정(Pipelines must succeed 등) · 브랜치 보호 — 안 건드림
- Argo CD 로 러너를 관리하는 것 — Argo CD 를 까는 3번 티켓 뒤에 옮긴다
- 이미지 빌드 · 캐시 · S3 캐시 — 4번 티켓

## 리스크

- **CI 잡이 컨트롤 플레인과 CPU 를 나눈다** (2 vCPU, t3 CPU 크레딧). 동시 1 · 잡 CPU 상한 1 로 apiserver · etcd 몫을 남긴다. 무거운 빌드가 이어지면 크레딧이 줄어 느려질 수 있다 — 4번 티켓에서 잰다
- **팀원 MR 의 코드가 관리 서버의 Pod 안에서 돈다.** 권한 없는 컨테이너 · 서비스 계정 토큰 없음 · 네임스페이스 분리로 줄인다. 완전히 막지는 못한다
- **토큰은 쿠버네티스 Secret(etcd, 암호화 안 됨)에 있다.** 서버 root 만 읽는다. 새면 GitLab 화면에서 러너를 지우고 새로 만든다
- 차트 0.88.4 는 4개월 전 판이다 — GitLab 과 판을 맞추려는 선택. GitLab 이 19 로 오르면 같이 올린다
- 임시 브랜치를 올리면 팀 저장소에 파이프라인 기록 1건이 남는다

## 어떻게 검증하나

- 값 파일: 서버에서 `helm template … --version 0.88.4 -f gitlab-runner-values.yaml` 렌더링에 오류 없음, config.toml 에 상한 · node_selector · tolerations 가 들어감
- 설치: `kubectl -n gitlab-runner get pods -o wide` Running · 노드가 관리 서버, `kubectl -n gitlab-runner logs deploy/gitlab-runner` 에 등록 오류 없음
- GitLab: `/api/v4/projects/:id/runners` 에 러너 1개 `online`
- 시험 잡: 파이프라인 성공, 잡 로그에 `runner ok` · `x86_64` · `nproc`, 잡이 걸린 시간 기록
- 그 뒤 클러스터: 노드 Ready, kube-system 9개 Running
- 잡 Pod 사양에 CPU 요청 500m · 상한 1 이 들어갔는지 (`kubectl get pod -o yaml`, 잡이 도는 동안)
- 사용자가 EC2 콘솔 Monitoring 탭에서 CPUCreditBalance 를 한 번 본다 (apply 키는 CloudWatch 권한 없음)
- 커밋 게이트(infra 린트) 통과, MR 템플릿 체크리스트

## 되돌리는 법

- 러너: `helm uninstall gitlab-runner -n gitlab-runner`(러너 매니저 등록도 지움) → `kubectl delete namespace gitlab-runner` → GitLab 화면에서 러너 삭제. 서버 패키지를 안 바꿔서 이걸로 원래대로
- 문서: MR 병합 커밋 Revert
- Jira: 만든 티켓은 닫거나 지운다
- 되돌릴 수 없는 것: 임시 브랜치 파이프라인 기록 1건
