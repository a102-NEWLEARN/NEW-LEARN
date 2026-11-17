# 2. 외부 서비스

프로젝트가 쓰는 외부 서비스와, 새 환경에서 쓰려면 필요한 가입 · 발급 정보입니다. 키 · 토큰 · 비밀번호의 값은 적지 않습니다. 운영 값은 봉인 Secret(1-3) · GitLab CI/CD 변수 · 관리자 PC 에만 있습니다.

**소셜 로그인은 쓰지 않습니다.** 회원은 서비스 안에서 아이디 · 비밀번호로 가입하고 로그인합니다(비밀번호는 해시만 DB 에 저장, 로그인 세션은 Redis). 외부 인증 서비스 가입은 필요 없습니다.

「지금 쓰나」는 2026-11-17 dev 브랜치의 코드 · 매니페스트로 확인했습니다.

| 서비스 | 쓰는 곳 | 지금 쓰나 | 필요한 설정 (환경 변수 / Secret) |
|---|---|---|---|
| SSAFY GMS (OpenAI 호환 LLM) | AI 워커의 마인드맵 추출 · 동일 사건 판정 · 이슈 판단, backend 의 용어사전 문맥 뜻 | 씀 | `GMS_API_KEY`(Secret `gms-api`) · `GMS_BASE_URL` · `GMS_MODEL` |
| NewsData.io News API | 뉴스 수집 배치(15분마다) | 씀 | `NEWSDATA_API_KEY`(Secret `newsdata-api`) |
| 국립국어원 표준국어대사전 Open API | backend 의 사전 API(A19 `GET /api/v1/dictionary`) | **안 씀** — 키 · 코드 · Secret 은 연결돼 있지만 화면이 부르지 않음 | `STDICT_API_KEY`(Secret `stdict-api`) |
| Hugging Face | 임베딩 모델 `dragonkue/BGE-m3-ko` 받기 | 씀 (워커 첫 기동 때 한 번) | 없음 — 공개 모델, 판(커밋)을 매니페스트에 고정 |
| AWS (EC2 · S3 · Budgets · IAM) | 관리 서버, Terraform 상태 파일, DB 주간 백업, 예산 알림 | 씀 | 관리자 PC `~/.aws/credentials`(apply 전용 키), Secret `pg-backup-s3` |
| SSAFY 지급 서버 (AWS Lightsail) | 서비스 서버(쿠버네티스 워커) | 씀 | 접속 키 `*.pem`(저장소 밖) |
| 가비아 | 도메인 `newlearn.io.kr` DNS | 씀 | 없음 (가비아 화면에서 A 레코드) |
| Let's Encrypt | HTTPS 인증서 | 씀 | 없음 (cert-manager 가 받음) |
| GitHub | 이미지 저장소(GHCR 비공개 패키지), 화면 공개 미러(Vercel 데모 원본) | 씀 | CI 변수 `GHCR_USER` · `GHCR_TOKEN`, Secret `ghcr-pull` |
| Vercel | 서버 없이 보는 화면 데모 | 씀 (데모만) | 없음 (`frontend/vercel.json`) |
| Google Analytics 4 | 사용 분석 | 씀 (운영 도메인에서만) | 없음 (`frontend/public/analytics.js`) |
| Microsoft Clarity | 화면 사용 기록 분석 | 씀 (운영 도메인에서만) | 없음 (`frontend/public/analytics.js`) |
| SSAFY GitLab (lab.ssafy.com) | 소스 · MR · CI, Argo CD 가 읽는 저장소 | 씀 | 러너 토큰 · 배포 토큰 · 프로젝트 액세스 토큰(1-3) |
| Mattermost (SSAFY) | 배포 알림 · 경보 | 씀 | Secret `argocd-notifications-secret` · `alertmanager-mattermost` |

---

## 2-1. SSAFY GMS — LLM

| 항목 | 값 |
|---|---|
| 주소 | `https://gms.ssafy.io/gmsapi/api.openai.com/v1` (`GMS_BASE_URL`) |
| 모델 | `gpt-6-luna` (`GMS_MODEL`) |
| 키 | `GMS_API_KEY` — SSAFY 가 팀에 준 공용 키. 운영은 봉인 Secret `gms-api` 를 ai 네임스페이스(`seal-secrets.sh gms`)와 app 네임스페이스(`seal-secrets.sh gms-app`)에 따로 둡니다 |
| 예산 | 팀 공용 1,683,000 크레딧 (2026-10-21 ~ 12-11, 후불) |

