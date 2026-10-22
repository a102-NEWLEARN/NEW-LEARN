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
| 캐시 · 작업 큐 | Redis (Streams, AOF 저장) | 조회 캐시, 분석 작업 큐, 로그인 세션 |
| 뉴스 수집 배치 | 운영 시 쿠버네티스 CronJob (구현 언어 미정) | NewsData.io 수집(하루 두 번 00 · 12시), 데이터셋 적재(검증용) |
| 외부 입구 | Envoy Gateway | HTTPS 요청을 화면·API로 분배 |
| 모니터링 | Prometheus, Grafana | 지표 수집, 대시보드 |

언어·프레임워크 버전은 2026-10-18에 현재 안정 버전을 확인해 정했다. 목록은 `.claude/stack.md` 2절, 정확한 값은 각 영역의 매니페스트(`package.json`·`build.gradle`·`pyproject.toml`)와 `compose.yaml`의 이미지 태그다.

- Python 3.14: sentence-transformers 6.1은 공식 지원을 3.13까지만 적었다. 3.14.8에서 실제 임베딩이 도는 것을 확인했고(10절), 문제가 생기면 3.13으로 내린다
- torch는 CPU 판만 받는다. GPU 서버가 없다(3절)

## 2. 데이터 흐름

1. 사용자 → Gateway → React(화면) / Spring Boot(API)
2. Spring Boot ↔ PostgreSQL 저장·조회
3. 수집 배치(CronJob, 하루 두 번 00 · 12시 `Asia/Seoul`)가 NewsData.io 기사를 PostgreSQL에 적재하고 투입한다 (F01, 2026-10-20). SSAFY 데이터셋은 학습 · 검증용이다(5절)
4. 새 기사에 대해 분석 작업을 Redis 작업 큐에 등록
5. AI 분석 워커가 작업을 가져가 분석 단계를 수행 (3절)
6. 워커가 결과를 Spring Boot에 전달해 저장

## 3. 분석 파이프라인

> 이 절은 전부 초안이다. AI 담당(강유진, 황도경) 확인 필요.

분석은 단계별로 나눠, 범위가 바뀌어도 단계를 켜고 끄는 것으로 대응한다.

| 단계 | MVP 개요 기능 | 무엇으로 | 상태 |
|---|---|---|---|
| 핵심 정보 추출 — 가지 4개(핵심 내용 · 원인·배경 · 반응 · 전망) | F03 → F04(흐름지도 · 마인드맵) | GMS. 출력 모양은 `docs/api-screen.md` 3절. 근거 문장은 데이터로만 남긴다(F05 화면 표시는 추후, 2026-10-21) | 켬 |
| 같은 사건 후보 찾기 | F06 | 임베딩(sentence-transformers, CPU) + pgvector, 후보 최대 5개 | 켬 |
| 동일 사건 판정 | F06 → F07(이슈맵) | GMS. 새 사건이면 이름 · 키워드 · 요약도 짓는다. 판단 기준은 Q34 | 켬 |
| 이슈 판단 — 새 사건을 이슈에 붙이거나, 사건 3개 이상으로 새 이슈를 만들고 이름 · 요약을 짓는다 | F07 | GMS. 단계 모양은 `docs/api-internal.md`(제안). 어떤 사건을 묶을지는 실험 | 켬(제안) |
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
| SSAFY NEWS 2025 상반기 | 기존 확보 | 학습 · 검증용. 서비스 DB 에 넣을지는 미정(`docs/data-model.md` 5절) |
| SSAFY NEWS 2024 상반기 · 하반기 | 2차 교보재 | 위와 같음 |
| NewsData.io News API (Basic 1개월, 선불) | 2차 교보재 | 실서비스 화면의 기사. 수집 배치(k8s CronJob)가 하루 두 번(00 · 12시 `Asia/Seoul`) 호출 |
| 국립국어원 표준국어대사전 Open API | 인증 키 신청 필요 | 용어사전(A19) 요청 때 API 서버가 대신 부른다. 하루 한도 · 결과 저장 · 출처 표시 조건은 키 신청 때 약관으로 확인 |

데이터셋은 학습 · 검증에, NewsData 는 서비스 화면에 쓴다(2026-10-20 팀 회의).
수집 배치는 소스별로 읽는 부분만 다르게 두고, 적재 경로는 하나로 쓴다.
2024~2025 상반기 데이터셋과 실시간 뉴스(2026) 사이에는 기간 공백이 있다.

## 6. 배포

- 쿠버네티스(kubeadm으로 직접 구축) 노드 2대
  - 관리 서버(컨트롤 플레인): AWS EC2 t3.large. 팀 AWS 계정. Terraform으로 생성·삭제
    - Ubuntu 24.04 LTS · gp3 30 GiB(암호화) · IMDSv2 · 탄력적 IP(컨트롤 플레인 주소가 클러스터 인증서에 들어가서) · CPU 크레딧 standard 고정(T3 기본 unlimited는 초과 요금) · 서울 리전. 코드는 `infra/terraform/`
    - 보안 그룹: 22는 관리자 PC 공인 IP(/32)에만. Lightsail 공인 IP에서 오는 WireGuard 51820/udp 하나만 더 연다. 쿠버네티스 포트(6443·10250·Cilium)는 WireGuard 터널 안으로만 다녀서 밖에 열지 않는다(아래 「노드 사이 — 호스트 WireGuard」). kubectl은 SSH 터널로 6443에 붙는다
    - Lightsail 방화벽은 들어오는 것만 막고 나가는 것은 모두 허용한다(AWS 문서). WireGuard는 Lightsail이 먼저 연결하므로 Lightsail 쪽에 노드 포트를 열 일이 없다. 인터넷에서 80/443만 들어오면 된다. 2026-10-22 받은 날 확인: 돌아오는 WireGuard UDP가 지나가고, SSAFY 쪽 방화벽에서 80 · 443이 열려 있다(아래 「현재 상태」). 서버 안 방화벽(ufw)은 지급 때 22만 열려 있다
  - 서비스 서버(워커): SSAFY 지급 Lightsail xlarge (4 vCPU, 16 GB). 버스트형이라 계속 쓸 수 있는 CPU는 약 1.6 vCPU(팀 문서 기준)
