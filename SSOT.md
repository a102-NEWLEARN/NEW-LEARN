# SSOT — NEW:LEARN 단일 진실 문서

NEW:LEARN의 시스템 구성, 기술, 배포, 개발 환경과 팀이 정한 것 · 뒤집은 것 · 못 정한 것 · 잰 것을 모은 문서.
**무엇을 만드는지(기능·범위)는 `docs/mvp-overview.md`가 기준**이고, 이 문서는 그것을 어떻게 돌리는지 다룬다.
정한 것은 그 사실이 있는 절에 적는다. 다른 문서는 이 문서의 절을 가리키고, 같은 사실을 옮겨 적지 않는다.
기능은 MVP 개요의 기능 ID(F01~F11), 열린 질문은 PRD의 Q번호로 가리킨다.

- 범위 기준: `docs/mvp-overview.md` (PRD와 다르면 MVP 개요가 우선 — PRD 머리말)
- 요구사항: `_bmad-output/planning-artifacts/prds/prd-S15P31A102-2026-10-14/prd.md`
- 데이터셋 구조 · 평가 지표: 같은 폴더의 `addendum.md`
- 협업 규칙: `docs/git-convention.md`

---

## 1. 구성 요소

| 영역 | 기술 | 역할 |
|---|---|---|
| 화면 | React | 이슈 에볼루션 맵, 기사 마인드맵, 변화 카드 화면 |
| API 서버 | Spring Boot | 조회 API, 분석 작업 등록, 분석 결과 저장 |
| AI 분석 워커 | FastAPI (Python) | 작업 큐 소비, 임베딩, LLM 호출(LangChain) |
| LLM | SSAFY GMS (GPT-5-mini) | 핵심 정보 추출, 동일 사건 판정 등 판단 작업 |
| DB | PostgreSQL + pgvector | 기사 원본, 분석 결과, 임베딩 저장·유사도 검색 |
| 캐시 · 작업 큐 | Redis (Streams, AOF 저장) | 조회 캐시, 분석 작업 큐 |
| 뉴스 수집 배치 | 운영 시 쿠버네티스 CronJob (구현 언어 미정) | 데이터셋 적재, 순차 투입, 외부 뉴스 API 수집 |
| 외부 입구 | Envoy Gateway | HTTPS 요청을 화면·API로 분배 |
| 모니터링 | Prometheus, Grafana | 지표 수집, 대시보드 |

언어·프레임워크 버전은 2026-10-18에 현재 안정 버전을 확인해 정했다. 목록은 `.claude/stack.md` 2절, 정확한 값은 각 영역의 매니페스트(`package.json`·`build.gradle`·`pyproject.toml`)와 `compose.yaml`의 이미지 태그다.

- Python 3.14: sentence-transformers 6.1은 공식 지원을 3.13까지만 적었다. 3.14.8에서 실제 임베딩이 도는 것을 확인했고(10절), 문제가 생기면 3.13으로 내린다
- torch는 CPU 판만 받는다. GPU 서버가 없다(3절)

## 2. 데이터 흐름

1. 사용자 → Gateway → React(화면) / Spring Boot(API)
2. Spring Boot ↔ PostgreSQL 저장·조회
3. 수집 배치가 기사를 PostgreSQL에 적재 (F01). 데이터셋은 발행일 순서로 순차 투입 (PRD 6.2)
4. 새 기사에 대해 분석 작업을 Redis 작업 큐에 등록
5. AI 분석 워커가 작업을 가져가 분석 단계를 수행 (3절)
6. 워커가 결과를 Spring Boot에 전달해 저장

## 3. 분석 파이프라인

> 이 절은 전부 초안이다. AI 담당(강유진, 황도경) 확인 필요.

분석은 단계별로 나눠, 범위가 바뀌어도 단계를 켜고 끄는 것으로 대응한다.