- AI 워커: 기사마다 마인드맵(가지 4개: 핵심 내용 · 원인·배경 · 반응 · 전망)과 대표 사건을 뽑고(EXTRACT), 같은 사건인지 판정하고(MATCH_EVENT), 이슈에 붙이거나 새 이슈를 만듭니다(ISSUE). 작업은 Redis Streams 큐로 받습니다.
- backend: 기사 · 이슈 화면에서 드래그한 말의 문맥 뜻(A26 `POST /api/v1/dictionary/meaning`)을 바로 부릅니다. 하루 상한 `MEANING_DAILY_LIMIT`(운영 3,000), 같은 말은 Redis 에 하루 둡니다.
- 로컬은 `LLM_MODE=mock` 이 기본이라 키 없이 모의 응답으로 돕니다. 실제로 부르려면 `gms` 로 바꾸고 키를 넣습니다(비용이 듭니다).

## 2-2. NewsData.io — 뉴스 수집

| 항목 | 값 |
|---|---|
| 구독 | Basic 1개월(선불) — 팀장 계정으로 결제, 11월 동안 사용 |
| 한도 | 달마다 2만 크레딧. 최신 기사(latest) 요청 한 번에 1 안팎, 지난 기사(archive) 5 |
| 키 | `NEWSDATA_API_KEY` (봉인 Secret `newsdata-api`, `seal-secrets.sh newsdata`) |
| 설정 | `infra/k8s/services/ingest/news-ingest.yaml` — 15분마다 최근 30분, 한국 · 한국어, 스포츠 · 연예 등 제외, 회차당 요청 40 · 기사 2,000 상한 |

- 수집 배치는 DB 에 직접 쓰지 않고 backend 직원용 API 로 넣습니다(적재 B2 · 분석 등록 B1, `INTERNAL_BATCH_KEY`). 쓰는 법은 `infra/server/ingest.md`.
- 새 환경에서는 newsdata.io 에서 가입해 키를 받습니다.

## 2-3. 국립국어원 표준국어대사전 Open API — 지금 안 씀

- **2026-11-10 부터 화면은 이 API 를 부르지 않습니다.** 용어사전은 사전 뜻 대신 그 글 문맥에 맞는 뜻 하나를 GMS 로 보여 주는 A26 으로 바뀌었습니다. 화면 코드(`frontend/src/api/dictionary.ts`)는 `/dictionary/meaning` 만 부릅니다.
- backend 의 A19(`GET /api/v1/dictionary`) · 키(`STDICT_API_KEY`, 봉인 Secret `stdict-api`) · 입구 길(`routes.yaml` 의 `dictionary`)은 되돌릴 때를 위해 남겨 두었습니다.
- 키는 stdict.korean.go.kr 「개발 지원(Open API)」에서 신청합니다(무료, 계정당 하나, 하루 50,000건). 사전 텍스트는 CC BY-SA 2.0 KR 이라 쓸 때는 출처를 표시해야 합니다.

## 2-4. Hugging Face — 임베딩 모델

- 같은 사건 후보를 찾는 임베딩 모델 `dragonkue/BGE-m3-ko`(1024차원, CPU)를 받습니다. 판(커밋)은 `infra/k8s/services/ai/ai.yaml` 의 `MODEL_REVISION` 에 고정했습니다.
- ai Pod 의 init 컨테이너가 처음 한 번 PVC(`ai-model-cache`, 10Gi)에 받고(약 2.3GB, 1분 안팎), 워커는 `HF_HUB_OFFLINE=1` 로 받은 파일만 씁니다.
- 공개 모델이라 가입 · 토큰이 필요 없습니다.

## 2-5. AWS · SSAFY 지급 서버

| 자원 | 무엇 | 만드는 곳 |
|---|---|---|
| EC2 t3.large · 탄력적 IP · 보안 그룹 | 관리 서버(쿠버네티스 컨트롤 플레인 · CI 러너 · 모니터링), 서울 리전, Ubuntu 24.04, gp3 50GiB 암호화 | `infra/terraform/` |
| S3 버킷 둘 | Terraform 상태 파일(버전 관리 · 퍼블릭 차단, 이름은 저장소 밖), DB 주간 백업(버전 관리) | 상태 버킷은 `aws s3api` 로 처음 한 번(`infra/README.md` 「처음 한 번」 3), 백업 버킷은 `infra/terraform/backup.tf` |
| Budgets | 프로젝트 예산 알림 | `infra/terraform/budget.tf` |
| IAM 사용자 둘 | apply 전용(EC2 · 예산 · 두 버킷만, `infra/terraform/iam/apply-policy.json`), 백업 올리기 전용(관리 서버 IP 조건, `infra/terraform/iam/pg-backup-uploader-policy.json`) | IAM 콘솔에서 정책 JSON 을 붙여 만듦(`infra/README.md` 「처음 한 번」 2 · 「DB 백업 버킷 · 올리는 키」) |