- 저장소·CI: SSAFY GitLab `lab.ssafy.com/s15-final/S15P31A102`, GitLab Runner(관리 서버의 클러스터 안 Pod — Kubernetes executor)
  - SSAFY GitLab은 Community Edition 18.11.5다(2026-10-18 API, 2026-10-20 Help 화면으로 확인). 이 프로젝트가 쓸 수 있는 공유 러너가 없어서(인스턴스 · 그룹 러너 0개) CI는 러너를 직접 둬야 돈다
  - 러너는 서버에 Docker를 깔지 않고 Pod로 띄운다 — Docker를 깔면 kubelet과 containerd를 같이 쓰고, Docker의 iptables 규칙이 Cilium(호스트 라우팅 Legacy · iptables 마스커레이드)과 같은 표를 만진다. 잡도 잡마다 Pod로 떴다 사라진다(2026-10-20 결정, Jira S15P31A102-89)
  - 러너 · 잡 Pod 모두 관리 서버에만 둔다(control-plane taint를 견디고 그 노드를 고른다). 한 번에 잡 1개, 잡 CPU 요청 500m · 상한 1, 메모리 1Gi · 2Gi — 잡이 바빠도 1 vCPU는 apiserver · etcd 몫으로 남는다. 실제 CI 잡 시간을 재서 조정한다(Jira S15P31A102-92). 값은 `infra/k8s/bootstrap/gitlab-runner-values.yaml`, 까는 법은 `infra/server/README.md` 「GitLab Runner」
  - 러너 판은 GitLab과 major.minor를 맞춘다 — 차트 0.88.4(러너 18.11.4). 토큰은 저장소에 두지 않고 서버의 Secret(`gitlab-runner-token`)에만 있다
  - CPU를 오래 쓰면 EC2 CPU 크레딧(t3.large 시간당 36 적립, 최대 864)이 준다. standard라 다 쓰면 노드 전체가 기준선(vCPU당 30%)으로 묶인다. 잔액은 EC2 콘솔 Monitoring 탭에서 본다(apply 키에는 CloudWatch 권한이 없다)
- CI 파이프라인: `.gitlab-ci.yml`(2026-10-20, Jira S15P31A102-92). MR과 dev push에서 돈다. 계획은 `docs/plans/2026-10-20-ci-pipeline.md`
  - 잡을 「무엇에 막히나」로 나눈 갈래로 둔다 — w0 규칙(시크릿 스캔 · MR 규칙 · 하네스 자체 검사) → w12 영역 검사(frontend · ai · infra) · w3 backend(DB · Redis가 필요한 테스트). 영역 잡은 `pre-commit --ci <영역>`으로 `.claude/stack.md` 3절 명령을 그대로 돈다. MR은 바뀐 영역만, dev는 전부 돈다. 하네스 자체 검사는 `.claude/`가 바뀔 때와 dev에서만
  - 영역마다 잡 하나다(하네스 껍데기는 fast · slow 두 잡). 러너 자리가 1개라 두 잡이면 Pod와 설치가 두 번 돈다
  - 갈래마다 CPU · 메모리 요청을 따로 준다 — w0 100m, w12 250m, w3 300m + 서비스 각 100m, CPU 상한은 모두 1 이하. 러너 값의 덮어쓰기 상한이 기본값(요청 500m · 상한 1 · 메모리 2Gi)과 같아서 잡은 줄이기만 한다. 잡 Pod에 이름표 `newlearn.io/workload`(w0 · w12 · w3)를 붙인다
  - 백엔드 테스트는 로컬에서는 Testcontainers로 DB · Redis를 띄우고, CI는 잡 Pod에 Docker가 없어서 services로 잡 옆에 띄운 DB · Redis에 붙는다(`NEWLEARN_TEST_TESTCONTAINERS=false`). 이미지는 compose와 같은 태그
  - 캐시: 잡 Pod마다 관리 서버 디스크 폴더(`/var/lib/newlearn/ci-cache`, `infra/k8s/bootstrap/ci-cache-pv.yaml`)를 `/ci-cache`로 붙이고 npm · uv · Gradle이 캐시 폴더로 바로 쓴다. GitLab `cache:`는 잡마다 다시 압축해 캐시 없음보다 느렸다(10절). infra는 캐시를 쓰면 더 느려 뺐다
    - 모든 브랜치가 같은 캐시를 쓴다. npm · uv는 잠금 파일의 해시로 내용을 검사하지만 Gradle은 검사하지 않는다 — 같은 팀 저장소라 받아들였다(2026-10-20)
  - 노트북 러너: 인프라 담당 노트북의 Docker Desktop 안에 러너를 컨테이너로 둔다(`infra/laptop-runner/`, 2026-10-20 사용자 허락). 켜져 있을 때만 EC2 러너에 더해지는 「큰 러너」다 — 잡 하나 CPU 4 · 메모리 4g, 동시 2, 잡 시간 상한 20분. 노트북이 꺼져도 CI 는 EC2 만으로 돈다
    - 권한 없는 컨테이너, 호스트 폴더를 잡에 붙이지 않음, Docker 엔진 연결은 러너 컨테이너에만. 잡마다 네트워크를 만든다(`FF_NETWORK_PER_BUILD`) — Docker 29 는 예전 컨테이너 연결을 만들지 않아 services 별칭이 안 풀렸다. 캐시는 노트북 Docker 볼륨에 따로 쌓인다. 어느 러너가 잡을 받을지는 고를 수 없다(먼저 비는 쪽)
  - 시간 목표(여신보좌관 실측보다 짧게): MR 파이프라인 중앙값 5분 · p90 10분, 기다림 p90 2분, backend 잡 중앙값 7분
  - 머지 막기(Pipelines must succeed)는 아직 켜지 않았다. 며칠 돌려 본 뒤 인프라 담당이 정한다
  - w4 운영 이미지 굽기(Jira S15P31A102-96) — 저장소 · 태그 · 굽는 때는 아래 「배포 흐름」
