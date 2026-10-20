# STACK — 이 프로젝트의 선언표

**스킬과 훅이 읽는 단일 진실.** 명령 · 경로 · 게이트 · 문서 색인을 전부 여기에 모은다.

🔴 **스킬 본문에 명령어를 박지 말 것.** 스킬은 "여기 적힌 테스트 명령을 실행하라"라고만 쓴다.
그래야 스택이 바뀌어도 이 파일만 갈아 끼우면 된다.

## 채우는 법

| 표기 | 뜻 |
|---|---|
| <code>&lt;채워넣기&gt;</code> | **아직 안 정함.** 대화 시작 때 훅이 이 글자를 찾아 경고한다 |
| `해당 없음 — <이유>` | **필요 없음.** 반드시 이유를 붙인다 |
| `""` (§3 `sh` 블록 안) | **필요 없음.** `해당 없음` 을 적으면 스크립트가 값으로 읽는다. 이유는 줄 끝 `#` 주석에 |
| 표 전체가 필요 없을 때 | 표를 지우고 `해당 없음 — <이유>` 한 줄만 남긴다 |

⚠️ **"필요 없음"을 빈칸 표시로 남겨 두지 말 것.** 경고가 계속 뜬다. 그러면 경고를 무시하게 되고
결국 진짜 안 채운 빈칸까지 같이 무시된다.

반대로 모르는 값은 빈칸 표시를 그대로 둔다. §3 `sh` 블록의 `AREAS` · 폴더 · 명령 칸에 남으면
커밋 게이트는 그 칸에 걸린 검사를 건너뛰며 경고하고 CI 게이트는 실패한다. 의도한 동작이다.
`""` 로 덮으면 그 단계는 검사 없이 통과한다.

> `/harness-init` 이 기획 문서를 읽고 채웠다 (2026-10-18). 모르는 것은 추측하지 않고 빈칸으로 남겼다.
> §2 · §3 · §5 L1 은 개발 환경 단계(Jira S15P31A102-74)에서 채웠다.

---

## 1. 이 프로젝트

| | |
|---|---|
| 한 줄 정의 | NEW:LEARN — 뉴스 기사를 AI 로 6하원칙 마인드맵으로 구조화하고, 같은 사건을 다룬 기사를 묶어 이슈의 흐름(이슈 에볼루션 맵)으로 보여 주는 AI 뉴스 서비스 |
| 지금 단계 | MVP — 최종 발표(2026-11-18) 시연이 목표. 발표 뒤 서버를 끈다 |

---

## 2. 영역

한 저장소 안에 여러 덩어리가 있으면 나눠 적는다. 하나뿐이면 한 줄이면 된다.
영역 이름과 폴더는 §3 에 적는다.

| 영역 | 언어 · 프레임워크 |
|---|---|
| `frontend` | TypeScript 6 · React 19 · Vite 8 · Tailwind CSS 4 · SEED Design · TanStack Query · Zustand · React Router · D3. Node 26 |
| `backend` | Java 25 · Spring Boot 4.1 (Web MVC · Security · Data JPA · QueryDSL · Flyway) · Gradle 9 (Groovy DSL) |
| `ai` | Python 3.14 · FastAPI · LangChain · sentence-transformers (torch CPU 판) · uv |
| `infra` | Terraform 1.16 (AWS provider 6) — 관리 서버 EC2. 쿠버네티스 Helm 값 · Argo CD 앱 목록 · 매니페스트(`infra/k8s/`)와 kind 리허설 스크립트(`infra/kind/`) |

정확한 버전은 각 영역의 매니페스트(`package.json` · `build.gradle` · `pyproject.toml` · `infra/terraform/versions.tf`)와 `compose.yaml` 의 이미지 태그가 진실이다.
왜 이 버전인지는 `SSOT.md` 1절 · 6절.

뉴스 수집 배치는 구현 언어가 정해지면(`SSOT.md` 8절) 영역으로 넣을지 같이 정한다.

---

## 3. 명령 ★

