# 1. 빌드 · 배포

GitLab 저장소를 클론해 로컬에서 빌드 · 실행하는 방법과, 운영 서버에 배포되는 방식을 정리했습니다. 기준일은 2026-11-18 이고, 값의 원본은 각 절 끝에 적은 파일입니다.


---

## 1-1. 사용 제품 · 설정값 · 버전

### 영역별

| 영역 | 폴더 | 언어 · 런타임 | 프레임워크 · 주요 라이브러리 | 빌드 도구 |
|---|---|---|---|---|
| 화면 | `frontend/` | Node 26 (빌드 이미지 `node:26.12.1-trixie`) | React 19.3.1, React Router 8.4.0, TanStack Query 5.104.4, Tailwind CSS 4.3.3, TypeScript 6.0.3, D3 7.9.0, SEED Design 3 | Vite 8.3.4 · npm |
| API 서버 | `backend/` | Java 25 (JVM: Eclipse Temurin 25 JRE) | Spring Boot 4.1.1 (Web MVC · Security · Data JPA · Flyway · Session Redis), springdoc-openapi 3.1.1 | Gradle 9.8.1 (`gradlew` 포함) |
| AI 워커 | `ai/` | Python 3.14 | FastAPI 0.143.3, Uvicorn 0.54.0, LangChain 1.4.6, sentence-transformers 6.1.0, torch 2.14.1 (CPU 판) | uv 0.13.1 |
| 수집 배치 | `infra/k8s/services/ingest/` | Python 3.14.8 (표준 라이브러리만) | — | 없음 (스크립트를 ConfigMap 으로 얹음) |

### 서버 · 미들웨어

| 구분 | 제품 · 버전 | 설정값 · 설정 파일 |
|---|---|---|
| 서버 | AWS EC2 t3.large (관리 서버 · 컨트롤 플레인) + SSAFY Lightsail xlarge 4 vCPU · 16 GB (서비스 서버 · 워커). 둘 다 Ubuntu 24.04 | EC2 는 `infra/terraform/` 로 만든다. 두 서버는 WireGuard 터널로 잇는다(`infra/server/wg-up.sh`) |
| 컨테이너 오케스트레이션 | 쿠버네티스 v1.36.5 (kubeadm 으로 직접 구축), containerd(Ubuntu 저장소판) | `infra/k8s/kubeadm/init.yaml`, `infra/server/common.sh` |
| 클러스터 네트워크 | Cilium 1.20.3 (kube-proxy 대체) | `infra/server/init-control-plane.sh` |
| 입구(게이트웨이) | Envoy Gateway v1.9.2 (Envoy 1.39.1) | 길: `infra/k8s/services/app/routes.yaml`(`/api` → backend, `/` → frontend). 요청 수 상한: `ratelimit.yaml`(로그인 300 · 가입 100 · 용어사전 100 회/분, 출발 IP마다) |
| 웹 서버 | nginx-unprivileged 1.30.6 (alpine 3.24, 화면 컨테이너 안) | `frontend/nginx.conf` — listen 8080, SPA fallback `try_files $uri $uri/ /index.html`, `/assets/` 1년 캐시, `/index.html` no-cache, gzip |
| WAS | Spring Boot 4.1.1 내장 Tomcat (backend 컨테이너, 8080). 별도 WAS 없음 | `backend/src/main/resources/application.yaml` — `server.shutdown: graceful`, `spring.lifecycle.timeout-per-shutdown-phase: 20s`, `jpa.hibernate.ddl-auto: validate`, `open-in-view: false`, 세션 Redis 1일 · 쿠키 HttpOnly · SameSite Lax |
| JVM | Eclipse Temurin 25 JRE | `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70` (`infra/k8s/services/app/backend.yaml`). 메모리 요청 512Mi · 상한 1Gi |
| AI 서버 | Uvicorn 0.54.0 (ai 컨테이너, 8000) | `infra/k8s/services/ai/ai.yaml` |
| DB | PostgreSQL 18 + pgvector 0.8.7 (`pgvector/pgvector:0.8.7-pg18`), DB 이름 `newlearn` | StatefulSet, 저장 20Gi (`infra/k8s/services/data/postgres.yaml`). 스키마는 Flyway(V1 ~ V17) |
| 캐시 · 작업 큐 | Redis 8.10.2 (AOF, `maxmemory 1gb`, `noeviction`) | `infra/k8s/services/data/redis.yaml` |
| 배포(GitOps) | Argo CD v3.5.5 (차트 10.10.5) | 앱 목록 `infra/k8s/apps/`, 까는 법 `infra/server/bootstrap-argocd.sh` |
| 비밀값 | Sealed Secrets v0.40.0 (차트 2.20.0) · kubeseal 0.40.0 | 봉인 스크립트 `infra/server/seal-secrets.sh` |
| TLS 인증서 | cert-manager v1.21.2 + Let's Encrypt (HTTP-01) | `infra/k8s/gateway/` |
| 저장 공간 | local-path-provisioner v0.0.37 (StorageClass `newlearn-local`) | `infra/k8s/apps/templates/local-path.yaml` |
| CI | GitLab CI (SSAFY GitLab CE 18.11.5) · GitLab Runner 18.11.4 (차트 0.88.4, 쿠버네티스 executor) | `.gitlab-ci.yml`, `infra/k8s/bootstrap/gitlab-runner-values.yaml` |
| 이미지 굽기 | Kaniko (osscontainertools v1.28.6) — 특권 없이 잡 안에서 굽기 | `.gitlab-ci.yml` 의 `w4` 잡 |
| 이미지 저장소 | GitHub Container Registry(GHCR) 비공개 패키지 | `.gitlab-ci.yml` 의 `IMAGE_PREFIX` |
| 모니터링 · 로그 · 경보 | kube-prometheus-stack 차트 92.10.1 (Prometheus · Grafana · Alertmanager), Loki 이미지 3.6.11 (차트 7.5.0), Alloy v1.21.2 (차트 1.14.3) | `infra/k8s/bootstrap/`, `infra/server/logging.md`, 경보 `infra/k8s/alerts/rules.yaml` |
| 인프라 코드 | Terraform 1.16.6 (AWS provider 6) | `infra/terraform/` |

