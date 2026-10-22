# 배포 속도 줄이기 — Argo CD 웹훅 · Mattermost 배포 알림 · 굽기를 Lightsail 로 · ai 층 나누기 · 태그 머지 검사 건너뛰기

## 무엇을 / 왜

dev 에 머지된 코드가 사이트에 뜨기까지 오래 걸린다. 10-22 GitLab 잡 기록과 서버에서 잰 값으로 원인을 찾았다(SSOT 8절 「배포 속도 줄이기」).

| 원인 | 잰 값 |
|---|---|
| 굽는 자리 — 노트북 러너는 GHCR 받기가 초당 약 5MB | 같은 Kaniko 로 frontend 를 구우면 EC2 120 ~ 126초, 노트북 325 ~ 359초 |
| 압축을 끈 Kaniko 캐시(EC2 잡 메모리 2Gi OOM 때문, MR !60) | ai dev 굽기(캐시 씀) 680초(EC2) · 1040초(노트북). 캐시 없는 MR 굽기는 약 400초 |
| ai 실행 단계가 가상환경과 코드를 한 층으로 복사 | 코드만 바뀌어도 워커가 522MB 를 새로 받음 → ai 교체 71초(이미지가 있으면 8 ~ 9초) |
| Argo CD 가 Git 을 2 ~ 3분마다 봄 | 머지 뒤 사람이 새로 고침을 걸어야 30초 안에 반영 |
| 태그 MR 머지에도 dev 가 전 영역 검사를 다시 돎 | 100 ~ 346초 동안 러너를 붙듦(바뀐 것은 태그 한 줄) |

설계 조수 검토(10-22)에서 나온 함정 — 네트워크 정책을 MR 이 벗어나는 길, 봉인 Secret 이름표, argocd-server 재시작 순서, Kaniko 의 `COPY --from` 층 digest, 압축과 캐시 키 — 을 아래 단계에 넣었다.

## 🔴 뒤집는 결정 — 승인 전에 확인

- **「러너 · 잡 Pod 모두 관리 서버에만 둔다」(SSOT 6절)와 `.claude/stack.md` §4 「러너를 운영 서버와 같은 기계에 두지 않는다 — 빌드가 서비스와 CPU 를 다툰다」를 굽기 잡(w4)에 한해 뒤집는다.**
  - 이유: 여유가 있는 기계가 Lightsail 뿐이다. Lightsail 4 vCPU · 16GB · 디스크 309GB(5% 사용), 서비스 예약 CPU 0.99 · 메모리 2.7GB, 실제 메모리 약 2.2GB. EC2 는 2 vCPU · 8GB · 디스크 57% · CPU 예약 60% 라 잡 하나가 한계. EC2 를 키우면 팀 AWS 비용이 늘어 이번에 넣지 않는다
  - 다툼 줄이기: 잡 상한 CPU 2 · 메모리 3Gi, 동시 2, 서비스는 CPU 요청만큼 보장. 굽는 동안 `/actuator/health` 를 1초마다 재고, 나쁘면 동시 1 · 상한 축소, 그래도 나쁘면 되돌린다
  - SSOT 9절 「뒤집은 것」에 한 줄, stack.md §4 두 줄(러너 수 · 운영 서버 규칙)에 예외를 단다
- **굽기 도구는 Kaniko 그대로**(osscontainertools v1.28.6, 특권 없음). Docker(DinD)는 특권 컨테이너라 운영 노드에서 노드 root 가 된다 — 같은 노드에 postgres · redis · Argo CD application-controller(권한 `*`) · sealed-secrets-controller 가 있다(10-22 확인). 노드에 Docker 를 까는 것은 SSOT 6절 이유(containerd · Cilium iptables)로 이미 뺐다. BuildKit rootless 는 SSOT 6절대로 보안 설정을 풀어야 해서, 이번 측정 뒤에도 느릴 때 따로 정한다

## 정한 것

