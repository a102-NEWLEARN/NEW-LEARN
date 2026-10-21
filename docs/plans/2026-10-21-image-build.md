# Jira S15P31A102-96 이미지 빌드 · 저장소 · 태그

2026-10-21 계획. 사용자가 저장소 GHCR · dev 머지 때 빌드 · 짧은 SHA 를 골랐고, 이미지는 인프라 담당 개인 GitHub 계정 아래 둔다(승인 뒤 같은 날 새 조직 → 개인 계정으로 바꿈). 비교 근거는 맨 아래 「조사 결과」.

## 무엇을 / 왜

dev 에 코드가 합쳐질 때마다 CI 가 backend · frontend · ai 이미지를 굽고 GHCR(ghcr.io)에 커밋별 태그로 올린다.
Lightsail 을 받은 뒤 Argo CD(Jira 91)가 띄울 이미지가 지금은 하나도 없다 — Dockerfile 도 저장소도 없다.
SSAFY GitLab 레지스트리는 꺼져 있고, 관리 서버에는 Docker 가 없어 권한 없이 굽는 도구(Kaniko 후속판)를 쓴다.

## 정한 것

| 항목 | 값 |
|---|---|
| 저장소 | GHCR, 인프라 담당 개인 GitHub 계정 아래 비공개 패키지. 주소 `ghcr.io/kimzoo5676-del/newlearn-backend` · `newlearn-frontend` · `newlearn-ai`, 빌드 캐시 `ghcr.io/kimzoo5676-del/newlearn-kaniko-cache` — 개인 계정의 다른 패키지와 섞이지 않게 `newlearn-` 을 붙인다 |
| 배포 브랜치 | dev. dev push 파이프라인에서 그 영역이 바뀌었을 때만 굽고 올린다. 사이트에 바로 반영할지 버튼을 둘지는 91 |
| 태그 | `$CI_COMMIT_SHORT_SHA`(8자). `latest` 는 안 붙인다. 배포 설정에 digest 까지 적는 것은 91 |
| 빌드 도구 | Kaniko 후속판 `ghcr.io/osscontainertools/kaniko` 의 `-debug` 이미지(셸 있음), digest 고정. 두 러너 설정을 바꾸지 않는다 |
| 비밀값 | GitLab CI 변수 `GHCR_USER` · `GHCR_TOKEN` — protected · masked. 보호 브랜치(dev) 파이프라인에만 들어간다. 토큰은 classic 으로 `write:packages` · `read:packages` 만(`repo` 등 다른 권한 없음), 만료 2026-11-30. 사용자가 직접 만들어 넣는다 — Claude 는 토큰 화면을 보지 않는다 |
| 공개 범위 | 이미지는 비공개로 둔다. 공개로 바꾸지 않는다 |

## 바꿀 파일

- `backend/Dockerfile` · `backend/.dockerignore` — 1단계 `gradle:9.8.1-jdk25`(CI 와 같은 digest)로 의존성 → `./gradlew bootJar`, `jarmode=tools` 로 층 나눔. 2단계 `eclipse-temurin:25-jre`, 비루트, 8080
- `frontend/Dockerfile` · `frontend/.dockerignore` · `frontend/nginx.conf` — 1단계 `node:26-trixie`(CI 와 같은 digest)로 `npm ci` → `npm run build`. 2단계 `nginxinc/nginx-unprivileged` alpine 으로 `dist/` 를 8080 에서 내준다. 없는 경로는 `index.html` 로(화면 주소 직접 열기)
- `ai/Dockerfile` · `ai/.dockerignore` — 1단계 `ghcr.io/astral-sh/uv:0.13.1-python3.14-trixie-slim` 으로 `uv sync --locked --no-dev`(잠금 파일 먼저, 코드 나중). 2단계 `python:3.14.8-slim-trixie` 에 가상환경 복사, 비루트, `uvicorn app.main:app` 8000
- `.gitlab-ci.yml` — `build` 단계와 `.w4` 틀, `w4:backend` · `w4:frontend` · `w4:ai`
  - dev push: 그 영역 폴더나 이 파일이 바뀌면 굽고 push, 캐시 씀. 그 영역 검사 잡이 통과한 뒤(`needs`)
  - MR: 그 영역의 Dockerfile · `.dockerignore` · `nginx.conf` 나 이 파일이 바뀌면 `--no-push` 로 굽기만(토큰 · 캐시 없음). Dockerfile 이 깨진 채 dev 에 들어가지 않게 하려는 것
  - 자원은 러너 상한 그대로(CPU 요청 500m · 상한 1, 메모리 1Gi · 2Gi), 이름표 `newlearn.io/workload=w4`. `--custom-platform linux/amd64`, 커밋 SHA 라벨
