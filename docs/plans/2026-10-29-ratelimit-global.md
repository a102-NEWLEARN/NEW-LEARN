# PM 확인 반영 · 「사건 사이 선」 기록 바로잡기 · 주소별 요청 수 상한을 Envoy Gateway global 로

2026-10-29 계획. 사용자 「권장사항대로 진행해」(요청 수 상한), PM 확인 항목 답(아래).

## 무엇을 / 왜

- **요청 수 상한**: 10-29 낮에 입구 Envoy 의 local 상한(IP 마다, `sourceCIDR` `Distinct`)을 사이트에 걸었지만 실측에서 아무것도 막지 않았다
  - 용어사전에 102번 보내 모두 200
  - Envoy 통계 `rate_limited 0` — 모든 요청이 상한 없는 기본 바구니로 감
  - Envoy Gateway v1.9.2(Envoy 1.39.1)의 local `Distinct` 가 동작하지 않는 것으로 판정(계획 때 적어 둔 위험)
  - 공식 문서가 「IP 마다」 예시를 드는 global 상한(Envoy 옆 상한 서비스 + Redis)으로 바꾼다
- **선 기록**: 문서에 「사건 사이 선은 그리지 않는다(2026-10-20)」로 적혀 있는데, 프로토타입은 타임라인 사건을 선으로 잇는다(사용자 지적). 그리지 않는 것은 「관계 종류 선 · 태그」였다고 바로잡는다
- **PM 확인**: !372 의 확인 항목을 사용자가 모두 「맞다」고 했다(10-29). 그 사실을 기록한다

## 정한 것 (사용자, 10-29)

| 무엇 | 답 |
|---|---|
| F02 범위에 A13 통합 검색(빠른 이동) — MVP 필수 | 맞음 |
| 반응 점선을 그림 | 맞음(연결되는 사건이 있으니). 「사건 사이 선을 안 그린다」 기록은 잘못 — 프로토타입은 메인 레인 사건도 선으로 잇는다 |
| F13 용어사전 버튼만(단축키 없음) | 맞음(프론트 UX 문서) |
| 나머지(F12 · F13 P0, PRD 4건 → 5건 · Ctrl 표기 · 바뀐 결정 표) | 맞음 |
| 요청 수 상한 방식 | Envoy Gateway global(권장안) |

## 조사한 것 (2026-10-29, 클러스터는 읽기만)

- **지금 Envoy Gateway 설정**(`envoy-gateway-config`)에는 `rateLimit` 이 없다 — 상한 서비스가 꺼져 있다. Argo CD 앱 `infra/k8s/apps/templates/envoy-gateway.yaml` 은 Helm 값 없이 차트 기본값으로 깐다
- **켜는 법**(공식 문서 Global Rate Limit): `config.envoyGateway.rateLimit.backend.type: Redis` · `redis.url`. 문서의 「클라이언트 IP 마다」 예시가 global 에 `sourceCIDR` `Distinct` `0.0.0.0/0` 이다
- **상한 서비스를 못 부르면**: `FailClosed` 기본 false — 요청을 그냥 통과시킨다. 부르는 시간 상한 기본 20ms(`api/v1alpha1/envoygateway_types.go` v1.9.2)
- **상한 서비스 Pod**: 이름 `envoy-ratelimit`, 이름표 `app.kubernetes.io/name: envoy-ratelimit` · `app.kubernetes.io/component: ratelimit` · `app.kubernetes.io/managed-by: envoy-gateway`, gRPC 8081(`internal/infrastructure/kubernetes/ratelimit/resource.go`). Envoy 와 주고받을 인증서 비밀 `envoy-rate-limit` 은 이미 있다
- **자원 기본값**: 상한 서비스 전용 값이 소스에 없고, 일반 기본값은 요청 CPU 100m · 메모리 512Mi 다 — 너무 크니 직접 준다
- **차트는 설정이 바뀌어도 컨트롤러(`envoy-gateway`)를 저절로 다시 띄우지 않는다**(설정 checksum 주석 없음). 공식 문서도 「설정을 바꾼 뒤 컨트롤러를 다시 띄우라」고 한다 → Helm 값 `deployment.pod.annotations` 에 설정 판 표시를 두어 Argo CD 가 바꾸면 Pod 가 새로 뜨게 한다(사람이 restart 명령을 칠 필요 없음)
- **Redis**(`data/redis`, 워커): 비밀번호 없음, `noeviction` · 1GB. 들어오는 길은 CiliumNetworkPolicy `redis-ingress` 가 backend · AI 워커만 받는다 → 상한 서비스를 더해야 한다
- **워커 노드 여유**: 요청 CPU 37% · 메모리 43%
- Envoy 는 hostPort 로 손님 IP 를 직접 본다(10-29 접근 로그 공인 주소 41개) — global 도 같은 주소로 센다

## 바꿀 파일

**① 문서 MR → dev (선 기록 · PM 확인)**