| 단계 | MVP 개요 기능 | 무엇으로 | 상태 |
|---|---|---|---|
| 6하원칙 추출 (누가·언제·어디서·무엇을·어떻게·왜) | F03 → F04·F05(마인드맵·근거) | GMS. 노드 구조·출력 스키마 상세는 Q33 | 켬 |
| 같은 사건 후보 찾기 | F06 | 임베딩(sentence-transformers, CPU) + pgvector, 후보 최대 5개 | 켬 |
| 동일 사건 판정 | F06 → F07(이슈맵) | GMS. 판단 기준은 Q34 | 켬 |
| 주장 추출 · 관계 판정 | F09 → F10(변화 카드) | GMS | 추후 논의. 자리만 두고 꺼 둠 |

- 평가 지표는 `addendum.md` 「평가 지표 메모」를 따른다
- GPU 서버는 없다 (2차 교보재에서 제외). 학습이 필요한 방식(SM-8의 파인튜닝 비교)은 이 구성에 들어 있지 않다 — Q23

### 예산

- GMS 토큰 총 $168.30 (후불). 기사당 약 $0.01 기준 약 1만 7천 건 분석 가능
- 개발 중에는 모의 응답을 기본으로 하고, 실제 GMS 호출은 명시적으로 켤 때만

## 4. 작업 큐

Redis Streams로 시작하고, 필요해지면 Kafka로 바꾼다.

- 지금 Redis로 충분한 이유
  - 같은 기사를 여러 단계·기능이 읽어도 단계마다 consumer group을 두면 각자 따로 읽는다
  - 기사 원본이 DB에 있어 다시 처리할 때는 이벤트를 다시 발행하면 된다
  - 분석 규모는 약 1만 7천 건(GMS 예산 기준)이고 서버는 Lightsail 1대다
- Kafka로 바꾸는 기준
  - 지난 이벤트를 오래 보관하고 여러 번 다시 읽어야 할 때
  - 이벤트를 읽는 기능이 계속 늘어날 때
  - 처리량이 Redis 메모리로 감당하기 어려울 때
- 바꾸기 쉽게 큐 발행·소비 코드는 한 곳에 모은다

## 5. 데이터 소스

| 소스 | 확보 | 넣는 방식 |
|---|---|---|
| SSAFY NEWS 2025 상반기 | 기존 확보 | 적재 후 발행일 순서로 순차 투입 |
| SSAFY NEWS 2024 상반기 · 하반기 | 2차 교보재 | 적재 후 발행일 순서로 순차 투입 |
| NewsData.io News API (Basic 1개월, 선불) | 2차 교보재 | 수집 배치가 주기적으로 호출 |

세 소스 모두 MVP 범위에 넣는다.
수집 배치는 소스별로 읽는 부분만 다르게 두고, 적재 경로는 하나로 쓴다.
2024~2025 상반기 데이터셋과 실시간 뉴스(2026) 사이에는 기간 공백이 있다.

## 6. 배포

- 쿠버네티스(kubeadm으로 직접 구축) 노드 2대
  - 관리 서버(컨트롤 플레인): AWS EC2 t3.large. 팀 AWS 계정. Terraform으로 생성·삭제
    - Ubuntu 24.04 LTS · gp3 30 GiB(암호화) · IMDSv2 · 탄력적 IP(컨트롤 플레인 주소가 클러스터 인증서에 들어가서) · CPU 크레딧 standard 고정(T3 기본 unlimited는 초과 요금) · 서울 리전. 코드는 `infra/terraform/`
    - 보안 그룹: 22는 관리자 PC 공인 IP(/32)에만. 6443·10250·4240·8472/udp는 Lightsail IP에서만. kubectl은 SSH 터널로 6443에 붙고 6443을 밖에 열지 않는다
    - Lightsail 방화벽도 짝을 맞춰 EC2 IP에서 10250·8472/udp·4240, 인터넷에서 80/443을 연다. SSAFY 지급 서버라 우리가 바꿀 수 있는지는 받은 뒤 확인(8절)
  - 서비스 서버(워커): SSAFY 지급 Lightsail xlarge (4 vCPU, 16 GB). 버스트형이라 계속 쓸 수 있는 CPU는 약 1.6 vCPU(팀 문서 기준)