- 모니터링: kube-prometheus-stack 92.10.1(Prometheus · Grafana · node-exporter · kube-state-metrics)을 관리 서버에 둔다(2026-10-20, Jira S15P31A102-95). Lightsail을 기다리지 않고 CI 병목을 CI 파이프라인(92) 전부터 재려는 것이다. 값은 `infra/k8s/bootstrap/monitoring-values.yaml`, 까는 법은 `infra/server/README.md` 「모니터링」
  - 무엇을 보나: 노드 CPU · 메모리, Pod CPU · 스로틀(cAdvisor — `container_cpu_cfs_throttled_periods_total`, `…_throttled_seconds_total`은 차트 기본값이 버린다), GitLab Runner 지표(기다림 · 자리 사용률), 잡마다 기다림 · 걸린 시간 · 받은 러너(아래 「CI 잡 지표」)
  - CI 잡 지표(2026-10-21, Jira S15P31A102-98): gitlab-ci-pipelines-exporter v0.6.0 한 대가 GitLab API를 60초마다 읽어 잡마다 기다림(`queued_duration`) · 걸린 시간 · 러너 · JUnit 스위트 시간을 지표로 바꾼다. Grafana 대시보드 「CI 병목」에 갈래별 잡 시간 · 러너별 잡 수와 기다림 · 노드 CPU · 잡 Pod 스로틀을 모은다. 값은 `infra/k8s/bootstrap/ci-exporter/`, 까는 법은 `infra/server/README.md` 「모니터링」 6번
    - 읽는 범위는 이 프로젝트의 dev와 열린 MR뿐이다. 머지된 MR까지 읽으니 exporter가 주기마다 프로젝트 전체 잡 목록을 넘겨 가며 다시 찾아 SSAFY GitLab에 초당 1회(설정한 상한)를 붙였다(10절). 머지된 MR의 값은 열려 있는 동안 Prometheus에 남는다
    - 한계: ref(MR · 브랜치)마다 가장 최근 잡의 값만 낸다 — 지난 값은 Prometheus 시계열에만 있다. GitLab API는 `ref=dev`로 물으면 dev에서 연 MR(분야 브랜치 반영)의 파이프라인도 돌려줘서, 반영 MR을 dev push 직후 열면 exporter의 dev 값이 그 MR 파이프라인으로 덮인다
    - 토큰은 프로젝트 액세스 토큰(Reporter · `read_api`, 만료 2026-11-30)이다. 사람이 서버에서 Secret `gitlab-ci-exporter`에 넣고 저장소에는 없다. `lab.ssafy.com/-/health`가 밖에서 404라 exporter의 GitLab 헬스 검사는 끈다
    - 공식 Helm 차트는 쓰지 않고 매니페스트(kustomize)로 둔다 — 차트(0.3.5)는 앱이 v0.5.10에 멈춰 있고 Bitnami Redis를 기본으로 켠다. 수집할 때 exporter Pod 이름 · 주소 이름표는 버린다(Pod가 다시 뜰 때 같은 잡이 두 번 세지지 않게)
    - 잡 Pod의 갈래 이름표(`newlearn.io/workload`)와 러너가 붙이는 잡 주석(`job.runner.gitlab.com/id` · `name` · `ref`)을 kube-state-metrics에 허용해 스로틀을 잡 이름으로 본다. 노트북 러너의 잡은 클러스터 밖이라 CPU · 스로틀은 EC2 잡만 보인다
  - CPU 예약을 작게 잡는다(모니터링 합 약 200m, exporter 10m 포함) — 노드 예약이 1200m라 CI 잡(550m)이 들어갈 자리가 남는다. Alertmanager는 끈다(알림 받을 곳이 정해지면). kubeadm은 etcd · controller-manager · scheduler를 127.0.0.1에만 열고 kube-proxy는 없어서(Cilium 대체) 그 수집과 규칙은 끈다
  - Prometheus 데이터는 관리 서버 디스크의 정적 PV(`/var/lib/newlearn/prometheus`, 10Gi, 15일 · 8GB 보존)에 둔다 — Pod를 다시 띄워도 남는다. 프로비저너 없이 이름표용 StorageClass(`kubernetes.io/no-provisioner`)만 둔다(Prometheus Operator는 StorageClass가 실제로 있어야 한다)
  - Grafana: 아이디 · 비밀번호 로그인. 계정은 사람이 서버에서 만든 Secret(`grafana-admin`)에서 읽는다. 가입 · 익명 보기는 끈다. 대시보드는 설정으로 그리고 Grafana 자체 디스크는 두지 않는다(다시 뜨면 로그인을 새로 한다)
  - 여는 길: 지금은 SSH 터널로 `http://localhost:3000/grafana/`. 공개 주소 `newlearn.io.kr/grafana`는 Lightsail · 정문 · HTTPS(Jira 90 · 91 · 93) 뒤에 연다 — 그때 Grafana `root_url`을 바꾼다. Prometheus는 로그인이 없어 공개하지 않는다. Swagger도 공개할 때 브라우저 팝업(HTTP 기본 인증)으로 아이디 · 비밀번호를 묻는다(2026-10-20 결정, 구현은 93 · BE)
  - CloudWatch는 쓰지 않는다(API 호출 요금). CPU 크레딧 잔액은 EC2 콘솔에서 본다
- 인프라 변경: Terraform plan을 사람이 읽고 apply한다. Terraform 대상은 관리 서버 EC2와 예산 알림뿐이다(Lightsail은 SSAFY 소유)
  - 상태 파일: 팀 계정 S3 버킷(버전 관리 · 퍼블릭 차단)에 두고 S3 잠금 파일로 동시 실행을 막는다(`use_lockfile`, DynamoDB 없이). 버킷 이름은 저장소에 적지 않는다(`infra/terraform/backend.hcl.example`). PC를 반납 · 분실해도 11/18 destroy를 할 수 있게 하려는 것이다(2026-10-20 결정)
  - 자격 증명: plan · apply 모두 범위를 좁힌 apply 전용 IAM 사용자 키로 한다 — EC2는 서울 리전만, 예산, 상태 버킷만(`infra/terraform/iam/apply-policy.json`). S3 잠금 때문에 plan도 쓰기가 필요해서, 10/18의 읽기 전용 키는 비활성화한다. 키는 `~/.aws/credentials`에만 둔다(`infra/README.md`)
  - IAM Identity Center는 쓰지 않는다. 켜면 AWS Organization이 만들어지면서 무료 플랜 크레딧이 사라진다(2026-10-18 콘솔 안내로 확인)
  - 루트 계정은 결제·비상시에만 쓰고 MFA를 건다. 이 AWS 계정은 개인 계정과 분리한 프로젝트 전용 팀 계정이다