| 항목 | 정한 것 |
|---|---|
| Argo CD 반영 | GitLab 프로젝트 웹훅(push, dev) → `https://newlearn.io.kr/argocd/api/webhook`. 이 정확한 경로 · POST · `X-Gitlab-Event` 머리가 있을 때만 팝업 밖으로 두는 HTTPRoute 를 따로 둔다. 비밀 토큰은 봉인 Secret `argocd-webhook`(이름표 `app.kubernetes.io/part-of: argocd` 를 봉인 전에 붙임)에, Argo CD 값에는 참조만(`configs.secret.gitlabSecret: "$argocd-webhook:gitlab"`). `webhook.maxPayloadSizeMB: 1` |
| 배포 알림 (2026-10-23 사용자 선택) | Argo CD Notifications 를 켠다(지금 `notifications.enabled: false`). 받는 곳은 **배포 알림 전용 Mattermost 채널**의 들어오는 웹훅 — Argo CD 의 일반 `webhook` 알림으로 `{"text": …}` 를 보낸다(Mattermost 봇은 관리자 설정이 필요할 수 있어 뺌). 웹훅 주소는 봉인 Secret `argocd-notifications-secret`(키 `mattermost-url`)에, 차트는 그 Secret 을 만들지 않게(`notifications.secret.create: false`) |
| 알림 일 (사용자 선택) | ① **배포 완료** — `app` · `ai` 앱만, 동기화 성공 + Healthy 이고 **이미지 태그가 바뀔 때만 한 번**(`oncePer: app.status.summary.images`. 커밋마다로 두면 문서 머지에도 앱 10개가 울림). 앱 이름 · 이미지 태그 · Argo CD 링크 ② **동기화 실패** ③ **건강 나빠짐(Degraded)** — ②③ 은 앱 10개 모두(전역 구독). 메시지는 한국어 한두 줄 |
| 굽기 러너 | 새 프로젝트 러너 `newlearn-build`(태그 `newlearn-build`, 태그 없는 잡 안 받음, Protected 아님 — MR 굽기도 받게). 매니저 Pod 는 EC2, 잡 Pod 는 control-plane 이 아닌 노드(node_affinity DoesNotExist). 네임스페이스 `gitlab-runner-build`(잡이 바꿀 수 없음), 차트 0.88.4, 특권 없음 · 권한 상승 없음 · 계정 토큰 안 붙임. `/ci-cache` PVC 는 붙이지 않음(그 네임스페이스에 없음) |
| 잡 자원 | 동시 2, 요청 500m · 1Gi, 상한 CPU 2 · 메모리 3Gi(덮어쓰기 상한도 같게 — 넘게 요청하면 잡이 실패한다) |
| 잡 이름표 | 러너 설정에 고정 `pod_labels = {"newlearn.io/workload" = "w4"}`, 덮어쓰기 허용 안 함 |
| 잡 격리 | 네임스페이스 `gitlab-runner-build` 전체에 CiliumNetworkPolicy — 나가는 길은 바깥 인터넷(`world`) · kube-dns 53(UDP · TCP) · kube-apiserver(매니저용, 잡 Pod 는 토큰이 없음)뿐. MR 이 CI 파일을 고쳐도 네임스페이스는 못 바꾸므로 정책을 벗어나지 못함 |
| 어느 잡이 가나 | `.w4` 에만 `tags: [newlearn-build]`. 검사 잡(w0 · w12 · w3)과 w5 는 그대로 EC2 · 노트북 |
| Kaniko 옵션 | `--image-download-retry=3 --image-fs-extract-retry=3 --push-retry=3` 를 더한다. 캐시 압축은 이번에 안 바꾼다 — 캐시 키에 압축이 안 들어가 옛 캐시가 계속 맞으므로, 자리를 옮긴 효과를 먼저 재고 따로 정한다. 메모리는 `memory.events`(oom_kill) · `memory.stat`(anon)을 로그에 찍어 본다 |
| ai 층 | `ai/Dockerfile` 을 한 단계로 — uv 이미지 위에서 잠금 파일 COPY → `RUN uv sync` → `COPY app`. Kaniko 는 캐시가 맞은 RUN 층을 같은 blob 으로 다시 써서 가상환경 층 digest 가 같다(`COPY --from` 은 매번 새 digest). AI 팀원에게 알린다 |
| 태그 머지 검사 | dev 커밋 제목이 `Merge branch 'deploy/(app|ai)' into 'dev'` 면 w0:harness · w12:frontend · w12:ai · w3:backend 를 건너뛴다(`.skip-deploy-merge` 규칙을 맨 앞에 `!reference`). w0:rules · w12:infra 는 돈다 |
| MR 머지 | 계획 승인 = 아래 MR 과 그 MR 이 만든 태그 MR 을 검증 뒤 머지해도 된다는 지시. 머지 직전마다 원격 dev · 열린 MR 을 다시 본다 |
| 티켓 | 새 Jira 「[INFRA] 배포 속도 줄이기 · 배포 알림 — Argo CD 웹훅 · Mattermost · 굽기 러너 · ai 층」(작업, 상위 27, 스토리 포인트 5). 브랜치 `perf/infra/S15P31A102-<번호>-…` |

