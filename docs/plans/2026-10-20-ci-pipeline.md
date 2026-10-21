# Jira S15P31A102-92 CI 파이프라인 — MR 검사(W0~W3) · 노트북 러너

2026-10-20 사용자 승인. 이미지 빌드 · 저장소 · 태그는 S15P31A102-96 으로 나눴다.

## 무엇을 / 왜

- 러너(EC2, Kubernetes executor)는 있는데 저장소에 `.gitlab-ci.yml` 이 없어서 MR 검사가 돌지 않는다. 하네스 게이트(`.claude/hooks/pre-commit --ci <영역>`)를 영역별 잡으로 부르고, 잡을 「무엇에 막히나」로 나눈 갈래(W0~W3)마다 언제 돌지 · CPU 요청과 상한 · 시간 목표를 따로 둔다.
- 백엔드 테스트는 Testcontainers 라 Docker 가 필요해서 EC2 잡 Pod 에서는 못 돈다. 그래서 CI 에서는 GitLab services 로 DB · Redis 를 띄운다. 이렇게 하면 같은 잡 정의가 노트북 러너(Docker executor)에서도 돈다 — 2026-10-20 사용자가 고른 권고 B: EC2 는 늘 켜진 기본 러너, 노트북은 켜져 있을 때 더해지는 큰 러너.
- 범위 밖으로 정한 것
  - 이미지 빌드 · 저장소 · 태그(W4)는 새 Jira 로 나눈다. SSAFY GitLab 레지스트리는 2026-10-20 에도 이미지 주소가 없고 화면이 404 다. 이미지를 받을 워커 · Argo CD(Jira 90 · 91)도 아직 없다.
  - 머지 막기(Pipelines must succeed)는 며칠 돌려 본 뒤 사용자가 정한다.

## 파이프라인 모양

- 도는 때: MR 이벤트와 `dev` push (하네스 껍데기의 workflow 그대로). 새 커밋이 오면 옛 파이프라인을 취소한다(`interruptible`).
- 단계: `rules` → `check`. 영역 잡은 `rules` 가 초록일 때만 뜬다.

| 잡 | 갈래 | 무엇 | 언제 (MR) | CPU 요청 · 상한 / 메모리 (처음 값) |
|---|---|---|---|---|
| `rules` | W0 | 시크릿 스캔 `secret-scan.sh --all` + MR 이력 `--range`, MR 규칙 `mr-check.sh` | 늘 | 100m · 0.5 / 128Mi · 256Mi |
| `harness` | W0 | 하네스 자체 검사 `hooks/tests/run.sh` | `.claude/**` 가 바뀔 때만 | 250m · 1 / 512Mi · 1Gi |
| `frontend` · `ai` · `infra` | W1 + W2 | `pre-commit --ci <영역>` (설치 → 포맷 → 린트 → 테스트 → 빌드) | 그 영역 폴더 · `_ALSO_PATHS` · `.claude/**` · `.gitlab-ci.yml` 이 바뀔 때 | 250m · 1 / 1Gi · 2Gi (infra 512Mi · 1Gi) |
| `backend` | W3 | `pre-commit --ci backend` + services `pgvector/pgvector:0.8.7-pg18`(alias `postgres`) · `redis:8.10.2`(alias `redis`) | 위와 같음 | 300m · 1 / 1Gi · 2Gi, 서비스 각 100m |

- `dev` push 에서는 `changes:` 없이 모든 잡을 돌린다.
- 하네스 껍데기와 다른 점 두 가지 (`.gitlab-ci.yml` 주석에 이유를 적는다)
  - 영역마다 fast · slow 두 잡이 아니라 한 잡이다. 자리가 1개라 두 잡이면 Pod 와 설치가 두 번이다(ai 의존성 약 1 GB). 게이트 안의 순서가 포맷 → 린트 → 테스트라 포맷 오류는 그대로 먼저 실패한다.
  - 하네스 자체 검사는 `.claude/` 가 바뀔 때와 `dev` 에서만 돈다. `pre-commit` 주석에 Windows 에서 한 번에 597초라고 적혀 있다.