- 배포 흐름: push → Runner가 테스트·Docker 이미지 빌드 → 이미지 저장소에 push → 배포 설정의 이미지 태그 갱신 → Argo CD(클러스터 안)가 Git을 pull해서 반영 → 쿠버네티스 순차 배포(무중단)
  - 운영 이미지는 CI(amd64)에서만 빌드한다. 이미지 태그는 커밋마다 다르게 붙이고 `latest`는 쓰지 않는다
  - 이미지 저장소: GHCR(ghcr.io), 인프라 담당 개인 GitHub 계정 아래 비공개 패키지 `newlearn-backend` · `newlearn-frontend` · `newlearn-ai`(2026-10-21, Jira S15P31A102-96). SSAFY GitLab 레지스트리는 서버 설정에서 꺼져 있어(`/jwt/auth?service=container_registry` → `registry not enabled`, 프로젝트 설정에 스위치 없음) 프로젝트에서 켤 수 없다. 비용 0 · 비공개 · 두 러너 모두 넣을 수 있는 곳이 GHCR 뿐이었다 — 후보 비교는 `docs/plans/2026-10-21-image-build.md`. 토큰 · 정리는 `infra/README.md` 「이미지 저장소」
  - 굽는 때 · 태그: dev push 파이프라인에서 그 영역 폴더나 `.gitlab-ci.yml`이 바뀌면 굽고 올린다(w4 잡). 태그는 커밋 짧은 SHA 8자(`CI_COMMIT_SHORT_SHA`). MR은 Dockerfile이 바뀔 때 올리지 않고 굽기만 한다. dev 머지 뒤 사이트에 바로 반영할지 사람이 버튼을 누를지는 Jira S15P31A102-91에서 정한다
  - 굽는 도구: Kaniko 후속판(osscontainertools, digest 고정) — Docker 데몬 · 특권 없이 잡 컨테이너 안에서 Dockerfile을 돈다. BuildKit rootless는 두 러너의 보안 설정(seccomp · AppArmor · user namespace)을 풀어야 해서 뺐다. 두 러너 모두 설정을 바꾸지 않고 세 이미지를 굽는 것을 확인했다(MR !60, 10절)
    - EC2 잡 메모리 상한(2Gi)에서는 `--use-new-run` · `--compressed-caching=false`를 줘야 ai(가상환경 약 1 GB)가 굽힌다. 없으면 의존성 설치 뒤 스냅샷에서 OOMKilled(두 번 재현). 옵션을 줘도 최대 메모리가 상한에 닿는다(디스크 캐시 포함) — 의존성이 크게 늘면 다시 잰다
    - Kaniko는 잡 컨테이너의 파일을 최종 이미지로 바꿔 놓아 EC2 러너에서는 after_script가 실패한다. 굽기 잡은 CPU · 메모리 기록을 script 끝에서 찍는다
  - Dockerfile은 영역 폴더마다 하나(`backend/` · `frontend/` · `ai/`). 베이스 이미지는 digest로 고정하고 root가 아닌 사용자로 돈다
  - 토큰: GitLab CI 변수 `GHCR_USER` · `GHCR_TOKEN`(보호 · 가림) — 보호 브랜치(dev) 파이프라인에만 들어간다. classic 토큰이라 개인 계정의 모든 패키지에 권한이 걸려서 `write:packages` · `read:packages`만, 만료 2026-11-30. 워커가 받을 읽기 토큰은 Jira S15P31A102-91(Sealed Secret)
- 되돌리기: Git에서 이전 커밋으로 되돌리면 Argo CD가 이전 버전으로 맞춤
- 배포 설정: Argo CD가 읽는 앱 목록은 `infra/k8s/apps/`(app-of-apps — 이 폴더를 Helm 차트로 그려 앱마다 Application을 만든다). 루트 Application은 부트스트랩 때 한 번 건다(`infra/k8s/bootstrap/root-app.yaml`). Cilium·Argo CD는 Argo CD 밖에서 Helm으로 깐다(`infra/k8s/bootstrap/`)
  - Argo CD는 기본 120초(+최대 60초 지터)마다 Git을 다시 본다(`timeout.reconciliation`). push 직후 반영하려면 웹훅이나 새로고침이 필요하다
- 클러스터 네트워크 Cilium. kube-proxy를 깔지 않고 Cilium의 kube-proxy 대체를 쓴다 — hostPort를 따로 설정 없이 처리해서다. Pod 사이 트래픽은 VXLAN이고, 노드 주소(WireGuard 터널 주소) 사이로 가서 터널 안에 담긴다
  - kubeadm: 설정 파일로 init한다 — kube-proxy 단계 건너뛰기(`skipPhases: addon/kube-proxy`), Pod 주소 범위 10.244.0.0/16, 노드 주소는 터널 주소. Cilium이 노드마다 받은 Pod 주소 범위를 쓰는 모드(`ipam.mode: kubernetes`)라 Pod 주소 범위를 꼭 준다. 10.244.0.0/16은 kind 기본값과 같고, 서비스 주소(kubeadm 기본 10.96.0.0/12) · EC2 기본 VPC(172.31.0.0/16) · 터널(10.200.0.0/24)과 겹치지 않는다
- Secret: Sealed Secrets. 비밀값은 공개키로 잠근 SealedSecret만 Git에 두고, 클러스터 안 컨트롤러가 개인키로 풀어 일반 Secret을 만든다. Argo CD가 GitLab을 읽을 배포 토큰만은 Argo CD가 저장소를 읽기 전에 있어야 해서 처음 한 번 손으로 넣는다

### 노드 사이 — 호스트 WireGuard

- 계정이 다른 EC2와 Lightsail은 사설 IP로 서로 닿지 않는다. Cilium은 상대 노드의 주소(InternalIP)로 VXLAN을 보내므로, 두 노드를 WireGuard(`wg0`)로 잇고 노드 주소를 터널 주소로 둔다. 연결과 노드 사이 암호화가 함께 풀린다
- 터널 10.200.0.0/24 — EC2 10.200.0.1(51820/udp에서 기다림), Lightsail 10.200.0.2(EC2 탄력적 IP로 먼저 연결하고 `PersistentKeepalive = 25`로 유지). 상대 노드 /32만 터널로 보낸다(`AllowedIPs`)
- MTU: `wg0`는 1420으로 고정한다. EC2는 점보 프레임(9001)을 쓰는데 인터넷으로는 1500까지만 나가서 자동값을 믿지 않는다. Cilium MTU도 1420. Cilium이 VXLAN 머리(50바이트)를 스스로 빼서 Pod의 기본 경로 MTU는 1370이 된다(2026-10-20 EC2에서 확인, 10절)
- 개인키는 각 서버에서 만들고 밖으로 내지 않는다. 공개키만 주고받는다
- kubeadm은 `wg0`를 먼저 올린 뒤 터널 주소로 init·join한다(advertiseAddress · kubelet node-ip). 이 주소가 클러스터 인증서에 들어가서 나중에 바꾸기 어렵다. 재부팅 때 kubelet이 `wg0` 뒤에 뜨게 한다
- 쿠버네티스 밖에 있어서 서버를 다시 만들면 WireGuard도 다시 설정한다. 순서와 값은 `docs/plans/2026-10-20-pre-server-infra.md`
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
  - 예외: monitoring과 gitlab-runner는 워커가 오기 전부터 관리 서버에서 돈다(2026-10-20). 워커가 붙은 뒤 monitoring을 옮길지 다시 정한다
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

- 2026-10-20 러너를 Docker 없이 Pod로 올려서 지금은 해당 없다. 아래는 Docker를 깔게 될 때의 주의다
- 관리 서버에 Runner용 Docker를 깔면 kubelet과 containerd를 같이 쓴다. 패키지로 깐 containerd는 CRI 플러그인이 꺼져 있을 수 있다 → `/etc/containerd/config.toml`의 `disabled_plugins`에서 `cri`를 빼고, cgroup 드라이버를 systemd로 맞춘다