스킬과 훅이 가장 많이 읽는 곳이다. 아래 블록은 훅 셋이 **그대로 읽어 간다** (`pre-commit` · `commit-msg` · `mr-check.sh`).
형식을 지킬 것 — 한 줄에 `이름="값"` 하나.

```sh
# 영역 목록. 공백으로 구분. 이름은 영문 소문자 · 숫자 · 밑줄만 쓰고 숫자로 시작하지 않는다 (하이픈 불가). 어기면 커밋이 막힌다.
# 검사 명령이 하나도 없는 영역은 넣지 않는다. CI 가 그 영역을 실패로 본다.
AREAS="frontend backend ai infra"

# 명령은 호스트에서 돈다. 영역의 런타임이 호스트에 있어야 한다 (docs/dev-environment.md 「내 영역을 호스트에서 띄울 때」).
frontend_PATH="frontend"   # 화면 (React)
frontend_INSTALL="npm ci"   # 의존성 설치
frontend_RUN="npm run dev"   # 개발 서버. compose full 프로필이면 frontend 컨테이너가 띄운다
frontend_FORMAT_FIX="npm run format"   # 포맷을 실제로 고친다
frontend_FORMAT_CHECK="npm run format:check"   # 안 맞으면 실패
frontend_LINT="npm run lint"   # 린트
frontend_TEST="npm test"   # 테스트
frontend_BUILD="npm run build"   # 빌드

backend_PATH="backend"   # API 서버 (Spring Boot)
backend_INSTALL=""   # 따로 설치하는 단계가 없다 — Gradle 이 다른 명령을 돌릴 때 의존성을 받는다
backend_RUN="./gradlew bootRun"   # IDE 에서 BackendApplication 을 실행해도 같다. 둘 다 루트 .env 를 읽는다
backend_FORMAT_FIX="./gradlew spotlessApply"
backend_FORMAT_CHECK="./gradlew spotlessCheck"
backend_LINT=""   # 린트 도구를 아직 안 골랐다 — 포맷 검사와 컴파일만 본다 (SSOT.md 8절)
backend_TEST="./gradlew test"   # Testcontainers 로 DB · Redis 를 띄운다. Docker Desktop 이 켜져 있어야 한다
backend_BUILD="./gradlew bootJar"

ai_PATH="ai"   # AI 분석 워커 (FastAPI)
ai_INSTALL="uv sync --locked"
ai_RUN="uv run --env-file ../.env uvicorn app.main:app --reload --port 8000"
ai_FORMAT_FIX="uv run --locked ruff check --select I --fix . && uv run --locked ruff format ."   # import 정렬 + 포맷
ai_FORMAT_CHECK="uv run --locked ruff format --check ."
ai_LINT="uv run --locked ruff check ."
ai_TEST="uv run --locked pytest"
ai_BUILD=""   # 빌드 산출물이 없다 — 운영 이미지는 CI 에서 굽는다 (SSOT.md 7절)
ai_EVAL="<채워넣기>"   # /evals 평가 명령 — 평가셋을 정하는 Jira S15P31A102-33 에서 채운다

infra_PATH="infra"   # 인프라 코드 (Terraform · 쿠버네티스 매니페스트 · kind 리허설). 검사는 AWS 자격 증명 없이 돈다
infra_INSTALL="terraform -chdir=terraform init -backend=false -input=false"   # provider 를 받는다. 상태 파일은 만들지 않는다
infra_RUN="bash kind/up.sh"   # 내 PC 의 kind 리허설 클러스터 (Docker Desktop · kind · Helm 필요). Terraform plan 은 읽기 전용 키를 넣은 뒤 사람이 돌린다 (infra/README.md)
infra_FORMAT_FIX="terraform fmt -recursive"
infra_FORMAT_CHECK="terraform fmt -check -recursive"
infra_LINT='terraform -chdir=terraform init -backend=false -input=false >/dev/null && terraform -chdir=terraform validate && for f in kind/*.sh server/*.sh; do [ -e "$f" ] || continue; bash -n "$f" || exit 1; done'   # 셸 스크립트(kind 리허설 · 서버 설정)는 문법만 본다. 작은따옴표 — 큰따옴표면 이 블록을 읽을 때 $f 가 빈 값으로 펼쳐져 아무 파일도 안 본다. 매니페스트는 kind 리허설(up.sh)로 확인한다
infra_TEST="terraform -chdir=terraform init -backend=false -input=false >/dev/null && terraform -chdir=terraform test"   # 가짜 provider 로 보안 그룹 규칙을 검사한다
infra_BUILD=""   # 산출물이 없다 — 실제 생성(apply)은 사람이 plan 을 읽고 한다 (.claude/docs/deploy.md 3절)

# 진실 문서는 쪼갤 곳이 없어 크기 상한에서 뺀다 (HARNESS.md 5절). 저장소 루트 기준 경로를 글자 그대로 맞춘다 (* 는 안 펼친다).
DOC_SIZE_EXEMPT="SSOT.md"   # 크기 검사에서 뺄 진실 문서. 공백 구분

# 커밋 · 브랜치 규칙 — 팀이 정한 것만 적는다. 비운 칸은 검사하지 않는다.
# 커밋 제목은 hooks/commit-msg 가, MR 의 브랜치 · 커밋 · 제목은 hooks/mr-check.sh 가 본다.
# 목록은 | 로 구분한다 (공백으로 구분하는 AREAS 와 다르다).
COMMIT_TYPES="feat|fix|refactor|docs|test|style|chore|perf|merge"   # docs/git-convention.md 2절
COMMIT_ISSUE_KEY=""     # 커밋 제목에 Jira 키를 넣지 않는다 (docs/git-convention.md) — 키는 브랜치 이름과 MR 에 둔다
BRANCH_TYPES=""         # 분야 브랜치(frontend · backend · ai · infra)와 dev 가 type/… 모양이 아니라 검사를 끈다
DEFAULT_BRANCH="dev"    # 저장소 기본 브랜치이자 MR 이 모이는 브랜치
```