- 자리 계산: 노드 CPU 예약 1190m, 남은 몫 810m. backend 잡은 300 + helper 50 + 서비스 200 = 550m 로 들어간다. EC2 동시 실행은 1 그대로 두고, 잰 뒤 정한다.
- 잡 Pod 에 라벨 `newlearn.io/workload=w0~w3` 을 붙인다. 잡 로그 끝에 `/sys/fs/cgroup/cpu.stat` 을 한 줄 남겨 스로틀을 본다.
- JUnit 리포트: backend 는 Gradle XML 을 그대로 올리고, ai 는 `PYTEST_ADDOPTS=--junitxml=…` 환경 변수로 만든다. `stack.md` 의 명령은 그대로 둔다.
- 이미지는 digest 로 고정하고 버전을 주석으로 단다 (껍데기 15~17줄).
  - 게이트에는 bash · git · GNU grep 이 필요하다.
  - 처음 안: W0 은 `buildpack-deps:trixie-scm`, frontend 는 `node:26-trixie`, ai 는 uv 0.13.1 python3.14 trixie(slim 아님 — git 포함), infra 는 `hashicorp/terraform:1.16.x` 에 `apk add bash git grep`, backend 는 git 이 든 JDK 25 이미지(없으면 temurin 25 에 apt 로 git).
  - 구현할 때 태그와 digest 를 확인한다.
- 시간 목표 (처음 값, 여신보좌관 실측보다 짧게)

| 지표 | 목표 | 여신보좌관 실측 |
|---|---|---|
| MR 파이프라인 중앙값 | 5분 | 약 11분 |
| MR 파이프라인 p90 | 10분 | 약 30분 |
| 기다림 p90 | 2분 | 23분 |
| backend 잡 중앙값 | 7분 | 9분 29초 |

## 바꿀 파일

MR 1 — 파이프라인 (브랜치 `chore/infra/S15P31A102-92-ci-pipeline` → `infra`)
- `.gitlab-ci.yml` (새) — 위 잡들. `.claude/ci/gitlab-ci.yml` 의 workflow · default · secrets · 영역별 예시를 바탕으로 쓰고, 검사 명령은 적지 않는다
- `backend/src/test/java/kr/io/newlearn/TestcontainersConfiguration.java`
  - `@ConditionalOnProperty(name = "newlearn.test.testcontainers", havingValue = "true", matchIfMissing = true)` 를 단다. 로컬 기본 동작은 그대로다
  - CI 는 `NEWLEARN_TEST_TESTCONTAINERS=false` 에 `DB_HOST` · `POSTGRES_*` · `REDIS_HOST` 를 주고, `application.yaml` 이 이미 이 값들을 읽는다
- `infra/k8s/bootstrap/gitlab-runner-values.yaml`
  - 빌드 · 서비스 CPU · 메모리의 `*_overwrite_max_allowed`: 상한은 지금 기본값과 같은 요청 500m · 상한 1 · 메모리 2Gi 까지. 이 값이 없으면 잡의 `KUBERNETES_*` 변수가 무시된다
  - `pod_labels_overwrite_allowed`
  - 기본값 · 권한 설정은 그대로다. 서버에서 `helm upgrade` 한다
- `.claude/stack.md` — §3 `backend_TEST` 주석에 「CI 는 services」를 적고, §4 에 러너 동시 실행 줄을 더한다
- `SSOT.md` — 6절 CI 줄(파이프라인 모양 · 갈래 · 시간 목표 · 머지 막기는 사용자가 정함), 10절 잰 값
- `infra/server/README.md` 「GitLab Runner」 — 확인 표에 덮어쓰기 확인을 더한다

MR 2 — 캐시 (MR 1 에서 잰 설치 시간이 크면만)

> 2026-10-20 바꿈 (사용자 승인): 아래 GitLab `cache:` 방식을 재 보니 잡마다 다시 압축해서 캐시 없음보다 느렸다(파이프라인 572초 vs 480 ~ 490초).
> 그래서 PVC 를 `/ci-cache` 로 붙이고 npm · uv · Gradle 이 캐시 폴더로 바로 쓰게 했다(320초). infra 는 캐시를 쓰면 더 느려 뺐다.
> 모든 브랜치가 같은 캐시를 쓰는 것(Gradle 은 내용 검사 없음)은 같은 팀 저장소라 받아들였다. 잰 값은 `SSOT.md` 10절
- `infra/k8s/bootstrap/ci-cache-pv.yaml` (새) — 정적 PV `/var/lib/newlearn/ci-cache` (StorageClass `newlearn-local-manual`, `prometheus-pv.yaml` 과 같은 방식) + PVC `gitlab-runner-cache`
- 러너 값 — `cache_dir = "/cache"` 와 `[[runners.kubernetes.volumes.pvc]]` (TOML 표는 맨 끝 규칙)
- `.gitlab-ci.yml`
  - 영역별 `cache:` — 키는 잠금 파일, 폴더는 `$CI_PROJECT_DIR` 안(`GRADLE_USER_HOME` · npm · `UV_CACHE_DIR` · `TF_PLUGIN_CACHE_DIR`)