- 저장소·CI: SSAFY GitLab `lab.ssafy.com/s15-final/S15P31A102`, GitLab Runner(관리 서버에 설치)
  - SSAFY GitLab은 18.11.5다(2026-10-18 API로 확인). 이 프로젝트가 쓸 수 있는 공유 러너가 없어서 CI는 러너를 직접 둬야 돈다
- 인프라 변경: Terraform plan을 사람이 읽고 apply한다. Terraform 대상은 관리 서버 EC2와 예산 알림뿐이다(Lightsail은 SSAFY 소유). 상태 파일은 커밋하지 않는다
  - 자격 증명: plan은 읽기 전용 IAM 사용자 키, apply는 범위를 좁힌 권한(EC2·탄력적 IP·보안 그룹·키 페어·예산)을 따로 둔다. 키는 `~/.aws/credentials`에만 두고 plan이 끝나면 읽기 전용 키를 비활성화한다(`infra/README.md`)
  - IAM Identity Center는 쓰지 않는다. 켜면 AWS Organization이 만들어지면서 무료 플랜 크레딧이 사라진다(2026-10-18 콘솔 안내로 확인)
  - 루트 계정은 결제·비상시에만 쓰고 MFA를 건다. 이 AWS 계정은 개인 계정과 분리한 프로젝트 전용 팀 계정이다
- 배포 흐름: push → Runner가 테스트·Docker 이미지 빌드 → 이미지 저장소에 push → 배포 설정의 이미지 태그 갱신 → Argo CD(클러스터 안)가 Git을 pull해서 반영 → 쿠버네티스 순차 배포(무중단)
  - 운영 이미지는 CI(amd64)에서만 빌드한다. 이미지 태그는 커밋마다 다르게 붙이고 `latest`는 쓰지 않는다
- 되돌리기: Git에서 이전 커밋으로 되돌리면 Argo CD가 이전 버전으로 맞춤
- 배포 설정: Argo CD가 읽는 앱 목록은 `infra/k8s/apps/`(app-of-apps — 이 폴더를 Helm 차트로 그려 앱마다 Application을 만든다). 루트 Application은 부트스트랩 때 한 번 건다(`infra/k8s/bootstrap/root-app.yaml`). Cilium·Argo CD는 Argo CD 밖에서 Helm으로 깐다(`infra/k8s/bootstrap/`)
  - Argo CD는 기본 120초(+최대 60초 지터)마다 Git을 다시 본다(`timeout.reconciliation`). push 직후 반영하려면 웹훅이나 새로고침이 필요하다
- 클러스터 네트워크 Cilium. kube-proxy를 깔지 않고 Cilium의 kube-proxy 대체를 쓴다 — hostPort를 따로 설정 없이 처리해서다. Pod 사이 트래픽은 VXLAN(8472/udp)
  - kubeadm: `kubeadm init --skip-phases=addon/kube-proxy --pod-network-cidr=10.244.0.0/16`. Cilium이 노드마다 받은 Pod 주소 범위를 쓰는 모드(`ipam.mode: kubernetes`)라 Pod 주소 범위를 꼭 준다. 10.244.0.0/16은 kind 기본값과 같고, 서비스 주소(kubeadm 기본 10.96.0.0/12) · EC2 기본 VPC(172.31.0.0/16)와 겹치지 않는다
- 외부 입구는 Envoy Gateway — 클라우드 로드밸런서가 없어 LoadBalancer Service가 외부 주소를 못 받으므로 워커 노드의 80/443으로 노출한다(아래 「외부 입구 — hostPort」)
- 도메인: `newlearn.io.kr` (가비아). 공개 범위는 Q17
- 운영 기간: 최종 발표(2026-11-18) 후 서버 종료
- 비용 (SSAFY 공지 · 교보재 승인)
  - 승인 금액: EC2 t3.large 1대 $92.27(129,178원), 후불. 10/19~11/18 31일 기준, EBS·공인 IPv4 포함. 넘는 금액은 교육생 부담
  - 10월 사용분은 11월 초 결제. 결제 내역·영수증·인보이스 제출 필수. 빌링 알람 필수
  - 예산 알림은 10/1부터 쌓인 비용 합계를 승인 금액에 대 본다. 크레딧을 빼기 전 금액으로 잰다(`infra/terraform/budget.tf`)
  - 무료 플랜 크레딧 $100은 초과 대비 여유분으로 남긴다. 무료 플랜에서는 t3.large를 못 띄울 수 있어 2026-10-18 콘솔 Upgrade plan으로 유료 플랜으로 올렸다(크레딧은 남는다)
  - 11/18 뒤 `terraform destroy`로 지운다. 서버를 멈추기만 하면 EBS·탄력적 IP 요금이 계속 나간다