## 사람이 해야 하는 것 (Claude 는 토큰을 보지 않는다)

| 언제 | 할 일 |
|---|---|
| C 중간 | 서버에서 `bash infra/server/seal-secrets.sh argocd-webhook` — 무작위 토큰을 만들어 봉인하고 사람 터미널에만 한 번 보여 준다 |
| C 중간 | GitLab Settings › Webhooks — URL, Secret token(위 값), Push events(dev), SSL 확인 켬 → Test 로 200 확인(화면을 같이 보며) |
| C 중간 | Mattermost 에 배포 알림 전용 채널을 만들고 팀원 초대 → 그 채널에 들어오는 웹훅(통합 › Incoming Webhooks) 만들기 → 서버에서 `bash infra/server/seal-secrets.sh mattermost` 의 `read -rs` 질문에 주소 붙여 넣기(화면을 같이 보며). 메뉴가 없으면 멈추고 다른 길을 묻는다 |
| A 시작 (MR 을 열기 전) | GitLab Settings › CI/CD › Runners › New project runner — 태그 `newlearn-build`, Run untagged 끔, Protected 끔. 나온 토큰을 서버 명령의 `read -rs` 질문에 붙여 넣기(화면을 같이 보며) |

## 작업 순서 — 따로 되돌릴 수 있게 MR 셋, 각각 feature → infra → dev