### 현재 상태

- EC2: 2026-10-20 만들었다(Jira S15P31A102-88). t3.large · 서울(ap-northeast-2b) · Ubuntu 24.04.5 · 탄력적 IP(주소는 `terraform -chdir=infra/terraform output`). 상태 파일은 S3, apply 전용 키로 apply했다. 같은 날 `infra/server/` 스크립트로 WireGuard(`wg0` 10.200.0.1) → kubeadm init → Cilium까지 올렸다 — 컨트롤 플레인 노드 1대 Ready, kube-system Pod 9개 Running, 재부팅 뒤에도 같다. 워커(Lightsail) join과 Argo CD는 받는 날
  - 모니터링: 2026-10-20 관리 서버에 올렸다(Jira S15P31A102-95). 수집 대상 13개 모두 up(러너 포함), SSH 터널로 Grafana 로그인 확인. 2026-10-21 CI 잡 지표(exporter)와 대시보드 「CI 병목」을 더해 수집 대상 14개(Jira S15P31A102-98)
  - GitLab Runner: 2026-10-20 관리 서버에 올렸다(Jira S15P31A102-89). 프로젝트 러너 `newlearn-ec2-k8s` 1개가 online이고 태그 없는 잡도 받는다. 시험 잡 1번이 성공했다. 2026-10-20 `.gitlab-ci.yml`을 넣어 MR 파이프라인이 돈다(Jira S15P31A102-92)
  - 2026-10-20 결정: Lightsail을 기다리지 않고 준비(설계 반영 · 상태 파일 · apply 키 · 서버 스크립트)가 끝나는 대로 만든다. EC2만 있는 동안은 kubeadm init · Cilium까지 하고, Argo CD는 Lightsail이 join한 뒤 깐다(컨트롤 플레인에는 서비스 Pod를 올리지 않는다)
- Lightsail: 2026-10-22 받았다(SSAFY 도메인 + pem 키, 콘솔 없음). Ubuntu 24.04.4 · CPU 4 · 메모리 15GiB · 디스크 309GB · 공인 쪽 인터페이스 `ens5` · `sudo` 비밀번호 없음, ufw 켜짐(22만). 같은 날 첫 확인(Jira S15P31A102-90, `docs/plans/2026-10-22-lightsail-first-check.md`)
  - WireGuard: 보안 그룹 `worker_cidrs`에 Lightsail 공인 IP(/32)를 넣고 apply → `wg-up.sh` 로 양쪽을 이었다. handshake가 맺히고 `ping 10.200.0.1` 왕복 약 1ms, 1392바이트는 지나가고 1393바이트는 「message too long」(MTU 1420). Lightsail ufw를 따로 열지 않아도 Lightsail이 먼저 보낸 것의 응답은 들어온다
  - 80 · 443: ufw를 잠깐 열고 시험 서버를 띄워 내 PC(SSAFY 망) · EC2(바깥 인터넷)에서 둘 다 200을 받았다 — SSAFY 쪽 방화벽이 열려 있다. 시험 뒤 ufw는 다시 22만
  - 아직: kubeadm join(`common.sh` · `ufw-worker.sh` · `join-worker.sh`), 고정 IP인지(8절)
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
| 뉴스 수집 배치 구현 언어 · 기사를 적재하는 길(DB 에 바로 넣나, API 를 거치나). 투입은 API 를 거치자는 제안이 있다 | BE · Infra | `docs/api-internal.md` 2절 B1 |
| 개인 외부 계정(GHCR)에 프로젝트 이미지를 두는 것이 SSAFY 규칙에 맞는지 — 막혀 있으면 저장소를 다시 고른다(바꿀 곳은 `.gitlab-ci.yml`의 이미지 주소와 CI 변수) | Infra | 6절 「배포 흐름」 |
| HTTPS 인증서 발급 방식 | Infra | — |
| NewsData.io 구독 시작 날짜 | 팀 | 5절 |
| 임베딩 모델 — 정해지면 기사 임베딩 벡터의 차원도 정해진다. Jira 35 시작 전까지 정한다. 고를 때 볼 것: 한국어 기사 품질, Lightsail CPU 에서 기사 한 건 임베딩 시간, 워커 메모리, 차원 2,000 이하(pgvector HNSW 한도), 한 번에 받는 입력 길이(`EMBED` 는 `EXTRACT` 와 동시에 돌아 우리 요약을 못 쓴다 — 제목 · 본문 앞부분 중 무엇을 넣을지). BE 안: 칸은 `vector(N)`, 검색은 처음엔 인덱스 없이(2026-10-21) | AI | 3절, `docs/data-model.md` |
| 마인드맵 렌더링 라이브러리 | FE | — |
| AI 평가셋 위치 · 회귀 기준 | AI | 3절, Jira S15P31A102-33 |
| GMS가 OpenAI 호환 API를 그대로 받는지 (워커의 `LLM_MODE=gms` 코드는 그렇다고 보고 짰다) | AI | 3절 |
| Java 린트 도구 (지금은 Spotless 포맷 검사만 한다) | BE | `.claude/stack.md` 3절 |
| API 인증을 둘지, 둔다면 어떻게 할지 (지금은 Spring Security 기본값이라 헬스 말고는 막혀 있다). 워커 · 배치가 부르는 내부 API(`/internal/v1`)를 어떻게 막을지도 여기서 정한다. 화면 로그인은 세션 쿠키 · 세션은 Redis · CSRF 는 번호표 쿠키로 정했다(2026-10-21, `docs/api.md` 1절 「인증」) — 설정은 Jira 62. 로그인 없이 부르는 A14 가입 · A15 로그인 · A19 용어사전의 요청 수 상한과 로그인 실패 잠금(무차별 대입 · 사전 하루 한도 소진 막기), `TOO_MANY_REQUESTS` 를 다시 둘지도 여기서 정한다 | BE | `docs/api.md` 1절 |
| Lightsail 공인 IP가 고정인지 — 서버를 껐다 켜면 바뀌나. 콘솔이 없어 서버 안에서는 판정할 수 없다(2026-10-22: 지금 IP는 SSAFY 도메인이 가리키는 IP와 같다). 바뀌면 보안 그룹 `worker_cidrs` apply · DNS · 80/443 입구를 다시 맞춘다. 받는 날 첫 확인 중 UDP 응답 · 443은 확인했다(6절 「현재 상태」) | Infra (SSAFY 에 문의) | 6절 |
| Envoy hostPort 80 · 443이 Lightsail 공인 IP로 받는지 — SSAFY 쪽 방화벽은 열려 있다(2026-10-22 시험 서버로 확인), Envoy로는 Jira 91에서 본다 (kind에서는 확인) | Infra | 6절 |
| PostgreSQL 백업(pg_dump)을 서버 밖에 둘지 | Infra · BE | 6절 |
| API 공통 규칙 v0(응답 · 오류 형식 · 식별자 · 시간 · 목록) 합의 — 제안을 FE · AI 가 확인하기 전이다 | BE · FE · AI | `docs/api.md` 1절, Jira S15P31A102-28 |
| 워커 → API 결과 전달 방식과 작업 큐의 스트림 · consumer group 구성. BE 안(2026-10-21, AI 확인 전): 결과는 HTTP 내부 API W1, 큐는 스트림 3 · 그룹 4, 투입 메시지에 본문 통째 · `ACKED MAXLEN ~` 상한 | AI · BE | 2절 6번 · 4절, `docs/api-internal.md` |
| 어떤 사건 3개를 한 이슈로 묶는지(이슈는 사건 3개가 모이면 AI 가 만들고 이름도 그때 짓는다고 2026-10-20 정함), 사건 하나가 여러 이슈에 속할 수 있는지 | AI · 팀 | `docs/data-model.md` 5절 |
| 한 기사가 여러 사건에 속할 수 있는지 (PRD FR-9) | AI · BE | `docs/data-model.md` 5절 |
| 북마크 · 관심 이슈를 MVP 에 넣을지 — 회원 · 관심 분야는 MVP 로 정했다(2026-10-20). Jira 63 · 64 는 만들게 돼 있고 PRD 4.7 은 MVP 이후로 둔다 | PM · 팀 | `docs/data-model.md` 5절 |
| 타임라인 메인 흐름 · 서브 흐름을 나누는 기준 | 팀 | `docs/data-model.md` 5절 |
| 기사가 몇 개 모여야 사건으로 보이는지 | AI | `docs/data-model.md` 5절 |
| NewsData 원본 분류를 카테고리 5개에 맞추는 행, 이슈가 카테고리 여러 개에 걸치는지 — NewsData 구독 뒤 실제 데이터로 | BE · 팀 | `docs/data-model.md` 5절 |
| 표준국어대사전 Open API 하루 한도 · 결과 저장 · 출처 표시 조건 | BE | 5절 |