### 개발 도구 (IDE)

저장소에는 IDE 설정 파일이 없고 특정 IDE 에 묶이지 않습니다. 관리자 PC 에서 쓴 판입니다.

| 도구 | 판 |
|---|---|
| Visual Studio Code | 1.146.0 |
| Docker Desktop | 4.83.0 (Engine 29.6.2) |
| Git | 2.55.0 |

IDE 는 필수가 아닙니다. 빌드와 실행은 아래 명령만으로 됩니다.

원본: `.claude/stack.md` 2절, `frontend/package.json` · `backend/build.gradle` · `ai/pyproject.toml`, Dockerfile 셋, `compose.yaml`, `SSOT.md` 1 · 6절

---

## 1-2. 클론 → 로컬 실행

**준비물은 Docker Desktop(Engine 25 이상)과 Git · Git LFS 입니다.** 화면 · API · AI 워커 · DB · Redis 가 모두 컨테이너로 뜹니다. Windows 는 WSL 2 Ubuntu 터미널에서, WSL 쪽 폴더(`~/` 아래)에 클론합니다 — C: 드라이브에 클론하면 고친 파일이 컨테이너에 반영되지 않습니다. 덤프는 Git LFS 로 올려 두어서, WSL Ubuntu 처럼 git-lfs 가 없으면 먼저 깝니다.

```bash
sudo apt install -y git git-lfs && git lfs install
```

### ① 클론