### 클러스터 구성

- 서비스 Pod는 전부 워커에서 돈다. 네임스페이스: ai, ingress·web, app, data·batch, monitoring(Prometheus·Grafana), argocd (+kube-system)
- 워커가 1대라 nodeSelector로 나누지 않고 resources requests·limits로 자원을 나눈다
- 한계: 워커 노드 자체가 죽으면 자동 복구가 안 된다. 자동 재시작은 컨테이너 단위 장애까지다

### 외부 입구 — hostPort

- Envoy Pod를 워커 노드의 80에 hostPort로 연다. Envoy Gateway는 권한 없이 뜨려고 80 리스너를 컨테이너 10080으로 옮겨 여는데, 그 포트에 hostPort 80을 붙인다(`infra/k8s/gateway/envoyproxy.yaml`). Envoy의 Service는 ClusterIP로 둔다
- kind 리허설로 확인했다(2026-10-18, Jira S15P31A102-77) — 이 PC → kind 워커 80 → Envoy → hello 앱 응답
- 한계: 워커가 1대라 80을 잡은 Envoy Pod가 둘일 수 없다. 기본 교체 전략(새 Pod 먼저)이면 새 Pod가 「free ports」 부족으로 Pending에 멈춘다 → 교체 전략을 maxSurge 0 · maxUnavailable 1(옛 Pod 먼저 내리기)로 둔다. 그래서 Envoy를 바꿀 때(Envoy Gateway 업그레이드 · EnvoyProxy 변경) 잠깐 끊긴다(잰 시간은 10절). 앱 배포는 Envoy를 재시작하지 않아 해당하지 않는다
- 443은 HTTPS 인증서 방식을 정한 뒤 같은 방식(컨테이너 10443)으로 더한다

### kubeadm을 고른 이유

| 후보 | 안 쓴 이유 |
|---|---|
| EKS(관리형) | SSAFY 서버(Lightsail)가 우리 AWS 계정 밖이라 노드로 붙일 수 없고, 클러스터 요금이 따로 붙는다 |
| Docker Compose | 자원 상한·재시작은 되지만 CronJob(수집 배치), liveness probe 재시작, 순차 배포(무중단), 메모리 부족 시 우선순위 축출이 없고 Argo CD를 못 쓴다 |
| k3s | ServiceLB·local-path가 기본으로 들어 있어 편하지만, Cilium·Envoy Gateway로 바꾸면 기본 포함분을 대부분 꺼야 한다. 그래서 표준 구성인 kubeadm |

### 저장소·백업

- kubeadm에는 기본 StorageClass가 없다 → local-path-provisioner를 설치한다
- PostgreSQL 백업은 pg_dump CronJob. 같은 서버 안에만 두면 서버를 잃을 때 같이 사라진다 — 서버 밖 보관은 8절

### 무중단 배포 조건

- Deployment 기본값 RollingUpdate. Pod가 1개여도 maxSurge 올림·maxUnavailable 내림이라 새 Pod가 먼저 뜬다
- readiness probe 필수
- 끝낼 때 preStop으로 잠깐 기다려 Envoy가 그 Pod를 목록에서 뺄 시간을 준다. kind 리허설에서 preStop 10초로 확인했고, 빼면 요청이 실패했다(10절)
- Spring graceful shutdown(기본 켜짐)
- 배포 중에는 구버전·신버전이 같이 돈다 → DB 변경은 하위 호환으로
- 배포 순간 Pod 1개 분량의 메모리 여유를 남긴다