- `infra/server/README.md`, `SSOT.md` 10절 (캐시 전후)

MR 3 — 노트북 러너
- `infra/laptop-runner/compose.yaml` (새)
  - Docker Desktop 안의 `gitlab/gitlab-runner` 18.11.4(digest 고정) 컨테이너
  - 설정은 이름 붙은 볼륨, `docker.sock` 은 러너 컨테이너에만 붙인다
  - 덮기 전 멈출 때 진행 중인 잡을 기다린다(`stop_signal: SIGQUIT`)
- `infra/laptop-runner/config.template.toml` (새)
  - Docker executor, 동시 2, 잡 하나 CPU 4 · 메모리 4g, 서비스 상한, `privileged = false`, 호스트 폴더 안 붙임, `pull_policy = if-not-present`(digest 고정이라 안전)
  - 토큰은 파일에 없다
- `infra/laptop-runner/README.md` (새) — 등록(토큰은 사용자가 직접) · 켜기 · 끄기 · 덮기 전 멈추기 · 최대 잡 시간 20분
- `SSOT.md` 6절 노트북 러너 줄, `.claude/stack.md` §4 러너 줄

## 작업 순서

- [x] Jira 92 를 진행 중으로 옮긴다. 새 티켓 「[INFRA] 이미지 빌드 · 저장소 · 태그」를 스토리 포인트 3 · 상위 27 · 라벨 infra newlearn-mvp 로 만든다 — S15P31A102-96
- [x] backend 스위치 — 로컬에서 두 방식으로 테스트를 돌려 확인 (기본 29초 · 컨테이너 3개, 끈 채 바깥 DB 14초 · 컨테이너 0개, DB 를 내리면 2개 실패)
- [x] 러너 값 덮어쓰기 허용 → 서버 `helm upgrade` — 러너 online (판 4, 63초)
- [x] `.gitlab-ci.yml` — CI Lint API 로 검사 → push → MR 1 파이프라인 초록, 잡별 대기 · 시간을 잰다 (Lint API 는 개인 토큰이 필요해 Pipeline editor 의 「syntax is correct」로 대신함. !48 첫 실행 520초 · 둘째 490초, SSOT 10절)
- [x] 문서만 바꾼 시험 Draft MR 로 「바뀐 영역만」 확인 (`rules` 잡만 뜨는지) — !49 에서 `w0:rules` 하나만. 닫는 대신 잰 값 문서를 담아 !48 브랜치에 머지해서 시험 브랜치가 머지와 함께 지워짐
- [x] 문서(SSOT · stack.md · README)를 고치고 MR 1 을 머지한다 — !48 → infra (40922c7)
- [x] MR 2 캐시 — 같은 잡을 캐시 전후로 잰다 (!50: 없음 · GitLab `cache:` · 바로 쓰기 세 방식, 위 「바꿈」)
- [x] MR 3 노트북 러너 — 사용자가 등록, 노트북이 받은 잡(backend 포함) 초록, 노트북을 끈 채 EC2 만으로도 초록 (!52: EC2 만 350초 · 노트북만 109초 · 함께 119초. Docker 29 링크 문제는 `FF_NETWORK_PER_BUILD` 로)
- [x] `infra` → `dev` → 분야 브랜치 넷에 반영 — !53 · !54 ~ !57 (2026-10-21). 머지 직전마다 원격 `dev` 를 확인하고, 반영 MR 마다 파이프라인 결과를 본다
- [x] 팀 공지 문안을 쓴다 (사용자가 올림): 무엇을 검사하나, 빨간불이면 어디를 보나, 아직 머지를 막지 않는다는 것
- [x] Jira 92 완료, 잰 값 SSOT 10절 (CPU 크레딧 269.8)

## 안 바꿀 것

- 이미지 빌드 · 저장소 · 배포 잡 (새 티켓)
- 머지 막기 설정 (사용자가 며칠 뒤 정함)
- `.claude/stack.md` §3 의 검사 명령 · `.claude/hooks/` · `.claude/ci/` 원본 · 하네스 테스트
- EC2 러너 동시 실행 수 (1 — 잰 뒤 정함) · 러너 권한(RBAC) · `privileged`
- 운영 코드 — backend `src/main` · frontend · ai 소스. backend 는 테스트 설정 파일 하나만
- frontend JUnit 리포트 (vitest 설정을 바꿔야 해서 FE 쪽과 같이), gitlab-ci-pipelines-exporter (CI 기록이 쌓인 뒤)

## 리스크