- `infra/README.md` — 「이미지 저장소(GHCR)」 절: 토큰 만들기, GitLab 변수 넣기, 토큰 만료, 11/18 뒤 정리(`newlearn-` 패키지 삭제, 토큰 폐기)
- `SSOT.md` — 6절 배포 흐름에 저장소 · 태그 · 배포 브랜치 · 빌드 도구 · 비밀값 위치, 8절 해당 두 줄 삭제하고 「개인 외부 계정(GHCR)에 프로젝트 이미지를 두는 것이 SSAFY 규칙에 맞는지」 한 줄 추가(Infra), 10절 잰 값(빌드 잡 시간 · 이미지 크기)
- `.claude/stack.md` §6 — 빈칸 셋(배포 브랜치 · 산출물 위치 · 태그 규칙)을 SSOT 6절을 가리키는 한 줄씩으로

## 작업 순서

작업 브랜치 `chore/infra/S15P31A102-96-image-build` 를 infra 에서 딴다. Jira 96 을 진행 중으로 옮긴다.

- [ ] 1. 세 Dockerfile · `.dockerignore` · `nginx.conf` — 이 노트북에서 `docker build` 성공, 띄워서 backend `/actuator/health` UP(compose DB · Redis 와), ai `/health` 200, frontend `/` 와 깊은 주소 모두 200. 이미지 크기를 적어 둔다
- [ ] 2. `.gitlab-ci.yml` w4 잡 — MR 파이프라인에서 w4 세 잡이 **EC2 러너만**(노트북 러너 stop)으로 한 번, **노트북 러너만**(EC2 러너를 GitLab 화면에서 잠시 멈춤 — 사람)으로 한 번 성공. Kaniko 시험이 이 단계다 — 한쪽이라도 실패하면 멈추고 다시 계획
- [ ] 3. (사람) 개인 GitHub 계정에서 classic 토큰(`write:packages` · `read:packages` 만, 만료 2026-11-30) · GitLab Settings › CI/CD › Variables 에 `GHCR_USER` · `GHCR_TOKEN`(protected · masked). 1 · 2 와 같이 해도 된다. Claude 는 토큰 화면을 보지 않고, 넣었다는 말만 받는다
- [ ] 4. `infra/README.md` · `SSOT.md` 6 · 8절 · `stack.md` §6 — MR → infra 머지
- [ ] 5. infra → dev MR(「Delete source branch」 끔) 머지 → dev 파이프라인에서 push 확인
- [ ] 6. 잰 값을 `SSOT.md` 10절에 — 작은 MR 하나. 머지되면 Jira 96 Done

## 안 바꿀 것

- 앱 코드와 빌드 설정 — `backend/src` · `build.gradle` · `frontend/src` · `package.json` · `ai/app` · `pyproject.toml` · `uv.lock`
- 러너 설정 — `infra/k8s/bootstrap/gitlab-runner-values.yaml` · `infra/laptop-runner/`. 보안 설정(`privileged=false` · `allow_privilege_escalation=false`)과 자원 상한을 그대로 둔다. 바꿔야 굽힌다면 멈추고 다시 계획
- 기존 w0 · w12 · w3 잡과 workflow 규칙 — 단계와 w4 잡을 더하기만 한다
- 쿠버네티스 배포 — `infra/k8s/apps/`, imagePullSecret(읽기 토큰), 배포 설정의 태그 바꾸기, 바로 반영 · 버튼 — 모두 91
- 로컬 개발 환경 — `compose.yaml` · `docs/dev-environment.md`(개발은 지금처럼 폴더 연결)
- 브랜치 규칙 `docs/git-convention.md`, 팀 문서 `docs/mvp-overview.md` · PRD
- `.env` · 키 · 토큰 값 — 토큰은 사람이 만들고 넣는다