### 관리 서버 주의 — containerd

- 관리 서버에 Runner용 Docker를 깔면 kubelet과 containerd를 같이 쓴다. 패키지로 깐 containerd는 CRI 플러그인이 꺼져 있을 수 있다 → `/etc/containerd/config.toml`의 `disabled_plugins`에서 `cri`를 빼고, cgroup 드라이버를 systemd로 맞춘다

### 현재 상태

- EC2: 카드 등록 완료, 서버 미생성. 서버 시작 예정 10/19(승인 금액 산정 기준). Terraform 코드는 plan까지 확인(Jira S15P31A102-76)
- Lightsail: 미수령 (pem 키로 받을 예정)
- kind 리허설(내 PC): 노드 2개에 Cilium · Argo CD · Envoy Gateway · hello 앱을 GitOps로 올려 무중단 교체 · 되돌리기를 확인했다(Jira S15P31A102-77, `infra/README.md` 「kind 리허설」). Argo CD는 GitLab 대신 로컬 Git 미러를 읽었다
- 도메인: 구매 완료, DNS 레코드 미설정 (서비스 서버 IP를 받은 뒤 연결)

## 7. 개발 환경

서버 없이 각자 컴퓨터에서 Docker Desktop만으로 개발한다.

- `docker compose` 기본 실행: PostgreSQL(pgvector), Redis만. 백엔드 개발자는 IDE에서 앱 실행
- `full` 프로필: 화면·API·워커까지 전부 컨테이너로 실행. 각 언어 런타임을 따로 설치하지 않아도 된다
- 코드는 이미지에 굽지 않고 폴더를 연결해 수정 즉시 반영
- 의존성·빌드 산출물(node_modules·가상환경·Gradle 캐시)은 볼륨에 둔다. 운영체제마다 다른 node_modules가 섞이지 않고, 컨테이너가 내 폴더에 root 소유 파일을 만들지 않는다
- GMS 키 없이도 개발할 수 있게 모의 응답 모드(`LLM_MODE=mock`이 기본)
- 환경변수는 저장소 루트 `.env` 하나다. compose와 IDE에서 띄운 API·워커가 같은 파일을 읽어서 DB 접속 정보를 손으로 맞출 일이 없다. 그래서 값을 만드는 스크립트를 두지 않는다 — 로컬 DB 비밀번호는 이 컴퓨터(127.0.0.1)에만 열린 컨테이너 전용 값이고, 진짜 비밀값인 GMS 키는 각자 받는다
- Windows는 저장소를 WSL2 리눅스 파일 시스템 안에 클론한다 (C: 드라이브 폴더를 연결하면 파일 변경이 컨테이너에 안 닿는다)
- amd64·arm64를 모두 지원하는 이미지만 쓴다. 운영 이미지는 CI에서만 빌드한다
- 쓰는 법과 막히는 곳은 `docs/dev-environment.md`

## 8. 못 정한 것