조사 결과
- 프로토타입 v21(`docs/prototype/NEW-LEARN 프로토타입 v21.html` `LaneTimeline`)
  - 메인 레인 사건을 굵은 민트 띠(`stroke: var(--spine)`, 12px)로 시간순으로 잇는다
  - 관계 선은 종류마다 모양이 다르다: 후속 실선 · 원인 화살표 · 반응 점선 `5 4` · 반박 빨간 점선
  - 서브 레인 사건도 관계 선으로 메인 사건에 이어진다
- 10-20 원래 결정: `docs/plans/2026-10-21-data-model-api-v1.md:18` 「타임라인은 메인 · 서브 레인만(**선 종류** · 새사실 태그 없음)」. 빠진 것은 선 전체가 아니라 「선 종류」와 태그였다
- 뒤에 쓴 문서가 이것을 「사건 사이 선은 그리지 않는다」 · 「선 없음」으로 옮겼다. 프론트 UX 문서(`origin/frontend` EXPERIENCE.md:131)도 우리 A4 를 따라 「사건 사이의 선과 관계 태그는 그리지 않는다」로 적었다

바로잡는 문장(모든 곳에 같은 뜻으로)
- 메인 레인 사건은 화면이 시간순으로 선(메인 흐름 띠)으로 잇는다 — 응답 칸은 필요 없다
- 관계 선은 반응 점선 하나 — 반응 사건과 대상 사건이 같은 이슈이고 둘 다 보일 때(10-28)
- 그리지 않는 것: 관계 종류를 가르는 선(후속 · 원인 · 반박)과 새 정보 같은 사건 태그(10-20)

고칠 곳
- `docs/api-screen.md` A4(155줄) — 위 세 문장으로
- `SSOT.md` 9절(377줄) — 「사건 사이 선을 그리지 않는다(2026-10-20)」 → 「관계 종류 선 · 태그를 그리지 않는다(2026-10-20)」. 메인 레인 띠는 처음부터 그린다는 것을 함께 적는다
- `docs/data-model.md` 299 · 323줄, `docs/glossary.md` 58줄(사건 관계), `docs/api.md` 273줄(Jira 48 메모)
- `docs/mvp-overview.md` 288줄 — 「선 종류 · 태그 없음」은 맞으니, 「메인 레인 사건은 시간순으로 선으로 잇는다」만 더한다. 85줄 「이 MR 에서 PM 확인」 → 「2026-10-29 사용자 확인」
- 고치지 않는 곳
  - PRD — 「MVP 는 시간순 연결만」(1035줄) · FR-22(P1 관계 선)가 이미 맞다
  - user-flow 185줄 — 같은 뜻이다
  - 지난 계획 파일들 — 그때의 기록이다
- 프론트 UX 문서는 고치지 않는다. 프론트 Jira 104 에 댓글로 남긴다
  - 무엇을: EXPERIENCE.md:131 의 「선 없음」 → 위 세 문장, F12 · F13 「제안」 지움(사용자 확인 끝)
  - 이미 만든 타임라인이 선을 빼고 그렸으면 메인 띠 · 반응 점선을 더해야 한다는 것도 적는다
- Jira 133 「문서 불일치 정리」에 「PM 확인 항목 사용자 확인(10-29)」 댓글

**② 인프라 MR → infra (global 상한)**

- `infra/k8s/apps/templates/envoy-gateway.yaml` — `helm.valuesObject` 를 더한다
  - `config.envoyGateway.rateLimit.backend`: `type: Redis`, `redis.url: redis.data.svc.cluster.local:6379`
  - `config.envoyGateway.provider.kubernetes.rateLimitDeployment.container.resources`: 요청 CPU 50m · 메모리 64Mi, 상한 메모리 256Mi
  - `deployment.pod.annotations`: `newlearn.io/config-revision: "ratelimit-global-1"` — 설정이 바뀌면 이 값을 올려 컨트롤러를 새로 띄운다(주석으로 적음)
- `infra/k8s/services/app/ratelimit.yaml` — 정책 셋의 `rateLimit.local` → `rateLimit.global`(규칙 · 숫자 · `responseOverride` 는 그대로). 머리 주석을 global 기준으로 고친다(왜 local 이 아닌지 · 실패하면 통과)
- `infra/k8s/services/data/netpol.yaml` — `redis-ingress` 에 `envoy-gateway-system` 의 `app.kubernetes.io/name: envoy-ratelimit` 을 더한다
- 문서(같은 MR)
  - `SSOT.md` 6절 「외부 입구」의 상한 줄: local → global(상한 서비스 · Redis · 실패하면 통과 · local 이 안 된 실측). 1절 구성 요소 표에 상한 서비스가 필요하면 한 줄
  - `SSOT.md` 9절: 「입구 local 상한 → global」(10-29 실측 근거)
  - `docs/api.md` 2절 `RATE_LIMITED` · `docs/api-screen.md` A14 · A15 · A19 — 숫자 · 코드는 그대로라 「입구(Envoy)가 막는다」 문구만 확인
- 계획 파일 → `docs/plans/2026-10-29-ratelimit-global.md`

## 작업 순서