정해지면 그 사실이 들어갈 절에 적고 이 표에서 지운다.

## 9. 뒤집은 것

정했던 것을 바꾸면 한 줄로 남긴다. 다음 사람이 옛 결정을 보고 되돌리지 않게 하려는 것이다.

| 날짜 | 무엇을 | 왜 |
|---|---|---|
| 2026-10-20 | 노드 사이 연결: Cilium이 공인 IP로 VXLAN을 보내고 6443·10250·4240·8472/udp를 보안 그룹 · Lightsail 방화벽에 연다 → 호스트 WireGuard 터널 위로 보내고 EC2에 51820/udp 하나만 연다 | 계정이 달라 사설 IP로 닿지 않고, Lightsail 방화벽은 우리가 못 바꿀 수 있다. WireGuard는 EC2 쪽 포트 하나로 연결과 암호화를 함께 푼다(Jira S15P31A102-85) |
| 2026-10-20 | 카테고리 7개 → 5개(정치 · 경제 · 사회 · 국제 · IT·과학) | 팀 회의. 스포츠 · 문화/연예는 MVP 뒤 확장 후보로 둔다 |
| 2026-10-20 | 사용자 URL 입력 분석(API A10 ~ A12) → MVP 에서 뺐다 | 팀 회의. 실서비스 기사는 NewsData 로 받고 크롤링은 계획에 없다 |
| 2026-10-20 | 데이터셋 3개를 순차 투입해 서비스 → 데이터셋은 학습 · 검증용, 서비스 기사는 NewsData 를 CronJob 하루 두 번 | 팀 회의(실서비스 운영 방식). 발표 시연 방식은 따로 정한다 |
| 2026-10-21 | 마인드맵 1차 가지 6하원칙 → 핵심 내용 · 원인·배경 · 반응 · 전망 4개, 노드 근거 화면 표시(F05) → 추후 | 마인드맵 회의. 같은 결과를 흐름지도 · 마인드맵 두 보기로 보인다. 근거는 데이터로만 남긴다 |
| 2026-10-20 | 회원 · 관심 분야: MVP 이후 → MVP(가입 · 로그인 · 관심 분야) | 팀 회의. 북마크 · 관심 이슈는 아직 미정 |
| 2026-10-21 | 「어려운 용어 자동 설명」(MVP 개요 P2) → 용어사전(표준국어대사전 Open API) MVP | 마인드맵 회의 |

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
| 2026-10-20 | 관리 서버 `terraform apply` (자원 7개) | 19초 | 검토한 plan 파일로 apply(`apply ec2.tfplan`), 시작 · 끝 시각 차이. EC2 만들기 13초 |
| 2026-10-20 | apply 뒤 SSH 접속 | 첫 시도에 접속 | apply가 끝나고 AWS 쪽 확인(약 1분)을 마친 뒤 5초 간격 재시도로 붙임. 그때 부팅 상태 검사는 아직 initializing |
| 2026-10-20 | EC2 기본 네트워크 MTU | `ens5` 9001 | 서버에서 `ip -o link show`. 인터넷으로는 1500까지만 나가서 WireGuard MTU를 1420으로 고정하는 근거(6절) |
| 2026-10-20 | EC2 공통 설정 (`infra/server/common.sh`) | 52초 | 처음 실행, 패키지 받기 포함. containerd 2.2.1 · kubeadm/kubelet/kubectl 1.36.5 · runc 1.3.4 |
| 2026-10-20 | kubeadm init → Cilium → 노드 Ready · CoreDNS (`init-control-plane.sh`) | 1분 51초 | 이미지 받기 · Helm 받기 포함, 스크립트 시작 · 끝 시각 차이 |
| 2026-10-20 | Pod 안 MTU (CoreDNS 2개) | 인터페이스 1420 · 기본 경로 1370 | 서버에서 `nsenter -n ip link` · `ip route`. Cilium이 VXLAN 50바이트를 경로 MTU로 뺀다 |
| 2026-10-20 | 재부팅 뒤 회복 | SSH 24초, 노드 Ready 약 34초, kube-system Pod 9개 다시 Ready | `systemctl reboot` 뒤 5초 간격으로 확인. `wg-quick@wg0` 와 kubelet 이 같은 초에 떴고 kubelet 의 After 에 wg-quick 이 있다 |
| 2026-10-20 | 관리 서버 CPU (러너 전) | 유휴 88 ~ 92% — 2 vCPU 중 약 0.2 사용. Pod CPU 요청 합 950m | `vmstat 2 6`, `kubectl describe node` |
| 2026-10-20 | GitLab Runner 설치 (`helm upgrade --install --wait`) | 63초 · 러너 Pod Running, GitLab에 online | 서버의 helm 4.3.1, 차트 0.88.4 받기 포함. 시작 · 끝 시각 차이 |
| 2026-10-20 | 시험 잡 (alpine 3.24.2, echo · uname · nproc) | 대기 0.8초 · 잡 18.6초(그중 잡 Pod Pending 약 12초 — 이미지 처음 받기). 잡 안에서 `cpu.max 100000 100000`(상한 1 vCPU) · `memory.max` 2 GiB, 서비스 계정 토큰 없음 | 임시 브랜치에 시험용 `.gitlab-ci.yml` 을 올리고 API 로 파이프라인 1번. 시간은 GitLab 잡 기록(`queued_duration` · `duration`) |
| 2026-10-20 | 러너 설치 뒤 관리 서버 | 노드 Ready, kube-system 9개 Running, 유휴 90 ~ 93%, 메모리 사용 1,376 MiB / 7,816 MiB, CPU 요청 합 1000m | `kubectl`, `vmstat`, `free -m` |
| 2026-10-20 | 모니터링 설치 (`helm upgrade --install kps --wait`) | 91초. 처음엔 Prometheus가 안 뜸(StorageClass 없음) → StorageClass를 만든 뒤 약 90초에 Running · PVC Bound | 서버의 helm 4.3.1, 차트 받기 포함 |
| 2026-10-20 | 모니터링 Pod 자원 (설치 약 30분 뒤) | CPU: Grafana 0.024 · Prometheus 0.018 · operator 0.003 코어(대시보드를 보는 중, 5분 평균). 메모리: Prometheus 202MiB, Grafana 컨테이너 30분 최대 368.5MiB(사이드카 2개 각 약 77MiB) — 처음 상한 384Mi가 빠듯해 256Mi 요청 · 640Mi 상한으로 올림 | Prometheus 쿼리 `rate(container_cpu_usage_seconds_total[5m])` · `container_memory_working_set_bytes` |
| 2026-10-20 | 모니터링 뒤 관리 서버 | 유휴 85 ~ 89%(전 88 ~ 92%), 노드 CPU 5분 평균 18%(대시보드를 여는 중), CPU 예약 1190m · 메모리 예약 1274Mi | `vmstat`, node-exporter 쿼리, `kubectl describe node` |
| 2026-10-20 | 스로틀 지표 | CPU 상한 0.1 시험 Pod — 2분 스로틀 비율 0.99, Grafana 「CPU Throttling」 패널 98.7% | `container_cpu_cfs_throttled_periods_total ÷ container_cpu_cfs_periods_total` |
| 2026-10-20 | 첫 CI 파이프라인 (MR !48, 모든 영역, 이미지를 처음 받음, 캐시 없음) | 520초. 잡별 대기 · 실행: rules 2 · 26초, frontend 3 · 75초, ai 78 · 68초, infra 146 · 61초, backend 208 · 290초. 자리가 1개라 영역 잡이 차례로 돌아 대기가 쌓였다. backend 는 CPU 상한 1에 2221 구간 중 2036 구간(92%) 막혔고 이미지 받기에 61초 | GitLab 잡 기록(`queued_duration` · `duration`), 잡 로그의 구간 시각, 잡 끝에 찍은 `cpu.stat` |
| 2026-10-20 | 두 번째 CI 파이프라인 (이미지가 노드에 있음, `.claude/` 를 바꿔 하네스 검사 포함) | 490초. rules 14초, harness 46초(하네스 테스트 8개 파일 통과), frontend 54초, ai 64초, infra 55초, backend 258초(막힘 90%). 단계: 설치 ai 41 · infra 20 · frontend 17초, backend 포맷 검사 75초(Gradle 받기 포함) · 테스트 130초. 준비는 첫 실행 9 ~ 61초 → 3 ~ 4초(backend 33초) | 같은 방법 |
| 2026-10-20 | CI 캐시 — GitLab `cache:` (MR !50, 관리 서버 디스크에 압축 파일) | 채울 때 612초, 쓸 때 572초 — 캐시 없음(480 ~ 490초)보다 느림. 쓸 때 잡별(복원 · 스크립트 · 저장): frontend 58초(3 · 39 · 5, 없음 54초), ai 182초(30 · 41 · 97, 없음 64초), infra 124초(16 · 54 · 46, 없음 55초), backend 192초(15 · 102 · 35, 없음 258초). 압축 파일 frontend 51 · infra 183 · backend 304 · ai 336 MB | 같은 MR 에서 두 번(두 번째는 MR 파이프라인을 다시 만듦). 잡 로그의 `restore_cache` · `archive_cache` 구간 |
| 2026-10-20 | CI 캐시 — 도구가 `/ci-cache`(관리 서버 디스크)에 직접 쌓음, 압축 없음 (MR !50) | 채울 때 437초, 쓸 때 **320초** — 캐시 없음(480 ~ 490초) · GitLab `cache:`(572초)보다 빠름. 쓸 때 잡별: frontend 49초(설치 11초, 없음 17초), ai 56초(설치 33초 — 받기는 없고 약 1 GB 를 가상환경에 복사하는 시간), infra 63초(설치 28초, 없음 20초 — 그래서 infra 는 뺌), backend 136초(포맷 검사 33 · 테스트 51초, 없음 75 · 130초, CPU 막힘 871/961 구간) | 같은 MR 에서 두 번. 잡 로그의 단계 시각 |
| 2026-10-20 | 노트북 러너만 (EC2 러너를 잠시 멈춤, MR !52) | 첫 실행 330초 — 내려받기가 병목(ai 206 · backend 208초, backend 포맷 검사에 137초). 캐시를 쓴 실행 **109초** — rules 7 · harness 25 · frontend 22 · ai 15 · infra 76 · backend 39초(EC2 는 136초). 잡 CPU 상한 4(`cpu.max 400000 100000`) | 같은 MR 파이프라인을 두 번. Docker executor 는 after_script 를 따로 띄운 컨테이너에서 돌려, 잡 끝 `cpu.stat` 으로는 노트북 잡의 막힘을 못 본다 |
| 2026-10-21 | 두 러너가 함께 (MR !52) | **119초**. EC2 가 rules 14 · ai 47초, 노트북이 harness 26 · frontend 22 · infra 83 · backend 41초. 가장 긴 기다림 27초 (EC2 만일 때 같은 파이프라인 305초) | 같은 방법. 어느 러너가 받을지는 고르지 않았다 |
| 2026-10-21 | 파이프라인 다섯 개가 한꺼번에 (dev push + dev → 분야 브랜치 MR 넷, 두 러너) | dev 121초, MR 넷 13 · 192 · 166 · 117초(13초는 문서만 달라 규칙 잡 하나). 가장 긴 잡 기다림 **203초** (여신보좌관 기다림 상위 10% 23분) | GitLab 잡 기록 `queued_duration` · `duration` |
| 2026-10-21 | EC2 CPU 크레딧 잔액 | **269.8** (07:45 KST). 10-20 12:30 무렵 약 54 → 그사이 CI 파이프라인 21번을 돌리고도 늘었다 — 시간당 36 적립이 CI 사용보다 크다. 5분 사용량 최고 3.73 | EC2 콘솔 › 인스턴스 › 모니터링 탭 「CPU 크레딧 밸런스」 · 「CPU 크레딧 사용량」 (사람이 읽음) |
| 2026-10-20 | 갈래별 잡 자원 | w0 잡 Pod 의 build 컨테이너 요청 100m · 128Mi, 상한 500m · 256Mi, 이름표 `newlearn.io/workload=w0` | 잡이 도는 동안 `kubectl -n gitlab-runner get pod -o jsonpath` |
| 2026-10-20 | Prometheus 데이터 보존 | Pod를 지웠다 다시 띄운 뒤에도 4분 전 시점 `count(up)` = 13 그대로, 저장 폴더 3.7MB | 지우기 전 · 뒤 같은 시점 쿼리 |
| 2026-10-21 | 첫 dev 굽기 — GHCR에 올리고 캐시를 처음 채움 (dev `4abd39a2`, 파이프라인 #235466) | 세 이미지가 태그 `4abd39a2`로 올라감. ai 680초(EC2, CPU 막힘 33% — 6459 구간 중 2102, 최대 메모리 상한 2Gi에 닿음), backend 566초 · frontend 359초(노트북, 둘이 동시에). 잡 대기 2 ~ 3초. 로그인 없이 받기는 세 이미지 모두 `authentication required` · 403(공개 이미지는 200) — 비공개 | GitLab 잡 기록 `duration` · `queued_duration`, 잡 끝 `cpu.stat` · `memory.peak`. 비공개는 `ghcr.io/token` 익명 요청과 manifest 받기를 공개 이미지와 견줌. CI 변수를 넣기 전 첫 실행은 세 잡 모두 `DENIED`로 실패했다 |
| 2026-10-21 | CI 굽기 잡 w4 — Kaniko, 올리지 않고 캐시 없이 (MR !60) | EC2 러너: backend 273 · 267초, frontend 126초(새 옵션 122초), ai 옵션 없이 251 · 278초에 OOMKilled → `--use-new-run` · `--compressed-caching=false`로 426초. 노트북 러너: backend 228초, frontend 326초 · ai 475초(둘이 동시에). EC2 frontend CPU 막힘 71%(838 구간 중 597), ai 14%(4154 중 600), 최대 메모리 둘 다 상한 2Gi에 닿음. 같은 frontend를 노트북에서 Docker로 31초, Kaniko로 199초 | GitLab 잡 기록 `duration`, 잡 끝 `cpu.stat` · `memory.peak`(디스크 캐시 포함). 어느 러너가 받을지는 러너를 멈추거나 바쁘게 두어 맞췄다. 노트북 Kaniko는 `docker run`으로 직접 |
| 2026-10-21 | CI 잡 지표 exporter 설치 (`kubectl apply -k`, Jira S15P31A102-98) | Pod Running까지 36초, 뜬 지 2초에 ref 11개(dev + MR 10개)를 찾음. kube-state-metrics 허용 목록을 넣은 kps `helm upgrade`(같은 92.10.1)는 30초 — 렌더링을 견주니 바뀐 곳은 kube-state-metrics 인자 두 줄뿐 | 시작 · 끝 시각 차이, 지금 값 · 새 값으로 `helm template` 두 벌을 diff |
| 2026-10-21 | exporter 가 SSAFY GitLab 에 보내는 요청 | 머지된 MR 까지(최근 10개) 읽을 때 초당 0.75번(약 2,700/시간) · 21분에 916번 — 상한 초당 1회에 거의 붙음. 열린 MR 만 읽게 바꾼 뒤 약 290/시간(그때 열린 MR 0개, dev 하나) | exporter 지표 `gcpe_gitlab_api_requests_count` 의 10분 · 20분 `rate` |
| 2026-10-21 | exporter 자원 · 시계열 | CPU 0.001코어(10분 평균), 메모리 최대 12.3MiB(30분), exporter 시계열 105개 · 잡 Pod 주석 16개 | `container_cpu_usage_seconds_total` · `container_memory_working_set_bytes` · `count({job="gitlab-ci-exporter"})` |
| 2026-10-21 | exporter 값 ↔ GitLab 잡 API 대조 — MR !66 파이프라인 235615 잡 9개, MR !67 파이프라인 235681 · 235732 잡 4개(열린 MR 로 실시간) | 13개 모두 잡 ID · 러너 · 기다림 · 걸린 시간이 소수점 셋째 자리까지 같음 (예: !66 w3:backend 노트북, 기다림 760.512초 · 걸린 시간 44.094초) | 클러스터 안 일회용 Pod 가 exporter 와 같은 읽기 토큰으로 `/projects/:id/pipelines/235615/jobs` 를 부르고, Prometheus 의 `gitlab_ci_pipeline_job_*` 와 견줌 |
| 2026-10-21 | 12:24 몰림 — dev push 1개 + 반영 MR 셋(!64 · !65 · !66, `.gitlab-ci.yml` 이 달라 MR 마다 w4 굽기 3개까지) | MR 파이프라인 742 · 643 · 568초, 잡 기다림 최대 **760초**(!66 w3:backend) · !65 392초 · !64 50초 | exporter 지표(`gitlab_ci_pipeline_duration_seconds` · `…_job_queued_duration_seconds`), 위 대조로 API 와 같음을 확인 |
| 2026-10-21 | 운영 이미지 첫 굽기 (인프라 담당 노트북, 캐시 없음) | frontend 31초 · backend 143초 · ai 170초. 로컬 크기 90.8 MB · 611 MB · 2.12 GB. 띄운 뒤 헬스 UP까지 backend 9초(DB · Redis 연결, Flyway 적용) · ai 1초 | Docker Desktop 29.6.2에서 `docker build` 시작 · 끝 시각 차이. 크기는 `docker image ls`의 SIZE(창고에 올라가는 압축 크기와 다르다). 헬스는 시험용 DB · Redis 컨테이너에 붙여 1초 간격으로 확인 |