| 항목 | 누가 | 관련 |
|---|---|---|
| 뉴스 수집 배치 구현 언어 · 기사를 적재하는 길(DB 에 바로 넣나, API 를 거치나). 투입은 API 를 거치자는 제안이 있다 | BE · Infra | `docs/api.md` 4절 B1 |
| 이미지 저장소 — SSAFY GitLab의 Container Registry 화면이 404라 쓸 수 없어 보인다(2026-10-18). 후보: AWS ECR · Docker Hub · 클러스터 안 레지스트리 | Infra | 6절 |
| HTTPS 인증서 발급 방식 | Infra | — |
| NewsData.io 구독 시작 날짜 | 팀 | 5절 |
| 임베딩 모델 — 정해지면 기사 임베딩 벡터의 차원도 정해진다 | AI | 3절, `docs/data-model.md` |
| 마인드맵 렌더링 라이브러리 | FE | — |
| 배포를 어느 브랜치 머지에서 할지 · 이미지 태그 형식(커밋마다 다르게, `latest` 금지는 정함) | Infra | 6절 |
| AI 평가셋 위치 · 회귀 기준 | AI | 3절, Jira S15P31A102-33 |
| GMS가 OpenAI 호환 API를 그대로 받는지 (워커의 `LLM_MODE=gms` 코드는 그렇다고 보고 짰다) | AI | 3절 |
| Java 린트 도구 (지금은 Spotless 포맷 검사만 한다) | BE | `.claude/stack.md` 3절 |
| API 인증을 둘지, 둔다면 어떻게 할지 (지금은 Spring Security 기본값이라 헬스 말고는 막혀 있다). 워커 · 배치가 부르는 내부 API(`/internal/v1`)를 어떻게 막을지, 로그인 없는 URL 분석 요청이 GMS 예산을 쓰지 않게 요청 수를 얼마로 막을지도 여기서 정한다 | BE | `docs/api.md` 1절 |
| Terraform 상태 파일을 둘 곳 (apply 전에 정한다. 후보: GitLab 관리형 상태 · S3) | Infra | 6절 |
| Lightsail(SSAFY 지급) 방화벽을 우리가 바꿀 수 있는지 — 못 바꾸면 EC2와 노드 사이 포트(10250·8472/udp·4240)가 막힌다. Lightsail 받는 날 첫 확인 | Infra | 6절 |
| 쿠버네티스 Secret을 만들고 관리하는 방식 — Argo CD가 GitLab을 읽을 자격 증명(배포 토큰)도 여기에 걸린다. kind 리허설은 로컬 Git 미러를 써서 확인하지 못했다 | Infra | 6절 |
| 실제 서버에서 hostPort 80이 Lightsail 공인 IP로 열리는지 (kind에서는 확인, Lightsail 방화벽 권한과 같이 본다) | Infra | 6절 |
| 노드 사이 Pod 트래픽 암호화 — EC2와 Lightsail이 인터넷을 거쳐 붙어서 VXLAN(8472/udp)이 암호화 없이 인터넷을 지난다. Cilium WireGuard(51871/udp)를 쓸지, 쓰면 보안 그룹 · Lightsail 방화벽에 포트를 더한다 | Infra | 6절 |
| PostgreSQL 백업(pg_dump)을 서버 밖에 둘지 | Infra · BE | 6절 |
| API 공통 규칙 v0(응답 · 오류 형식 · 식별자 · 시간 · 목록) 합의 — 제안을 FE · AI 가 확인하기 전이다 | BE · FE · AI | `docs/api.md` 1절, Jira S15P31A102-28 |
| 워커 → API 결과 전달 방식(HTTP 내부 API · 결과용 스트림)과 작업 큐의 스트림 · consumer group 구성 | AI · BE | 2절 6번 · 4절, `docs/api.md` 4절 |
| 이슈를 만들고 사건을 이슈에 붙이는 길 — 사람이 고르는지 AI 가 만드는지, 이름은 누가 붙이는지(Q5), 사건 하나가 여러 이슈에 속할 수 있는지 | 팀 | `docs/data-model.md` 5절 |
| 한 기사가 여러 사건에 속할 수 있는지 (PRD FR-9) | AI · BE | `docs/data-model.md` 5절 |
| 회원 · 북마크 · 관심 이슈를 MVP 에 넣을지 — Jira 28 · 62~64 는 만들게 돼 있고 MVP 개요 9절 · PRD 4.7 은 MVP 이후로 둔다 | PM · 팀 | `docs/data-model.md` 5절 |
| 지원 URL 기사 본문을 누가 가져오는지 (API · 워커 · 수집 배치) | BE · AI | `docs/data-model.md` 5절 |

정해지면 그 사실이 들어갈 절에 적고 이 표에서 지운다.

## 9. 뒤집은 것

정했던 것을 바꾸면 한 줄로 남긴다. 다음 사람이 옛 결정을 보고 되돌리지 않게 하려는 것이다.

| 날짜 | 무엇을 | 왜 |
|---|---|---|
| — | 아직 없음 | — |

## 10. 잰 것