- [x] ① 문서 MR → dev 머지, 프론트 Jira 104 · Jira 133 댓글 — !389 · 2026-10-29 머지 — 다시 찾기로 옛 문구(「사건 사이 선을 그리지」 · 「선 없음」 · 「선은 그리지 않기로」) 0곳(지난 계획 파일 빼고)
- [ ] ② 인프라 MR → infra → dev — 둘 다 `SSOT.md` 9절을 고쳐서, ① 이 dev 에 들어간 뒤 infra 를 dev 에 맞추고 그 위에 브랜치를 만든다. 서버 쪽 시험 적용(dry-run)으로 정책 셋 · 네트워크 정책 · Argo CD 앱을 검사한 뒤 머지(사이트 반영)
- [ ] 사이트 측정 — 아래 「어떻게 검증하나」
- [ ] Jira 135 완료, 기록 갱신, 분야 브랜치 넷 dev 에 맞춤

## 안 바꿀 것

- 상한 숫자(용어사전 100 · 로그인 20 · 가입 10 / 1분), 코드 `RATE_LIMITED` · 429 본문 · `Retry-After`, 경로 규칙 셋(`routes.yaml`) — 이미 사이트에 있고 그대로 쓴다
- 백엔드 코드(사전 하루 한도 · 로그인 잠금), Redis 설정 자체(크기 · noeviction · 판)
- Envoy Pod 수 · hostPort 구성, 다른 BackendTrafficPolicy
- 상한 서비스용 Redis 를 따로 두지 않는다 — 키에 만료가 있고 양이 작다(1분 바구니)
- 프론트 코드 · UX 문서(EXPERIENCE.md)

## 리스크

- **컨트롤러를 다시 띄우는 동안**: Envoy 는 마지막 설정으로 계속 받는다(컨트롤러는 설정만 내려 줌). 다만 새 설정이 잘못되면 컨트롤러가 뜨지 못할 수 있다 → 서버 쪽 시험 적용으로는 Helm 값을 검사하지 못하니, 바꾼 값은 공식 문서 · 소스의 칸 이름 그대로만 쓴다
- **Redis 를 같이 쓴다**: 세션 · 작업 큐와 같은 Redis 에 상한 키가 생긴다. 키마다 1분 만료라 양은 작지만, Redis 가 가득 차면(noeviction) 상한 서비스 쓰기가 실패 → 상한이 풀린다(요청은 통과)
- **상한 서비스가 죽거나 Redis 가 끊기면** 상한이 풀린다(fail open). 사이트는 그대로 돈다 — 안전 쪽을 골랐다
- **이름표가 다르면** 네트워크 정책이 Redis 를 막아 같은 결과(상한이 풀림). 배포 뒤 Pod 이름표를 보고 확인한다
- 같은 공인 IP 를 여럿이 쓰면 바구니가 하나다(10-29 계획과 같음)
- global 도 동작하지 않으면 계획을 멈추고 앱(Spring)에서 세는 안으로 다시 계획한다
- **선 기록(①)**: 프론트가 이미 「선 없음」 문서대로 타임라인을 만들었으면, 메인 띠 · 반응 점선을 더하는 일이 프론트에 생긴다. 프론트 Jira 104 댓글로 알린다(프론트 문서 · 코드는 손대지 않음)

## 어떻게 검증하나

- 머지 전: 서버 쪽 시험 적용(`--dry-run=server`)으로 정책 셋 · 네트워크 정책 · Argo CD 앱 매니페스트 검사
- 사이트(데이터를 만들지 않는 요청만, EC2 에서 health 1초마다)
  - 컨트롤러 새 Pod · `envoy-ratelimit` Pod Running, 재시작 0, Pod 이름표 확인, 메모리 사용량
  - 정책 셋 `Accepted`, Envoy 설정에 `envoy.filters.http.ratelimit`(global) 이 세 경로에 붙음
  - **A19 용어사전**: 관리자 PC 에서 1분 안에 101번 → 101번째가 429 `RATE_LIMITED` · `Retry-After: 60`. 같은 때 EC2 에서는 200(IP 마다 따로)
  - **A15 로그인**: 번호표 없이 21번(서버는 403) → 21번째가 입구 429
  - **A14 가입**: 번호표 없이 11번 → 11번째가 입구 429
  - `GET /api/v1/members/me` · `GET /api/v1/categories` 는 걸리지 않음
  - Envoy 통계(상한 서비스가 「넘음」으로 답한 수)를 읽기만 한다. 운영 Redis 는 직접 읽지 않는다
  - 프로토타입 · UX 문서와 다시 맞춰 볼 것: A4 응답에는 메인 띠용 칸이 따로 없어도 된다(화면이 `lane` · 시간순으로 그림)

## 되돌리는 법

- ①: 문서 MR revert
- ②: 인프라 MR revert → Argo CD 가 Helm 값 · 정책 · 네트워크 정책을 되돌린다. 컨트롤러는 주석 값이 바뀌어 다시 뜨고 상한 서비스는 사라진다. 정책 셋은 local 로 돌아가 다시 무효(사이트 동작은 지금과 같음)
- Redis 에 남은 상한 키는 1분 만료라 저절로 사라진다