- 프로젝트 전용 팀 AWS 계정입니다. 루트 계정은 MFA 를 걸고 결제 · 비상시에만 씁니다. 처음 한 번 하는 일은 `infra/README.md` 「처음 한 번」.
- 서비스 서버(워커)는 SSAFY 가 지급한 Lightsail xlarge(4 vCPU · 16 GB)입니다. 콘솔 없이 도메인과 접속 키(`*.pem`)만 받았습니다. 받는 날 할 일은 `infra/server/README.md` 「Lightsail」.
- 두 서버는 WireGuard 터널로 잇고, 쿠버네티스 포트는 바깥에 열지 않습니다.
- 발표 뒤 EC2 는 `terraform destroy` 로 지웁니다.

## 2-6. 가비아 · Let's Encrypt — 도메인 · HTTPS

- 도메인 `newlearn.io.kr` 의 DNS 는 가비아에 있습니다. A 레코드 `@` · `www` → 서비스 서버 공인 IP(TTL 600). `www` 와 `http://` 는 `https://newlearn.io.kr` 로 넘깁니다(`infra/k8s/gateway/redirects.yaml`).
- 인증서는 cert-manager 가 Let's Encrypt 에서 HTTP-01 로 받고, 만료 30일 전에 알아서 다시 받습니다. 가입은 필요 없습니다. 가비아는 DNS 를 프로그램으로 바꾸는 API 가 없어 DNS-01 은 쓰지 않습니다.

## 2-7. GitHub · Vercel

| 쓰임 | 내용 |
|---|---|
| GHCR | 운영 이미지 `newlearn-backend` · `newlearn-frontend` · `newlearn-ai` 를 인프라 담당 개인 GitHub 계정의 비공개 패키지로 둡니다. SSAFY GitLab 은 컨테이너 레지스트리가 꺼져 있어서입니다. 올리기는 CI 변수 `GHCR_USER` · `GHCR_TOKEN`(classic 토큰 `write:packages` · `read:packages`), 받기는 봉인 Secret `ghcr-pull`(`seal-secrets.sh ghcr`). 토큰 만료 2026-11-30 |
| 공개 미러 · Vercel 데모 | 화면 코드를 GitHub 공개 미러에 올리고, Vercel 이 그 미러의 `frontend` 브랜치를 데모 빌드(`npm run build -- --mode demo`)로 올립니다. 서버 없이 2026-11-16 실제 기사 스냅샷으로 화면만 볼 수 있고, 회원 · 용어사전은 가짜 응답입니다(`frontend/README.md`, `docs/plans/2026-11-16-demo-snapshot.md`) |

## 2-8. Google Analytics 4 · Microsoft Clarity — 사용 분석

- `frontend/public/analytics.js` 가 운영 도메인(`newlearn.io.kr`)에서만 두 스크립트를 띄웁니다. 로컬 · 데모에서는 돌지 않습니다.
- 측정 ID 는 화면에 실리는 공개 값이라 그 파일에 있습니다. 새 환경에서는 각 서비스에서 속성 · 프로젝트를 만들고 파일의 ID 를 바꿉니다.
- 응답 보안 머리(CSP)가 두 서비스의 주소를 허용합니다(`infra/k8s/services/app/routes.yaml`). 주소를 바꾸면 CSP 도 같이 바꿉니다.

## 2-9. SSAFY GitLab · Mattermost

- 저장소 `lab.ssafy.com/s15-final/S15P31A102`, 기본 브랜치 `dev`. 이 프로젝트가 쓸 공유 러너가 없어 GitLab Runner 를 관리 서버 클러스터 안에 직접 둡니다(`infra/server/README.md` 「GitLab Runner」).
- Argo CD 는 읽기 전용 배포 토큰(`read_repository`)으로 dev 를 읽고, GitLab 프로젝트 웹훅(Push events)이 `https://newlearn.io.kr/argocd/api/webhook` 으로 바로 알립니다.
- Mattermost 「A102 배포알림」 채널의 들어오는 웹훅 하나로 Argo CD 배포 알림과 Alertmanager 경보를 받습니다. 주소는 봉인 Secret 둘(`seal-secrets.sh mattermost` · `alertmanager`)에 있습니다.

원본: `SSOT.md` 1 · 3 · 5 · 6절, `infra/server/seal-secrets.sh`, `infra/k8s/services/`