짐작이 아니라 실제로 잰 숫자만 적는다. 어떻게 쟀는지를 같이 적는다.

| 날짜 | 무엇을 | 숫자 | 어떻게 |
|---|---|---|---|
| 2026-10-18 | 새 클론에서 `full` 프로필이 모두 healthy가 되기까지 | 174초 | WSL2 Ubuntu 홈에 작업 트리를 복사하고 compose 볼륨을 비운 뒤 `docker compose --profile full up -d --wait`. 이미지(약 1.9 GB)는 미리 받아 둔 상태라 받는 시간은 빠졌다 |
| 2026-10-18 | 같은 환경을 내렸다가 다시 띄우기 (볼륨 남김) | 28초 | `down` 뒤 `up -d --wait` |
| 2026-10-18 | 고친 코드가 컨테이너에 반영되기까지 | WSL2 클론: 화면 2초·워커 4초·API 6초 안. C: 드라이브 클론: 셋 다 60초 안에 반영 안 됨 | 파일을 고치고 2초 간격으로 응답·로그를 확인 |
| 2026-10-18 | 호스트 테스트 시간 (두 번째 실행) | API 16초·화면 4초·워커 5초 | Windows 호스트에서 각 영역 테스트 명령(`.claude/stack.md` 3절). API는 Testcontainers로 DB·Redis를 띄우는 시간 포함 |
| 2026-10-18 | kind 리허설 클러스터를 처음 올릴 때 이미지 받는 시간 | 노드 이미지(1.32 GB) 약 12분, Cilium 에이전트 Running까지 약 18분, Argo CD 이미지 5분 48초 | 이 PC(Docker Desktop)에서 `bash infra/kind/up.sh`. kind 노드는 각자 이미지를 받는다. 노드당 수신 속도 약 0.25 MB/s(`docker stats`) |
| 2026-10-18 | 이미지를 받아 둔 뒤 `up.sh` 다시 실행 (앱 4개 Synced · Healthy, hello 응답까지) | 26~36초 | 클러스터가 있는 상태에서 다시 실행. 스크립트 끝의 「걸린 시간」 |
| 2026-10-18~19 | hello v1→v2 반영 · `git revert` 되돌리기 중 요청 실패 | 3회 모두 실패 0 (요청 141 · 140 · 161번). 반영 12 · 11 · 12초, 되돌리기 10 · 12 · 12초 | `bash infra/kind/rehearse-rollout.sh`. curl을 쉬지 않고 보냄(초당 약 6번). 시간은 Git push부터 응답이 모두 바뀌고 rollout이 끝날 때까지. Argo CD에 새로고침을 직접 걸었다(기본 120초 주기를 기다리지 않음) |
| 2026-10-18 | 같은 리허설에서 preStop을 뺐을 때 | 요청 131번 중 2번 실패 (Envoy `upstream connect error` — 503 · 연결 실패) | 로컬 Git 미러에서만 preStop을 빼고 같은 스크립트를 1회 |
| 2026-10-18 | Envoy Pod 교체 (워커 80 hostPort) | 기본 전략: 새 Pod Pending, 67초 지나도 교체 안 끝남(실패 0 — 옛 Pod가 받음). maxSurge 0 · maxUnavailable 1: 끊김 약 1.6초(요청 4번 실패), 교체 완료 23 · 28초 | 요청을 보내며 `kubectl rollout restart`와 전략 변경 반영. 끊김은 첫 실패부터 마지막 실패까지 |
| 2026-10-18 | kind 노드 메모리 (앱 4개가 Synced · Healthy일 때) | 컨트롤 플레인 1.69 GiB · 워커 1.59 GiB | `docker stats --no-stream` |
| 2026-10-18 | sentence-transformers 6.1.0이 Python 3.14.8·torch 2.14.1 CPU에서 임베딩 | 384차원. 비슷한 두 문장 유사도 0.976, 다른 문장 0.359 | 워커 컨테이너에서 시험용 모델(all-MiniLM-L6-v2)로 세 문장을 임베딩. 쓸 모델은 8절 |