⚠️ **포맷은 두 가지 모양이 다 필요하다.** `FIX` 는 고치고, `CHECK` 는 **안 맞으면 실패한다.**
게이트에 `FIX` 를 걸면 파일을 고쳐놓고 통과시켜 버려서 아무것도 못 막는다.

⚠️ 위 블록 안에 **명령 실행문을 쓰지 말 것.** 스크립트가 이 블록을 읽어 들이므로
대입문과 주석만 있어야 한다. 실행할 때 펼칠 변수 · `$( )` 가 든 값은 작은따옴표로 감싼다.
큰따옴표 안의 `$( )` 는 블록을 읽을 때 돌아서 게이트가 막는다.

명령은 `<영역>_PATH` 폴더 안에서 bash 로 돈다. `pipefail` 이 켜져 있어서 파이프(`|`) 앞 명령이
실패해도 실패다. 손으로 재현할 때 파이프가 든 명령이면 `set -o pipefail` 을 켜고 돌린다.

---

## 4. 커밋 전 게이트

`hooks/pre-commit` 가 이 순서로 돌린다. 하나라도 실패하면 커밋이 막힌다.

| 순서 | 무엇 | 명령 |
|---|---|---|
| 1 | 시크릿 스캔 | `bash .claude/hooks/secret-scan.sh` *(고정)* |
| 2 | 포맷 검사 | 3절의 `<영역>_FORMAT_CHECK` |
| 3 | 린트 | 3절의 `<영역>_LINT` |
| 4 | 테스트 | 3절의 `<영역>_TEST` |

**바뀐 파일이 있는 영역만 돌린다.** 전부 돌리면 느려서 결국 훅을 꺼버리게 된다.