## 리스크

- Kaniko 가 한쪽 러너에서 안 돌 수 있다(문서 근거는 있지만 이 러너들에서 돌려 본 적 없음) → 2단계에서 확인, 안 되면 멈춤
- EC2 잡 상한(CPU 1 · 메모리 2Gi)에서 ai(torch, 가상환경 약 1 GB) 이미지가 느리거나 메모리가 모자랄 수 있다 → 2단계에서 시간 · 최대 메모리를 본다. 모자라면 상한을 올릴지 따로 정한다
- EC2 디스크 — Kaniko 가 잡 컨테이너 안에 파일 시스템을 풀어 ai 빌드 동안 수 GB 를 쓴다 → 잡 뒤 `df` 를 본다
- Docker Hub 익명 받기 한도(IP 당 6시간 100번) — 베이스 이미지를 빌드마다 받는다. dev push 한 번에 많아야 세 번이라 지금은 넉넉하다
- classic 토큰은 개인 계정의 모든 패키지에 쓰기 권한이 걸린다(이 프로젝트 밖 패키지 포함) → protected · masked, 만료일, dev 파이프라인에만. dev 파이프라인의 다른 잡(팀 코드)도 변수를 읽을 수 있다 — MR 리뷰를 거친 코드라 받아들인다
- 개인 GitHub 아이디가 팀 저장소 파일(`.gitlab-ci.yml` · SSOT · 이후 배포 설정)에 남는다 — 사용자가 받아들였다
- SSAFY 가 개인 외부 계정에 프로젝트 코드(이미지)를 두는 것을 막는 규칙이 있는지 모른다 — 사용자가 확인한다. 막혀 있으면 저장소를 다시 고른다(바꿀 곳은 `.gitlab-ci.yml` 의 이미지 주소와 CI 변수뿐)
- GHCR 무료는 「지금」 기준이다 — 바뀌면 최소 1달 전 알림, 11/18 종료까지 1달이 안 남았다
- Kaniko 후속판은 작은 공동체가 관리한다 → digest 로 고정
- `backend/` · `frontend/` · `ai/` 는 팀원 영역이다 → Dockerfile 만 더하고 앱 코드는 안 건드린다. MR 본문에 영역별로 무엇을 더했는지 적는다

## 어떻게 검증하나

Jira 96 완료 기준마다:

- **이미지가 저장소에 커밋별 태그로 올라간다** — dev 파이프라인의 w4 세 잡이 성공하고, 개인 계정 Packages 화면에 `newlearn-backend` · `newlearn-frontend` · `newlearn-ai` 가 비공개로 있고 태그가 dev 머지 커밋의 짧은 SHA 와 같다. 로그아웃한 채 `docker pull` 은 거부되고, 토큰으로 로그인하면 받아져 1단계처럼 뜬다
- **결정을 SSOT 에 적고 8절에서 지운다** — `SSOT.md` 6절에 다섯 가지, 8절 두 줄 없음, `stack.md` §6 빈칸 셋 채움
- **빌드 잡 시간을 SSOT 10절에** — 러너별 w4 잡 대기 · 실행 시간(GitLab 잡 기록 `queued_duration` · `duration`), 캐시 없을 때 · 있을 때, 이미지 크기(GHCR 화면)

그 밖에:

- Dockerfile 이 안 바뀐 MR 에는 w4 잡이 안 생긴다 — 문서만 바꾼 MR 파이프라인을 본다
- 기존 잡이 그대로 통과한다(w0 · w12 · w3)
- 커밋 전 하네스 게이트(`/verify`)

## 되돌리는 법

- 코드: 더하기만 한 변경이라 MR 을 revert 하면 이전 파이프라인으로 돌아간다. 서버 · 러너는 안 바꾼다
- GHCR: `newlearn-` 패키지를 지우고, 토큰을 폐기하고 GitLab 변수를 지운다. 패키지 삭제는 되돌릴 수 없지만 dev 를 다시 push 하면 다시 굽힌다

## 조사 결과 (2026-10-21, 공식 문서)

- SSAFY GitLab 레지스트리 마지막 확인(2026-10-21, 사용자 요청): `https://lab.ssafy.com/jwt/auth?service=container_registry` 가 404 `{"code":"UNAVAILABLE","message":"registry not enabled"}` 를 준다. GitLab 코드(`app/services/auth/container_registry_authentication_service.rb`)에서 이 응답은 서버 설정 `Gitlab.config.registry.enabled` 가 false 일 때만 나온다 — 프로젝트 설정으로는 못 켜고 SSAFY 관리자만 켤 수 있다. `/v2/` 의 401 은 `service="dependency_proxy"`(Docker Hub 이미지를 대신 받아 주는 기능)라 우리 이미지를 올리는 곳이 아니다. `registry.lab.ssafy.com` · `lab.ssafy.com:5050` 은 연결되지 않는다
- 같은 날 브라우저(Maintainer 로그인)로도 봤다: Settings › General › Visibility, project features, permissions 에 Container registry 스위치가 없다(Snippets 다음이 바로 Package registry). 프로젝트의 `/container_registry` 는 404. GitLab 문서는 「관리자가 인스턴스에서 컨테이너 레지스트리를 켜야 한다」고 적는다. 켜져 있는 Package registry 는 npm · Maven 같은 꾸러미 창고라 쿠버네티스가 이미지를 받아 갈 수 없다

| | GHCR | Docker Hub 무료 | AWS ECR 비공개 | 클러스터 안 레지스트리 |
|---|---|---|---|---|
| 비용 | 비공개도 저장 · 전송 「지금 무료」, 바뀌면 최소 1달 전 알림 | 무료 | 저장 GB당 월 $0.10. 새 ECR 고객 1년 500MB 무료가 이 계정에 맞는지 미확인 | 0 |
| 한도 | 층 하나 10GB · 업로드 10분 | 비공개 저장소 1개, 로그인 받기 6시간 200번 | — | 노드 디스크 |
| 워커가 받는 길 | 읽기 토큰 → imagePullSecret | 같음 | 토큰 12시간 만료 → 갱신 장치 + Lightsail 에 AWS 키 | 노드마다 containerd 설정 |
| 노트북 러너 push | 됨 | 됨 | 됨 | 안 됨 |

| 빌드 도구 | 두 러너에서 설정을 안 바꾸고 도나 |
|---|---|
| BuildKit rootless | 아니오 — 권한 없는 Docker executor 는 seccomp 에 막힘(GitLab), 쿠버네티스는 AppArmor Unconfined · user namespace · Ubuntu 24.04 sysctl(BuildKit) |
| Buildah | 미확인 — GitLab 비루트 안내는 OpenShift `anyuid` 전제 |
| Kaniko 후속판 | 될 것으로 봄 — 데몬 · 특권 없이 컨테이너 안 root 로 RUN. 원본은 2025-06-03 보관 |

출처: aws.amazon.com/ecr/pricing · docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html · docs.docker.com/docker-hub/usage · docs.github.com/en/billing/concepts/product-billing/github-packages · docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry · docs.gitlab.com/ci/docker/using_buildkit · github.com/moby/buildkit/blob/master/docs/rootless.md · docs.gitlab.com/ci/docker/buildah_rootless_tutorial · github.com/GoogleContainerTools/kaniko · github.com/osscontainertools/kaniko