`data/` 의 기사 SQLite(Git LFS, 약 1.66GB)는 실행에 필요 없습니다. 받지 않고 클론한 뒤 3장 덤프만 받습니다. Git LFS 없이 받으려면 GitLab 웹의 `exec/files/db/` 파일 화면에서 덤프를 내려받아 같은 자리에 둡니다.

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone https://lab.ssafy.com/s15-final/S15P31A102.git
```

```bash
cd S15P31A102
```

```bash
git lfs pull --include="exec/files/db/*.dump"
```

### ② 환경 변수 파일

```bash
cp .env.example .env
```

값은 그대로 둡니다. `LLM_MODE=mock` 이 기본이라 GMS 키 없이도 뜹니다. 실제 LLM 을 부르려면 1-3 의 GMS 칸을 채웁니다.

**운영과 같은 데이터로 보려면 여기서 ③ 대신 3장 「되살리는 법」으로 갑니다.** 덤프는 backend 가 처음 뜨기 전에 빈 DB 에 넣어야 합니다 — backend 가 먼저 뜨면 Flyway 가 빈 스키마를 만들어 덤프와 부딪힙니다. ③ 은 빈 DB 로 띄우는 길입니다.

### ③ 띄우기 (빈 DB)

```bash
docker compose --profile full up -d --wait
```

| 주소 | 확인 |
|---|---|
| http://localhost:5173 | 홈 「오늘의 이슈를 탐색해 보세요」 |
| http://localhost:5173/actuator/health | `UP` — 화면 → API → DB · Redis 가 이어졌다는 뜻 |
| http://localhost:8080/actuator/health · http://localhost:8000/health | API · 워커 헬스 200 |

처음에는 이미지(약 1.9 GB)와 의존성(약 1.8 GB)을 받느라 몇 분 걸립니다. 빈 DB 로 뜨므로 홈에 이슈가 없습니다.

| 명령 | 뜨는 것 | 이럴 때 |
|---|---|---|
| `docker compose up -d` | DB · Redis | 내 영역을 IDE · 터미널에서 띄울 때 |
| `docker compose up -d backend ai` | DB · Redis · API · 워커 | 화면만 호스트에서 띄울 때 |
| `docker compose --profile full up -d` | 전부 | 언어 런타임을 설치하지 않고 전체를 볼 때 |
| `docker compose --profile full down` | 끄기 (데이터는 볼륨에 남음) | |

`port is already allocated` 가 나면 `.env` 의 `*_PORT` 를 비어 있는 번호로 바꿉니다. 더 자세한 쓰는 법과 막히는 곳은 [`docs/dev-environment.md`](../docs/dev-environment.md).

### 영역별 빌드 · 테스트 명령

각 영역 폴더에서 돕니다. 원본은 [`.claude/stack.md`](../.claude/stack.md) 3절입니다.

| 영역 | 설치 | 실행 | 빌드 | 테스트 |
|---|---|---|---|---|
| frontend | `npm ci` | `npm run dev` (5173) | `npm run build` | `npm test` |
| backend | (Gradle 이 받음) | `./gradlew bootRun` (8080) | `./gradlew bootJar` | `./gradlew test` (Testcontainers — Docker 필요) |
| ai | `uv sync --locked` | `uv run --env-file ../.env uvicorn app.main:app --reload --port 8000` | 없음 | `uv run --locked pytest` |
| infra | `terraform -chdir=terraform init -backend=false` | — | 없음 (apply 는 사람이 plan 을 읽고) | `terraform -chdir=terraform test` |

호스트에서 띄울 때 필요한 판: Node 24.22.1 이상 또는 26.12.1 이상, JDK 21 이상(컴파일용 25 는 Gradle 이 받음), uv(Python 3.14 는 uv 가 받음).

---

## 1-3. 환경 변수

값은 이 문서에 적지 않습니다. 로컬 값은 저장소 루트 `.env` 하나에, 운영 비밀값은 봉인한 Secret(Sealed Secrets)에만 있습니다.

### 로컬 — 루트 `.env` (`.env.example` 을 복사)

읽는 곳이 띄우는 방법에 따라 다릅니다.

- **compose 로 띄울 때**: compose 가 루트 `.env` 를 읽어 컨테이너마다 정해진 값만 넘깁니다(`compose.yaml` 의 `environment`). backend 컨테이너에는 DB · Redis · `INTERNAL_*` 만, ai 컨테이너에는 `LLM_MODE` · `GMS_*` · 워커 스위치 · `INTERNAL_WORKER_KEY` 가 갑니다. backend 의 나머지 값(`GMS_API_KEY` · `GMS_BASE_URL` · `GMS_MODEL` · `STDICT_API_KEY` · 목록 기준값 `QUERY_MIN_*` 등)은 **`backend/.env`** 에 넣습니다 — backend 가 시작할 때 자기 폴더의 `.env` 를 읽고, git 은 이 파일을 무시합니다. 이 길은 `QUERY_MIN_*` 으로 확인했습니다(3장).
- **IDE · `./gradlew bootRun` 으로 띄울 때**: backend 가 루트 `.env` 를 바로 읽습니다.

| 변수 | 뜻 | 비우면 |
|---|---|---|
| `POSTGRES_DB` · `POSTGRES_USER` · `POSTGRES_PASSWORD` | 로컬 DB 이름 · 계정 (이 PC 127.0.0.1 에만 열림) | 기본값 그대로 써도 됨 |
| `DB_PORT` · `REDIS_PORT` · `BACKEND_PORT` · `AI_PORT` · `FRONTEND_PORT` | 내 PC 에 여는 포트 | 기본 5432 · 6379 · 8080 · 8000 · 5173 |
| `SESSION_COOKIE_SECURE` | 세션 쿠키에 Secure 를 붙일지 (로컬 false, 운영 true) | false |
| `INTERNAL_WORKER_KEY` · `INTERNAL_BATCH_KEY` | 직원용 문(`/internal/v1`) 출입증 — 워커 · 수집 배치 | 직원용 API 가 모두 막힘 |
| `STDICT_API_KEY` | 국립국어원 표준국어대사전 키 (지금 화면은 안 씀) | 사전 API 502 |
| `NEWSDATA_API_KEY` | 수집 배치를 로컬에서 돌려 볼 때만 | |
| `LLM_MODE` · `GMS_MODEL` | AI 워커의 LLM. `mock` 이면 워커가 GMS 를 부르지 않고 모의 응답 | 워커가 GMS 를 안 부름 |
| `GMS_API_KEY` · `GMS_BASE_URL` | GMS 키 · 주소. backend 의 용어사전 문맥 뜻(A26)은 `LLM_MODE` 를 보지 않고 이 둘이 있으면 부름(비용이 듦) | 문맥 뜻 502 |
| `WORKER_ALLOW_MOCK` · `EMBED_WORKER_ENABLED` · `MATCH_EVENT_WORKER_ENABLED` · `ISSUE_WORKER_ENABLED` | 워커 단계 스위치 | 워커가 큐를 읽지 않음(기본) |

### 빌드 · CI — GitLab CI/CD 변수

파일 밖에서 넣어야 하는 것은 셋뿐입니다(Settings → CI/CD → Variables, 보호 · 가림).

| 변수 | 쓰는 잡 | 무엇 |
|---|---|---|
| `GHCR_USER` · `GHCR_TOKEN` | `w4:backend` · `w4:frontend` · `w4:ai`, `w5:deploy-mr` | 구운 이미지를 GHCR 에 올리는 계정 · 토큰(`write:packages`). `w5` 는 그 태그가 GHCR 에 있는지 볼 때 씀. dev 파이프라인에만 들어감 |
| `DEPLOY_MR_TOKEN` | `w5:deploy-mr` | 배포 태그 MR 을 여는 프로젝트 액세스 토큰(Developer · `api`) |

`.gitlab-ci.yml` 안에서 정하는 변수 중 알아 둘 것: `IMAGE_PREFIX`(이미지 이름 앞부분), `W4_PUSH`(dev 에서 영역이 바뀔 때만 이미지를 올림), `GIT_LFS_SKIP_SMUDGE`(잡에서 LFS 파일을 받지 않음). 화면은 `VITE_*` 빌드 변수가 없고, 빌드 모드로 나뉩니다: `npm run build`(운영 — 가짜 API 없음) · `--mode demo`(Vercel 데모 — 기사 스냅샷) · `--mode mock`(가짜 API).

### 운영 — 쿠버네티스 매니페스트 · 봉인 Secret

워크로드 칸의 경로는 `infra/k8s/` 아래입니다.

| 워크로드 | 평문 값(매니페스트) | 비밀값 — Secret 이름(키) | 봉인 명령 |
|---|---|---|---|
| backend (`services/app/backend.yaml`) | `DB_HOST` · `DB_PORT` · `DB_OPTIONS="-c jit=off"` · `REDIS_HOST` · `REDIS_PORT` · `SESSION_COOKIE_SECURE=true` · `JAVA_TOOL_OPTIONS` · `GMS_BASE_URL` · `GMS_MODEL=gpt-6-luna` · `MEANING_DAILY_LIMIT=3000` · 목록 기준값(`QUERY_MIN_*` 등) | `postgres-auth`(DB 이름 · 계정 · 비밀번호), `internal-api`(`INTERNAL_WORKER_KEY` · `INTERNAL_BATCH_KEY`), `gms-api`(`GMS_API_KEY`), `stdict-api`(`STDICT_API_KEY`) | `db` · `internal-api` · `gms-app` · `stdict` |
| frontend (`services/app/frontend.yaml`) | 없음 | — | — |
| ai (`services/ai/ai.yaml`) | `LLM_MODE=gms` · `GMS_BASE_URL` · `GMS_MODEL` · 워커 스위치 셋 `true` · `BACKEND_URL` · `HF_HUB_OFFLINE=1` · 모델 `dragonkue/BGE-m3-ko`(판 고정) | `gms-api`(`GMS_API_KEY`), `internal-api`(`INTERNAL_API_KEY` — backend 의 워커 키와 같은 값) | `gms` · `internal-api` |
| news-ingest CronJob (`services/ingest/news-ingest.yaml`) | `INGEST_*`(15분마다 최근 30분, 회차 50 · 하루 5,000건 상한 등) · `BACKEND_URL` | `newsdata-api`(`NEWSDATA_API_KEY`), `internal-api`(`INTERNAL_BATCH_KEY`) | `newsdata` · `internal-api` |
| postgres · redis (`services/data/`) | redis 는 env 없음(비밀번호 없이 NetworkPolicy 로만 막음) | `postgres-auth` | `db` |
| DB 백업 CronJob (`services/data/postgres-backup.yaml`) | `PGHOST` · `AWS_DEFAULT_REGION=ap-northeast-2` | `postgres-auth`, `pg-backup-s3`(AWS 키 · 버킷 이름) | `db` · `pg-backup-s3` |
| 이미지 받기 (app · ai) | — | `ghcr-pull`(GHCR 읽기 토큰) | `ghcr` |
| 관리 화면 · 알림 | — | `basic-auth`(`/argocd` · `/grafana` 팝업 계정), `argocd-webhook`, `argocd-notifications-secret` · `alertmanager-mattermost`(Mattermost 웹훅) | `basic-auth` · `argocd-webhook` · `mattermost` · `alertmanager` |

봉인 명령은 EC2 에서 `bash infra/server/seal-secrets.sh <명령>` 입니다. 값을 물어 받아 공개키로 잠근 `sealed-*.yaml` 만 저장소에 남깁니다.

원본: `infra/k8s/services/*`, `infra/server/seal-secrets.sh`, `.env.example`, `compose.yaml`, `.gitlab-ci.yml`, `SSOT.md` 6 · 7절

---

## 1-4. 배포 (운영)

### 배포 흐름

1. 작업 브랜치 → 분야 브랜치 → `dev` 로 MR 이 머지되면 GitLab CI 가 돕니다. MR 은 바뀐 영역만, dev 는 전부 검사합니다.
2. dev 에서 영역 폴더가 바뀌었으면 `w4` 가 그 영역 이미지를 굽고 GHCR 에 올립니다. `latest` 는 쓰지 않습니다.
3. `w5:deploy-mr` 이 `infra/k8s/services/app/kustomization.yaml` · `services/ai/kustomization.yaml` 의 태그를 바꾸는 MR 을 엽니다. **사람이 이 MR 을 머지해야 반영됩니다.**
4. GitLab 웹훅이 Argo CD 에 알리고, Argo CD 가 dev 브랜치를 읽어 바뀐 Deployment 를 하나씩 교체합니다. 결과는 Mattermost 「A102 배포알림」 채널로 옵니다.
5. 되돌릴 때는 배포 태그 커밋을 Git 에서 되돌립니다. Argo CD 가 이전 이미지로 맞춥니다.

### 배포 시 특이사항

- **무중단 교체**: Pod 가 1개여도 새 Pod 가 준비된 뒤 옛 Pod 를 내립니다(`maxSurge 1` · `maxUnavailable 0`). readiness probe 를 지나야 트래픽을 받고, 내릴 때 preStop 10초 + Spring graceful 20초로 받은 요청을 마칩니다(유예 40초).
- **DB 변경은 하위 호환으로만**: 교체 중에는 옛 판과 새 판이 같이 돕니다. 이미 적용된 마이그레이션은 고치지 않고 새 파일(`V17__…`)로만 바꿉니다. backend 는 `ddl-auto: validate` 라 스키마가 엔티티와 다르면 뜨지 않습니다.
- **AI 워커 첫 기동**: init 컨테이너가 임베딩 모델(약 2.3GB)을 Hugging Face 에서 PVC 로 한 번 받습니다(1분 안팎). 그 뒤에는 오프라인으로 뜹니다.
- **비밀값 키 백업**: Sealed Secrets 개인키를 잃으면 서버를 다시 만들 때 저장소의 봉인 Secret 을 못 풉니다. 키는 인프라 담당 PC 에 백업합니다(`infra/server/README.md` 「Sealed Secrets 키」). **다른 클러스터에 배포할 때는 자기 키로 모든 Secret 을 다시 봉인해야 합니다.**
- **이미지 저장소가 비공개**: GHCR 패키지는 인프라 담당 개인 계정 아래 비공개입니다. 다른 곳에 배포하려면 자기 레지스트리로 `.gitlab-ci.yml` 의 `IMAGE_PREFIX` · CI 변수 · `ghcr-pull` Secret, 배포 태그 파일(`kustomization.yaml` 의 `images`), 그리고 Deployment 매니페스트의 이미지 이름(`infra/k8s/services/app/backend.yaml` · `frontend.yaml` · `services/ai/ai.yaml`)을 함께 바꿉니다 — kustomize 는 이미지 이름이 같을 때만 태그를 바꿉니다.
- **서버 명령은 접속 권한이 있는 사람만**: `ssh newlearn …` · `kubectl …` 같은 운영 명령은 관리 서버 SSH 키와 허용된 IP 가 있어야 돕니다. 심사 · 재현은 1-2 로컬 실행과 3장 덤프로 합니다.
- **새 클러스터를 처음부터 세우는 순서**: `infra/README.md`(Terraform apply) → `infra/server/README.md`(EC2 · Lightsail 받는 날 스크립트 → WireGuard → kubeadm · Cilium → 워커 join → Argo CD · Secret 봉인 → 러너 · 모니터링) 순서입니다.

원본: `SSOT.md` 6절(배포 흐름 · 무중단 배포 조건 · 저장소 · 백업), `infra/server/README.md`, `.gitlab-ci.yml`

---

## 1-5. DB 접속 정보 · 계정 · 설정 파일 위치

값은 적지 않습니다. 운영 값은 봉인 Secret 에만, 로컬 값은 루트 `.env` 에만 있습니다.

| 항목 | 파일 |
|---|---|
| DB 접속 URL · 계정 (backend) | `backend/src/main/resources/application.yaml` — `spring.datasource.url: jdbc:postgresql://${DB_HOST}:${DB_PORT}/${POSTGRES_DB}`, `username · password: ${POSTGRES_USER} · ${POSTGRES_PASSWORD}` |
| Redis 접속 · 세션 (backend) | 같은 파일 — `spring.data.redis`(`${REDIS_HOST}` · `${REDIS_PORT}`), `spring.session` |
| DB 스키마 (ERD 의 실제 표) | `backend/src/main/resources/db/migration/` (Flyway V1 ~ V17). ERD 그림은 `docs/data-model.md` 의 erDiagram(설계) — 다르면 마이그레이션이 맞습니다 |
| 로컬 DB · Redis · 앱 컨테이너 | `compose.yaml`, 값은 루트 `.env` (이름은 `.env.example`) |
| 운영 DB · Redis | `infra/k8s/services/data/postgres.yaml` · `redis.yaml` |
| 운영 앱 환경 변수 | `infra/k8s/services/app/backend.yaml` · `services/ai/ai.yaml` · `services/ingest/news-ingest.yaml` |
| 운영 비밀값 (봉인) | `infra/k8s/services/*/sealed-*.yaml`, 관리 화면 · 알림 `infra/k8s/admin-ui/sealed-*.yaml`, 경보 `infra/k8s/alerts/sealed-alertmanager-mattermost.yaml`. 만드는 스크립트 `infra/server/seal-secrets.sh` |
| AI 워커 설정 | `ai/app/config.py` (기본값), 로컬 값은 루트 `.env` |
| 화면 설정 | `frontend/vite.config.ts` (개발 서버 `/api` 프록시), `frontend/nginx.conf` (운영) |
| 입구 · 인증서 | `infra/k8s/services/app/routes.yaml` · `ratelimit.yaml`, `infra/k8s/gateway/` |
| CI · CD | `.gitlab-ci.yml`, `infra/ci/deploy_mr.py`, `infra/k8s/apps/` (Argo CD 앱 목록) |
| 인프라 (AWS) | `infra/terraform/` — 입력값 `terraform.tfvars.example`(SSH 공개키 · 관리자 IP · 워커 IP · 예산 알림 메일 · 백업 버킷 이름), 상태 파일 위치 `backend.hcl.example`(실제 값은 저장소 밖) |

### DB 계정

| 계정 | 쓰는 곳 | 비밀번호가 있는 곳 |
|---|---|---|
| `newlearn` (DB 소유자) | backend · 백업 CronJob · Flyway | 운영 Secret `postgres-auth`(무작위 32자, `seal-secrets.sh db`), 로컬 `.env` |
| `newlearn_monitor` (읽기 전용, `pg_monitor`) | postgres_exporter — 조회 성능 대시보드 | 운영 Secret `postgres-exporter`(사람이 서버에서 만듦, `infra/server/perf/README.md`) |

Redis 는 비밀번호가 없고 쿠버네티스 NetworkPolicy 로 같은 클러스터의 정해진 Pod 만 받습니다.