**CI 는 같은 스크립트를 두 층으로 부른다** — `--ci-fast`(시크릿 · 설치 · 포맷 · 린트) 다음 `--ci`(전부 + 테스트 · 빌드).
둘 다 바뀐 파일과 상관없이 모든 영역을 돈다. 빠른 층은 하네스 자체 검사(`hooks/tests/run.sh`)도 돌리고,
PR · MR 이면 그 사이 커밋 이력까지 시크릿을 찾는다(`SCAN_BASE`). 느린 층은 빠른 층이 초록일 때만 뜬다.
느린 층이 포맷 · 린트를 다시 도는 것은 일부러다 — 로그를 볼 때 느린 층 하나만 봐도 된다.
검사 명령은 위 3절 한 곳에만 있으므로 CI 설정 파일에 다시 적지 않는다(`ci/` 참조).

| | |
|---|---|
| 테스트가 너무 느릴 때 | 해당 없음 — 아직 느리지 않다 (잰 값은 `SSOT.md` 10절). 느려지면 그때 나눈다 (예: 커밋 전엔 단위만, 통합은 CI 에서 — `<영역>_TEST="단위${CI:+ && 통합}"`) |
| 게이트를 건너뛰는 법 | `git commit --no-verify` — **급할 때만, 사람이 친다. 쓴 사실을 PR 에 적는다** (Claude 는 `settings.json` deny 로 막혀 있다) |

**잡을 쪼개서 빨라지는 건 러너가 남을 때뿐이다.** 동시 실행이 2인데 잡을 8개로 나누면
줄을 서서 네 번에 나눠 돈다. 사람이 여럿이면 그만큼 곱해진다.

느리다는 말이 나오면 캐시보다 **대기 시간과 실행 시간을 먼저 나눠 잰다.** GitLab · GitHub 모두
잡마다 둘을 따로 보여 준다. 무엇을 할지는 잰 결과가 정한다.

| 재 보니 | 할 일 (위에서부터) |
|---|---|
| **대기가 실행보다 길다** — 용량이 모자라다. 설정으로는 못 고친다 | ① 쓸모없어진 실행이 러너를 붙들지 않게 한다 — `ci/` 의 취소 설정(이미 켜져 있다) ② PR 에서는 바뀐 영역만 돌린다 — `ci/` 의 영역별 예시 ③ 러너를 늘린다. **운영 서버와 같은 기계에 두지 않는다** — 빌드가 서비스와 CPU 를 다툰다 |
| **실행이 길다** — 잡 하나가 무겁다 | ① 빠른 층이 형식 오류를 먼저 알리는지 본다 ② 설치가 큰 몫이면 재 보고 캐시를 붙인다 — `ci/` 의 캐시 예시 ③ 테스트가 큰 몫이고 러너가 남으면 나눠 돌린다 — `ci/` 의 샤드 예시 |

---

## 5. 헬스체크 (L1~L3)

`/health-check` 가 읽는다. L0(하네스 자체 점검)은 여기 적을 값이 없다. 자세한 원리는 `docs/health-check.md`.

### L1 — 로컬 (내 컴퓨터에서 개발이 되나)