### C. Argo CD 웹훅 · Mattermost 배포 알림 (먼저 — 뒤 단계의 반영 시간을 사람 손 없이 재고, 알림이 오는지도 같이 보려고)
- [ ] `infra/k8s/admin-ui/argocd.yaml` — HTTPRoute `argocd-webhook`: `sectionName: https`, Exact `/argocd/api/webhook`, method POST, 머리 `X-Gitlab-Event` 정규식 `.+` → `argocd-server:80`. SecurityPolicy 는 `argocd` 라우트만 가리킨다(정확 경로가 접두사보다 이김)
- [ ] `infra/server/seal-secrets.sh` — `argocd-webhook` 하위 명령(TTY 확인, `openssl rand -hex 32`, 봉인 파일이 있으면 건너뜀). 봉인 전에 `kubectl label --local … app.kubernetes.io/part-of=argocd` → `infra/k8s/admin-ui/sealed-argocd-webhook.yaml`
- [ ] `infra/k8s/bootstrap/argocd-values.prod.yaml` — `configs.secret.gitlabSecret` 참조 · `configs.cm."webhook.maxPayloadSizeMB": "1"`
- [ ] 서버 순서: Argo CD 가 봉인 Secret 을 풀었는지(`kubectl -n argocd get secret argocd-webhook --show-labels`, 이름표 확인) → `bash infra/server/bootstrap-argocd.sh`(같은 차트 10.10.5) → `kubectl -n argocd rollout restart deploy/argocd-server`(토큰 · 상한은 서버가 뜰 때 한 번 읽음) → admin 로그인 확인
- [ ] 배포 알림(같은 MR, 커밋 따로): `infra/server/seal-secrets.sh` 에 `mattermost` 하위 명령(TTY, `read -rs`, `https://…/hooks/…` 모양 확인, 화면 · 파일에 안 남김) → `infra/k8s/admin-ui/sealed-argocd-notifications.yaml`. `argocd-values.prod.yaml` 에 `notifications`(켜기 · 자원 상한 · `secret.create: false` · `notifiers` 의 `service.webhook.mattermost` · 템플릿 셋 · 트리거 셋 · 전역 구독 ②③). `infra/k8s/apps/templates/app.yaml` · `ai.yaml` 에 배포 완료 구독 주석. 위 helm upgrade 한 번에 같이 반영
- [ ] 알림 시험: 컨트롤러 Pod 에서 `argocd admin notifications template notify <템플릿> <앱> --recipient mattermost` 로 셋 다 채널에 오는지, 이어서 A 의 태그 MR 머지로 실제 배포 완료가 한 번만 오는지
- [ ] 문서: SSOT 6절 「배포 흐름」 · 공개 경로 · 「모니터링」(알림이 가는 곳), `infra/server/README.md` 웹훅 · 알림 절(토큰을 바꾸면 argocd-server 재시작, 웹훅 주소를 바꾸면 다시 봉인)

### A. 굽기 러너를 Lightsail 로 + Kaniko 재시도 + 태그 머지 검사 건너뛰기
- [ ] `infra/k8s/bootstrap/gitlab-runner-build-values.yaml` 새로 — 위 표의 값. affinity 표는 설정 끝에(TOML 표 순서 함정, 지금 값 파일 102 ~ 103줄 주석)
- [ ] `infra/k8s/bootstrap/build-netpol.yaml` 새로 — 위 표의 CiliumNetworkPolicy
- [ ] **서버 먼저 (MR 을 열기 전에 — MR 파이프라인부터 새 태그로 굽기 때문)**: 사람이 러너를 만들면 `gitlab-runner-build` 네임스페이스 · 토큰 Secret(`read -rs`) · 정책 apply · `helm upgrade --install`. 러너 online 확인. health 1초 재기를 백그라운드로 시작
- [ ] `.gitlab-ci.yml` — `.w4` 에 태그 · 자원(2 · 3Gi) · Kaniko 재시도 · 메모리 기록 줄. `.skip-deploy-merge` 와 검사 잡 넷의 첫 규칙. 틀린 주석 고침(12 ~ 13줄 「넘게 요청하면」 · 196줄 근처 「두 러너」)
- [ ] `infra/k8s/bootstrap/ci-exporter/ci-dashboard.json` — `namespace="gitlab-runner"` 세 곳을 `=~"gitlab-runner(-build)?"` 로, `kubectl apply -k`
- [ ] MR 파이프라인(굽기 셋, 올리지 않음) → infra → dev 파이프라인(굽기 셋, 캐시 씀, 올림) 시간을 영역별로 이전 값과 비교 → w5 태그 MR 머지로 웹훅 반영 · 검사 건너뛰기 확인
- [ ] 문서: SSOT 6절 CI 러너 · 굽는 도구 줄, 9절 뒤집은 것, 10절 잰 것, `.claude/stack.md` §4 두 줄, README 「굽기 러너」 절(online 확인 · 되돌리기)