- 팀원 MR 에 처음 빨간불이 뜰 수 있다. 지금 코드가 게이트를 못 넘으면 그렇다. MR 1 이 네 영역을 다 돌아서 dev 코드 상태가 먼저 드러나고, 분야 브랜치 반영 MR 마다 결과를 본다. 머지는 막지 않는다
- 노드 CPU 여유가 810m 뿐이다. 무엇이 더 붙으면 backend 잡 Pod 가 Pending 에 남고 `poll_timeout`(180초)에 실패한다. 그러면 요청을 낮춘다
- 디스크: 29G 중 9.1G 를 쓰고 있다. 이미지(JDK · node · uv · pgvector · redis), 잡 작업 폴더(ai 가상환경 약 1.5 GB), 캐시가 더해진다. 잡 뒤 `df` 로 보고, kubelet 이미지 정리 기준(85%) 전에 손본다
- services: Kubernetes executor 가 서비스 준비를 기다려 주지 않을 수 있다. backend 잡 `before_script` 에서 `postgres:5432` · `redis:6379` 를 시간 상한을 두고 기다린다
- 스위치를 잘못 걸면 팀원 로컬 테스트가 깨진다. `matchIfMissing = true` 로 기본은 그대로 두고, 로컬에서 두 방식을 다 돌린다
- 시크릿 스캔 오탐: CI 파일의 시험용 DB 비밀번호가 걸리면 시험용 값임을 적고 줄 끝에 `secret-scan:allow` 를 붙인다
- 노트북 러너
  - 팀원 코드가 노트북 Docker 에서 돈다. `privileged` 를 끄고, 호스트 폴더를 붙이지 않고, `docker.sock` 은 잡에 주지 않는다
  - 덮으면 잡이 최대 잡 시간까지 남는다
  - Windows Docker Desktop 에서 러너를 컨테이너로 돌리는 것은 GitLab 문서에 Windows 사례가 없어서 MR 3 에서 실제로 확인한다
- CPU 크레딧: 잡이 CPU 1 을 몇 분씩 쓴다. 시작 전후 잔액을 사용자가 EC2 콘솔에서 읽는다

## 어떻게 검증하나

Jira 완료 기준 ① MR 파이프라인이 네 영역 검사를 돌고 결과가 MR 에 보인다 ② 잡 시간 · 크레딧을 SSOT 10절에 적는다. 이미지 기준은 새 티켓으로 옮긴다.

- backend 스위치
  - (a) 기본 `./gradlew test` 가 Testcontainers 로 통과한다
  - (b) compose 로 db · redis 를 띄우고 `NEWLEARN_TEST_TESTCONTAINERS=false` 와 접속 값을 주면 통과하고, 새 컨테이너가 뜨지 않는다(`docker ps`)
  - (c) (b) 에서 db 를 내리면 실패한다 — 바깥 DB 를 실제로 쓴다는 증거
- 러너: `helm upgrade` 뒤 online. 잡 로그의 `cpu.max` 와 잡 Pod 의 requests · 라벨이 갈래별 값인지 본다
- `.gitlab-ci.yml`: CI Lint API valid. MR 1 파이프라인에서 `rules` · `harness` · 네 영역 잡이 초록이고, MR 화면에 테스트 리포트(backend 2개 · ai 4개)가 보인다
- 바뀐 영역만: 문서만 바꾼 시험 MR 에서는 `rules` 잡만 뜬다
- 잰 값 (잡 API `queued_duration` · `duration`, Grafana 의 잡 Pod CPU · 스로틀, 노드 `df`, 크레딧은 사용자가 읽은 값)을 SSOT 10절에 적는다
  - MR 2: 같은 잡의 캐시 전후 시간, 로그의 캐시 복원 줄
  - MR 3: GitLab 러너 2개 online, 노트북 러너가 받은 잡의 러너 이름 · 성공, 노트북을 끄고도 EC2 만으로 초록
- 커밋 직전마다 `/verify`

## 되돌리는 법

- `.gitlab-ci.yml` 을 revert 하면 파이프라인이 다시 안 돈다. 머지 막기를 안 켰으니 머지에 영향이 없다
- 러너 값: 파일을 revert 하고 같은 `helm upgrade`, 급하면 `helm rollback gitlab-runner <이전 판>`
- backend 스위치: 파일을 revert 한다. 기본 동작이 그대로라 로컬에는 영향이 없다
- 캐시: 러너 값에서 볼륨을 빼고 upgrade → PVC · PV 를 지운다. 서버 폴더는 Retain 이라 남고, 지우는 것은 사람이 확인한다
- 노트북 러너: `docker compose down`, GitLab 에서 러너를 지운다(사용자)
- 되돌릴 수 없는 것: 없다. 이미 돈 파이프라인 기록과 쓴 CPU 크레딧만 남는다