| 항목 | 확인 방법 |
|---|---|
| 필요한 도구·버전 | Docker Desktop(Windows 는 WSL2 백엔드) · Git · Git Bash(Windows). Docker Engine 25 이상 — healthcheck 의 `start_interval` 을 쓴다 (Engine 29.6.2 · Compose v5.3.1 에서 확인). 커밋 전 검사에 쓰는 호스트 런타임은 `docs/dev-environment.md` |
| 필요한 환경변수 | `.env.example` 에 설명이 있다 — `POSTGRES_DB` · `POSTGRES_USER` · `POSTGRES_PASSWORD` · `DB_PORT` · `REDIS_PORT` · `BACKEND_PORT` · `AI_PORT` · `FRONTEND_PORT` · `LLM_MODE` · `GMS_MODEL` · `GMS_API_KEY` · `GMS_BASE_URL` |
| 로컬 의존 서비스 | PostgreSQL(pgvector) · Redis — compose 기본 실행으로 띄운다 |
| 다 됐는지 한 번에 보는 명령 | `docker compose --profile full up -d --wait` — 모든 컨테이너가 healthy 가 되면 0 으로 끝난다. 띄워 둔 뒤에는 `docker compose --profile full ps` |
| 🔴 **클론 후 첫 실행까지** | 30분 · `.env.example` 을 `.env` 로 복사한 뒤 `docker compose --profile full up`. 첫 실행 = 화면 접속 + API · 워커 헬스 체크 정상. 잰 값은 `SSOT.md` 10절 |
| 개발 환경을 어떻게 주나 | compose 개발 프로파일 — 기본 실행은 DB · Redis 만(백엔드 개발자는 IDE 에서 앱 실행), `full` 프로필은 화면 · API · 워커까지. Windows 는 저장소를 WSL2 리눅스 파일 시스템 안에 클론한다 (`SSOT.md` 7절 · 쓰는 법은 `docs/dev-environment.md`) |
| 짝을 맞춰야 하는 환경변수 | DB 접속 정보(`POSTGRES_DB` · `POSTGRES_USER` · `POSTGRES_PASSWORD`). compose 가 같은 값을 DB 컨테이너와 API 컨테이너에 넣고, IDE 에서 띄운 API 도 같은 `.env` 를 읽는다. 맞출 자리가 없어 만드는 스크립트는 두지 않았다 (`SSOT.md` 7절). 워커는 아직 DB 를 안 쓴다 |

컨테이너를 쓸 수 있는 스택이면 **기본값은 compose 파일 하나다.** 앱 컨테이너(런타임 · 라이브러리)와
DB 컨테이너를 따로 두고 한 명령으로 띄운다. 비밀값은 스크립트가 난수로 채운다.

DB 에는 `healthcheck`(받을 준비가 됐는지 보는 명령)를 달고 앱은 `depends_on` 의
`condition: service_healthy` 로 기다린다. compose 는 컨테이너가 떠 있을 때까지만 기다리고
준비될 때까지는 안 기다린다. 이걸 빼면 첫 실행이 연결 거부로 끝날 수 있다.

개발용 컨테이너는 코드를 이미지에 굽지 않는다. 내 폴더를 컨테이너에 연결(마운트)해서
고치는 즉시 반영되게 한다. 이걸 모르면 「컨테이너는 개발에 불편하다」며 컨테이너 밖에서 돌리게 된다.
Windows 에서 고친 것이 컨테이너에 안 닿는 함정은 `docs/harness-init.md` 에 있다.

⚠️ 짝을 맞춰야 하는 값은 **사람 손에 맡기지 않는다.** 스크립트 하나가 한 번에 만들어 양쪽에
같은 값을 넣는다. 처음 한 번만 읽히는 값(예: DB 볼륨을 처음 만들 때 들어가는 비밀번호)은
어긋난 채로 한 번 띄우면 그 볼륨을 지워야 고쳐진다.

### L2 — 런타임 (돌고 있는 서비스가 정상인가)

| 항목 | 값 |
|---|---|
| 헬스 엔드포인트 | API `GET /actuator/health` (DB · Redis 연결 포함) · 워커 `GET /health` (Redis 연결 포함). 정상이면 200, 아니면 503 |
| 🔴 **배포 판정용** 엔드포인트 | `<채워넣기>` |
| 배포 판정에 **포함**할 것 | `<채워넣기>` (없으면 앱이 아무 일도 못 하는 것만 — 후보: PostgreSQL · Redis 연결) |
| 배포 판정에서 **뺄 것** | `<채워넣기>` (후보: SSAFY GMS · NewsData.io 같은 외부 API) |
| 외부 노출 여부 | `<채워넣기>` (Envoy Gateway 에서 헬스 주소를 막을지) |

> 🔴 **"서비스가 건강한가"와 "배포해도 되는가"는 다른 질문이다.** 이유는 `docs/health-check.md` §2.

### L3 — 배포 후 (방금 올린 게 진짜 살아났나)