### B. ai 층 나누기
- [ ] `ai/Dockerfile` 한 단계로(위 표). 런타임에 `/app` 의 다른 파일을 읽는 코드 없음(조수가 origin/dev 에서 확인) — 실행 사용자 10001 · `UV_COMPILE_BYTECODE` · `PATH` 는 그대로
- [ ] 로컬 확인: `docker build` · `docker run` 으로 `/health` UP, 크기 비교. 노트북에 임시 레지스트리(`registry:2`)를 띄우고 Kaniko 로 코드만 다르게 두 번 구워 가상환경 층 digest 가 같은지
- [ ] dev 반영 뒤 ai 교체 시간. AI 팀원 알림 문안(대화로 드림)

### 기록
- zoo_docs: learn 글 「CI 잡에 root 를 주면 왜 안 되나」(이번 질문), status · troubleshooting · cheatsheet · decisions(굽기 자리 뒤집기), 결과 txt
- 메모리: 인프라 진행

## 바꿀 파일
- 새로: `infra/k8s/bootstrap/gitlab-runner-build-values.yaml` · `infra/k8s/bootstrap/build-netpol.yaml` · `infra/k8s/admin-ui/sealed-argocd-webhook.yaml` · `infra/k8s/admin-ui/sealed-argocd-notifications.yaml`
- 고침: `.gitlab-ci.yml` · `ai/Dockerfile` · `infra/k8s/admin-ui/argocd.yaml` · `infra/k8s/bootstrap/argocd-values.prod.yaml` · `infra/k8s/apps/templates/app.yaml` · `ai.yaml` · `infra/k8s/bootstrap/ci-exporter/ci-dashboard.json` · `infra/server/seal-secrets.sh` · `infra/server/README.md` · `SSOT.md`(6 · 8 · 9 · 10절) · `.claude/stack.md` §4
- 서버: 쿠버네티스 자원 · helm 릴리스만. 노드 OS · Docker 설치 없음

## 안 바꿀 것
- 굽기 도구 교체(BuildKit · Docker), Kaniko 캐시 압축 — 이번 측정 뒤 따로
- EC2 러너 · 노트북 러너 설정, 검사 잡이 도는 자리
- Argo CD 폴링 주기 · 동기화 정책(웹훅이 막히면 그때 묻는다)
- 앱 코드 · ai 의존성(torch 등) · Swagger 길(BE 가 springdoc 을 넣은 뒤 `/swagger-ui.html` 한 줄)
- EC2 크기 · Terraform

## 리스크
- **굽기가 운영 서비스와 CPU 를 다툼** → 잡 상한 · 동시 2, 서비스는 CPU 요청 보장. 굽는 동안 health 1초마다 — 실패나 3초 넘김이 있으면 동시 1 · 상한 1.5 로 줄이고 다시 잰다
- 메모리 — 상한 합(서비스 10.3Gi + 굽기 6Gi)이 할당 15.3Gi 를 넘는다(실사용 약 2.2GB). 모자라면 커널은 요청보다 많이 쓴 굽기 Pod 를 먼저 죽인다
- 운영 노드에서 팀 MR 의 Dockerfile · 의존성 설치가 돈다(특권 없음, 네임스페이스 정책으로 클러스터 안 접근 막음). 커널 취약점으로 컨테이너를 벗어나는 위험은 남는다
- 굽기 러너가 죽으면 w4 가 태그 때문에 기다림 → README 에 online 확인. 급하면 `.w4` 태그를 빼되 **자원도 1 · 2Gi 로 같이 되돌려야** EC2 러너에서 실패하지 않는다(그래서 되돌리기는 MR revert 로)
- 웹훅 입구가 인터넷에 열림 → POST · 정확 경로 · GitLab 머리만, Argo CD 가 토큰 확인, 본문 1MB. 봉인 Secret 이름표가 빠지면 참조 글자 그대로가 토큰이 되므로 그 글자로 보낸 요청이 거절되는지 시험한다
- SSAFY GitLab 이 바깥으로 웹훅을 못 보낼 수 있음 → Test 로 먼저 확인, 막히면 멈추고 폴링 주기를 줄일지 묻는다
- Mattermost 들어오는 웹훅 주소는 그것만 있으면 누구나 그 채널에 글을 쓸 수 있다 → 봉인 Secret 에만, 새면 Mattermost 에서 지우고 새로 만들어 다시 봉인. SSAFY Mattermost 가 바깥(우리 서버)에서 오는 요청을 막으면 알림이 안 간다 → 템플릿 시험에서 바로 드러남
- 알림이 너무 잦으면 채널이 묻힘 → 배포 완료는 이미지 태그가 바뀔 때만, 실패 · Degraded 는 상태가 바뀔 때만. 첫 주에 몇 건 왔는지 세어 본다
- `bootstrap-argocd.sh` · 재시작 때 Argo CD 화면이 잠깐 끊김(서비스 영향 없음). admin 비밀번호 키는 차트가 건드리지 않음 — 로그인으로 확인
- ai 를 한 단계로 바꾸면 실행 이미지에 uv 가 들어가 조금 커진다 — 로컬에서 크기를 잰다. 아래 층(잠금 파일 COPY)은 매번 바뀌어 워커가 가상환경 층을 다시 풀기는 한다(받지는 않음)
- 태그 머지 규칙은 제목으로 맞춰서, GitLab 머지 커밋 제목 모양이 바뀌면 그냥 검사가 다시 돈다(안전한 쪽). revert MR 머지도 전 영역 검사가 돈다
- `.gitlab-ci.yml` · stack.md 는 팀 모두의 것 → MR 본문에 바뀌는 점, 팀 공지 문안(대화로 드림)