| 항목 | 값 |
|---|---|
| 확인 명령 | `<채워넣기>` (서버가 아직 없다. 헬스 주소 말고 **실제 API** 를 부른다) |
| 정상 판정 기준 | `<채워넣기>` |
| 떠 있는 버전 확인 | `<채워넣기>` (방금 올린 커밋 · 태그와 같은가. 앱이 버전을 안 내보내면 그 응답부터 만든다) |
| 확인 실패 시 | 6절의 되돌리는 법 — Git 에서 배포 설정을 이전 커밋으로 되돌린다 |

---

## 6. 배포

| | |
|---|---|
| 배포가 있나 | 서버 — 쿠버네티스(kubeadm 직접 구축) |
| 어디로 | 노드 2대 — 관리 서버(컨트롤 플레인) AWS EC2 t3.large · 서비스 서버(워커) SSAFY Lightsail xlarge. 둘 다 아직 없다 (EC2 미생성 · Lightsail 미수령, `SSOT.md` 6절) |
| 무엇으로 트리거되나 | push → GitLab Runner 가 테스트 · 이미지 빌드 → 배포 설정의 이미지 버전 갱신 → Argo CD 가 반영. 어느 브랜치에서 배포할지 `<채워넣기>` |
| 배포 명령 | 사람이 치는 명령은 없다 — Argo CD 가 Git 의 배포 설정을 클러스터에 맞춘다(GitOps). 배포 설정은 `infra/k8s/apps/`(앱 목록) 와 그것이 가리키는 `infra/k8s/` 폴더. kind 리허설에서 확인 (`SSOT.md` 6절) |
| **산출물(이미지 · 패키지 · 앱 번들)을 어디에 두나** | `<채워넣기>` (GitLab Container Registry 를 쓸 수 있는지 미정 — `SSOT.md` 8절) |
| 태그 규칙 | `<채워넣기>` (커밋 SHA 처럼 빌드마다 다른 이름. `latest` 만 쓰지 않는다) |
| 🔴 되돌리는 법 | Git 에서 배포 설정을 이전 커밋으로 되돌리면 Argo CD 가 이전 버전으로 맞춘다 (`SSOT.md` 6절) |
| 되돌려도 **안 돌아오는 것** | DB 구조 변경(마이그레이션) — 되돌리기 전에 스키마가 이전 버전과 맞는지 본다. 이미 호출한 GMS 토큰 비용 |
| 새 환경변수를 추가했을 때 | `<채워넣기>` (쿠버네티스 Secret · ConfigMap 을 어디에 두는지 정해진 뒤 적는다) |

**이미지로 배포한다면 CI 가 굽고 레지스트리에 올린다.** 서버는 받아서 띄우기만 하고 되돌리기는 옛 태그를
다시 받는 일이 된다. GitLab·GitHub 모두 저장소에 딸린 레지스트리를 무료로 준다.
레지스트리 정리 정책을 켜면 되돌릴 태그가 몇 개 남는지 같이 적는다. 정책이 옛 태그를 지우면
되돌리기도 같이 사라진다.

서버에서 직접 구우면 되돌리기가 그 서버의 캐시에만 기댄다. 캐시를 한 번 지우면(`docker image prune -a`)
되돌릴 이미지가 사라진다. 원래 받던 곳이 막혀 있으면 다시 받지도 못한다.

자격 증명 · 인프라 변경 · 배포 지표를 왜 이렇게 두는지는 `docs/deploy.md`.

⚠️ **첫날 아무 기능 없이 배포를 한 바퀴 돌린다.** 이 표를 채우는 가장 빠른 길이다.
「Hello」 화면 하나와 API 하나로 내 노트북 → 깃 → 서버 → 브라우저까지 끝낸다.
Hello 를 두 번 배포하고 첫 태그로 되돌려 본다. 첫 배포만으로는 되돌릴 태그가 없다.
기능이 없을 때는 금방 풀리는 문제가 기능이 쌓인 뒤에는 원인 후보 열 개짜리가 된다.

---

## 7. 단일 진실 색인

주제마다 **진실인 문서 하나**를 정한다. 나머지는 여기를 가리킨다.

| 주제 | 진실인 문서 |
|---|---|
| 기획 · 범위 | `docs/mvp-overview.md` (기능 ID F01~F11 · 우선순위). 요구사항 상세는 PRD `_bmad-output/planning-artifacts/prds/prd-S15P31A102-2026-10-14/prd.md` |
| 진행 상태 (계획표 · 이슈 트래커) | Jira — `ssafy.atlassian.net` 프로젝트 S15P31A102 (스프린트 보드) |
| 데이터 구조 | 데이터셋 필드는 PRD 폴더의 `addendum.md`. 서비스 데이터 모델은 `docs/data-model.md` (설계. 만들어진 테이블은 `backend/src/main/resources/db/migration/` 이 이긴다) |
| 화면 · 이동 | `docs/user-flow.md` · `docs/prototype/` (가장 높은 버전이 최신) |
| 디자인 | `_bmad-output/planning-artifacts/ux-designs/` |
| API 명세 | `docs/api.md` (공통 규칙 · 오류 코드 · 엔드포인트 목록). 필드 상세는 화면용 `docs/api-screen.md` · 배치 · 워커용 `docs/api-internal.md` |
| 용어 | 제품 용어의 정의는 PRD 부록 A 「용어집」. 테이블 · API 이름과의 대응 · 개발 용어는 `docs/glossary.md` |
| 시스템 구성도 | `SSOT.md` 1 · 2절 (그림은 아직 없다) |
| 로컬 개발 환경 쓰는 법 | `docs/dev-environment.md` (정한 것은 `SSOT.md` 7절) |
| 협업 규칙 (브랜치·커밋·PR) | `docs/git-convention.md` · MR 양식은 `.gitlab/merge_request_templates/Default.md` |
| 기능 스펙 | `docs/specs/` — 기능마다 한 파일, 이름은 기능 번호로 시작한다 (예: `docs/specs/F07-issue-evolution-map.md`) |
| 승인한 계획 | `docs/plans/` (`settings.json` 의 `plansDirectory` 로 plan mode 가 바로 쓴다) |
| 인계 메모 | MR 본문 (작업 중이면 Draft MR) |

**기록 3종** — 스킬들이 여기를 찾아 쓴다. 운영법은 `docs/trackers.md`.
진실 문서 하나에 절로 두면 `문서#절` 로 적는다. 정한 것은 한 절에 모이지 않아서 DECISIONS 칸에는
`문서 (정한 것은 그 사실이 있는 절 · 뒤집은 것은 #뒤집은 것)` 처럼 적는다.

| | |
|---|---|
| 기록 방식 | 진실 문서 하나 — 루트 `SSOT.md` (한 팀 · 한 달짜리 프로젝트, `HARNESS.md` 6절) |

| 기록 | 파일 또는 절 |
|---|---|
| DECISIONS — 정한 것과 **왜** | `SSOT.md` (정한 것은 그 사실이 있는 절 · 뒤집은 것은 `#뒤집은 것`) |
| EXPERIMENTS — 잰 것과 **숫자** | `SSOT.md#잰 것` |
| 🔴 OPEN — 아직 못 정한 것 | `SSOT.md#못 정한 것` |

> OPEN 이 왜 꼭 있어야 하는지는 `HARNESS.md` 6절.
> 경로만 적고 안 만들면 없는 것과 같다 — `/harness-init` 이 실제로 만든다.

| | |
|---|---|
| 문서끼리 충돌하면 누가 이기나 | 기능 · 범위는 `docs/mvp-overview.md` 가 PRD 를 이긴다 (PRD 머리말). 시스템 · 기술 · 정한 것은 `SSOT.md`. 둘이 부딪치면 무엇을 만드는지는 MVP 개요, 어떻게 돌리는지는 SSOT 를 따르고 진 쪽을 바로 고친다 |

---

## 8. 건드리지 말 것 · 로컬 전용 파일