## 어떻게 검증하나
- **C**: GitLab 웹훅 Test → Recent events 200. 밖에서 토큰 없는 POST(GitLab 머리 포함) → Argo CD 의 400(Envoy 401 · `WWW-Authenticate` 아님), 참조 글자를 토큰으로 넣은 POST 도 거절, `GET /argocd` 는 그대로 팝업 401. 태그 MR 머지부터 Deployment 이미지가 바뀌기까지 손으로 새로 고침 없이 — 목표 15초 이내. 알림 — 템플릿 셋이 채널에 옴(스크린샷), 태그 MR 머지 한 번에 배포 완료 메시지가 그 앱당 한 번, 문서만 바꾼 dev 머지에는 안 옴
- **A**: 러너 online, 잡 Pod 가 Lightsail 노드에 뜸(`-o wide`), 이름표 w4. 정책 — 그 네임스페이스의 시험 Pod 에서 `postgres.data:5432` 실패 · `https://ghcr.io` 성공. MR · dev 굽기 시간을 영역별로 이전 값(ai 680 · 1040, frontend 120 · 325, backend 137 ~ 566초)과 비교, `oom_kill` 0. 굽는 동안 health 실패 0. 태그 MR 머지 dev 파이프라인에 w0:rules · w12:infra 만
- **B**: 로컬 Kaniko 두 번 굽기에서 가상환경 층 digest 같음, 컨테이너 `/health` UP. dev 반영 뒤 ai 교체 시간(받는 양)
- 매 MR 파이프라인 통과. `.gitlab-ci.yml` 은 CI Lint(dev 시뮬레이션)로 먼저

## 되돌리는 법
- C: MR revert(웹훅 라우트 · 봉인 Secret 두 개는 Argo CD 가 지움) → `bootstrap-argocd.sh` 로 값 되돌림(알림 컨트롤러도 내려감) · argocd-server 재시작 → GitLab 웹훅 · Mattermost 들어오는 웹훅 삭제(사람)
- A: MR revert(w4 가 태그 없이 1 · 2Gi 로 EC2 · 노트북에) → `helm uninstall gitlab-runner-build -n gitlab-runner-build` · 정책 · 네임스페이스 삭제 → 대시보드 되돌림 → GitLab 에서 러너 삭제(사람)
- B: MR revert
- 🔴 되돌릴 수 없는 것: 없음. GHCR 캐시 저장소에 쌓인 층은 남는다(해 없음)