건드리지 말 것 목록은 `AGENTS.md` 「건드리지 말 것」에 적는다. 여기에 옮겨 적지 않는다.

**로컬에만 있고 커밋 안 되는 파일** (각자 따로 준비해야 하는 것)

| 파일 | 용도 | 어떻게 구하나 |
|---|---|---|
| `.env` | 로컬 개발 환경변수 (DB 접속 정보 · 포트 · GMS 키 등) | `.env.example` 을 복사해 만든다. GMS 키는 각자 SSAFY GMS 에서 받는다 (없으면 모의 응답 모드) |
| `.claude/settings.local.json` | 개인 Claude Code 설정 | 각자 만든다 |
| Lightsail 접속 키(`*.pem`) | 서비스 서버 접속 | 받으면 저장소 밖에 둔다 |
| `infra/terraform/terraform.tfvars` | Terraform 변수 (관리자 IP · SSH 공개키 · 예산 알림 메일) | `terraform.tfvars.example` 을 복사해 채운다 |
| `infra/kind/.kubeconfig` · `infra/kind/.git-mirror/` | kind 리허설 클러스터 접속 정보 · Argo CD 가 읽는 로컬 Git 미러 | `bash infra/kind/up.sh` 가 만든다. 내 `~/.kube/config` 와 섞지 않으려고 따로 둔다 |
| `infra/terraform/backend.hcl` | Terraform 상태 파일 버킷 이름 · 프로필 | `backend.hcl.example` 을 복사해 채운다. 버킷은 `infra/README.md` 「처음 한 번」에서 한 번 만든다 |
| AWS 액세스 키 (`~/.aws/credentials`, 저장소 밖) | `terraform plan` · `apply` 자격 증명 — apply 전용 IAM 사용자(`newlearn-apply` 프로필). 10/18 의 읽기 전용 키(`newlearn`)는 비활성화한다 | IAM 콘솔에서 `infra/terraform/iam/apply-policy.json` 을 붙인 사용자를 만들고 `aws configure --profile newlearn-apply` 에 넣는다 — 하는 법은 `infra/README.md` |
| SSH 개인키 `~/.ssh/newlearn-admin` (저장소 밖) | 관리 서버 접속 | `ssh-keygen` 으로 만든다. 공개키만 `terraform.tfvars` 에 넣는다 |

⚠️ 새로 생기면 **그 즉시** 여기와 `.gitignore` 에 추가한다. **값 자체는 절대 적지 않는다.**

---

## 9. 선택 모듈

| 모듈 | 켤까 | 조건 |
|---|---|---|
| `/evals` | 예 — SSAFY GMS(GPT-5-mini)로 6하원칙 추출 · 동일 사건 판정을 한다 | LLM 을 부르는 기능이 있으면 켠다 |
| 운영 모듈 | 아니오 — 최종 발표(2026-11-18) 뒤 서버를 끄는 시연 프로젝트다. *(운영)* 칸은 지웠다. EC2 빌링 알람은 `SSOT.md` 6절대로 따로 챙긴다 | 실사용자가 있거나 서비스를 오래 운영하면 켠다. 시연 · 프로토타입이면 끈다. 나중에 켜면 템플릿의 같은 줄을 다시 가져온다. 왜는 `docs/deploy.md` |

| | |
|---|---|
| 평가셋 위치 | `<채워넣기>` (Jira S15P31A102-33 에서 정한다. 평가 지표는 PRD 폴더 `addendum.md` 「평가 지표 메모」) |
| 회귀 묶음으로 막나 | `<채워넣기>` (평가셋이 생긴 뒤 정한다) |

평가 명령은 §3 `<영역>_EVAL` 에 적는다.
`아니오` 면 `/harness-init` 이 `settings.json` 에 `"skillOverrides": {"evals": "off"}` 를 넣어 끈다.
파일은 지우지 않는다 — 지우면 템플릿 업데이트(`hooks/upgrade.sh`)가 그 파일을 빼고 얹어야 한다.
