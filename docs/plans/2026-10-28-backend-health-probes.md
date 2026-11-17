# Jira 29 — 백엔드 운영 설정 · 헬스 확인

## 무엇을 / 왜

사이트 backend 를 「잘 켜고, 잘 살피고, 잘 끄는」 설정을 마무리한다. 켜고 끄는 큰 틀(새 Pod 먼저 · 준비 확인 · preStop 10초 · 유예 40초)은 인프라 작업에서 이미 넣었다. 남은 것은 셋이다.

- 쿠버네티스가 묻는 주소가 스프링 전용 주소(`/actuator/health/liveness` · `/readiness`)가 아니다. 전용 readiness 는 기본값으로 DB · Redis 를 안 본다
- 끄는 시간에 여유가 없다 — preStop 10초 + 스프링 종료 기본 30초 = 40초 = 유예 40초. 마지막 요청이 강제 종료와 겹칠 수 있다
- 「DB 가 끊기면 readiness 가 내려가는가」를 확인한 기록이 없다 (티켓 완료 기준)

## 정한 것 (2026-10-28 사용자와)

- ① 프로브는 전용 주소로 — readiness 그룹에 DB · Redis 를 넣어 지금 뜻(「DB · Redis 가 안 되면 요청을 받지 않는다」, SSOT 6절)을 지킨다. liveness 는 포트 대신 앱 상태로, DB 는 안 본다
- ② 로그 모양은 지금 글자 그대로 — 이번에는 건드리지 않는다. 로그 창고(Loki)를 다음 인프라 티켓으로 들이며 거기서 정한다
- ③ 사이트 전용 설정 파일(`application-prod.yaml`)은 두지 않는다 — `application.yaml` 하나에 env 빈칸, 사이트 값은 매니페스트 env 로. 티켓 완료 기준의 「운영 프로필」 줄은 Jira 댓글로 바꾼다
- ④ 스프링 종료 단계 상한 20초 — preStop 10 + 20 = 30초, 유예 40초까지 10초 여유

## 바꿀 파일

- `backend/src/main/resources/application.yaml` — `management.endpoint.health.probes.enabled: true`(사이트는 쿠버네티스라 이미 켜져 있지만 내 PC · 시험도 같게), `management.endpoint.health.group.readiness.include: readinessState,db,redis`, `server.shutdown: graceful`(기본값이지만 20초가 뜻이 있게 적는다), `spring.lifecycle.timeout-per-shutdown-phase: 20s`. 줄마다 왜를 주석으로
- `backend/src/test/java/kr/io/newlearn/BackendApplicationTests.java` — 시험 넷을 더한다. 같은 클래스에 넣어 시험용 앱(DB 연결 풀)이 늘지 않게 한다(10-27 CI too many clients)
  - `/actuator/health/liveness` · `/readiness` 가 로그인 없이 200 · UP
  - readiness 그룹은 `db` · `redis` 를 포함, liveness 그룹은 둘 다 포함하지 않음(`HealthEndpointGroups` 빈)
  - 종료가 graceful · 단계 상한 20초(`Environment`)
- `infra/k8s/services/app/backend.yaml` — startup · readiness → `httpGet /actuator/health/readiness`, liveness → `httpGet /actuator/health/liveness` + `timeoutSeconds: 3`(주기 20초 · 3번은 그대로). 주석 고침
- `SSOT.md` — 6절 「무중단 배포 조건」의 「Spring graceful shutdown(기본 켜짐)」에 단계 상한 20초와 이유, 같은 절 「무중단 교체 조건을 backend · frontend · ai에 넣었다」 줄의 backend 프로브 설명을 전용 주소로. 10절 「잰 것」에 DB 끊김 확인 · 반영 중 health 결과
- `infra/server/README.md` 「서비스 배포」 — backend 로그 보는 법 한 줄(`kubectl -n app logs deploy/backend --since=…` · 재시작이면 `--previous` · Argo CD LOGS 탭). env 목록은 `backend.yaml` 이 원본이라 가리키기만

## 작업 순서 (MR 둘 — 분야 브랜치 규칙)

- [x] backend 커밋 — 작업 브랜치 `feat/backend/S15P31A102-29-health-probes`(backend 에서). 시험 넷을 먼저 써서 빨강을 본 뒤 `application.yaml` 로 초록. 이 계획 파일을 `docs/plans/2026-10-28-backend-health-probes.md` 로 옮겨 같이 커밋
- [x] backend MR → backend → dev → 태그 MR → 사이트 반영. 확인: 새 Pod Ready · 재시작 0, Flyway 줄
- [x] infra 커밋 — 작업 브랜치 `chore/infra/S15P31A102-29-backend-probes`(infra 에서). `backend.yaml` · SSOT 6절 · `infra/server/README.md`. 서버 dry-run(`kubectl apply --dry-run=server`)과 `kubectl diff` 로 바뀌는 줄이 프로브뿐인지 확인
- [x] infra MR → infra → dev → Argo CD 반영. 반영 동안 EC2 에서 1초마다 health
- [x] SSOT 10절 잰 것 · Jira 29 댓글(완료 기준 대조 · 운영 프로필 결정) · 완료

## 안 바꿀 것

- Loki · 로그 수집기 · 로그 모양 — 다음 인프라 티켓(새로 만든다)
- backend 시작 로그의 Spring 기본 비밀번호 줄 — 남은 것 목록 ⑨, 사용자가 「지금은 두기」
- 밖으로 여는 길(`routes.yaml` — `/actuator/health` 정확 경로 하나). 전용 주소는 밖에 열지 않는다. 쿠버네티스는 Pod 에 직접 묻는다
- preStop 10초 · 유예 40초 · 교체 전략 · 자원 값 · env
- frontend · ai 프로브, `SecurityConfig`(이미 `/actuator/health/**` 를 연다)
- 외부 키 자리(사전 · NewsData) — 그 기능 티켓(102 · 수집 배치)에서

## 리스크

- liveness 를 HTTP 로 바꾸면 앱이 3초 넘게 답하지 못하는 일이 1분(20초 × 3번) 이어질 때 재시작된다. 포트만 볼 때보다 민감하다 — 지금 평소 CPU 는 요청의 2% 안팎이라 낮다고 본다. 재시작이 보이면 timeout 을 늘리거나 포트로 되돌린다
- readiness 그룹 이름을 틀리면(없는 `redis` 등) 스프링이 시작하지 않는다 — 시험이 앱을 띄우므로 커밋 전에 잡힌다
- 종료 상한 20초보다 긴 요청은 끊긴다 — 지금 API 는 짧은 조회 · W1 이라 해당 없다고 본다
- 내 PC · 시험의 `/actuator/health` 응답에 `groups` 칸이 더해진다. 상태 코드 · `status` 는 같아 compose 헬스 확인은 그대로

## 어떻게 검증하나

- 1단계 기계 검사 (`.claude/stack.md` §3): backend 포맷 · 린트 · 시험(지금 310개 + 4). 되돌림 확인 — `application.yaml` 만 되돌리면 새 시험이 단언에서 빨개진다. infra 는 서버 dry-run · diff
- 2단계 실제 실행
  - 내 PC: compose 로 DB · Redis 를 띄우고 `./gradlew bootRun` → `/liveness` · `/readiness` 200 → DB 컨테이너를 멈추면 readiness 503 · liveness 200 → DB 를 다시 켜면 readiness 200. 결과를 SSOT 10절에
  - 사이트: backend 반영 뒤 Pod Ready · 재시작 0. infra 반영 뒤 `kubectl describe` 로 프로브 주소 확인, 교체 동안 EC2 에서 1초마다 `https://newlearn.io.kr/actuator/health` 실패 0(지금까지 61번 중 0 과 대조)
- 3단계 티켓 완료 기준 대조
  - 운영에서 서버가 뜨고 env · 로그 확인 방법 공유 — `backend.yaml` env 와 `infra/server/README.md` 로그 줄(운영 프로필은 ③ 결정으로 대신)
  - liveness · readiness 주소가 프로브에 맞게 답함 — 시험 + 사이트 Ready
  - DB 연결 실패 때 readiness 확인 결과 — 내 PC 확인을 SSOT 10절에

## 계획과 달라진 것

- `management.endpoint.health.probes.enabled: true` 는 넣지 않았다 — Spring Boot 4.1 은 쿠버네티스 밖에서도 기본값이 true 라(spring-boot-health 4.1.1 설정 목록) 하는 일이 없다. 그래서 전용 주소 시험 둘(`livenessIsUpWithoutLogin` · `readinessIsUpWithoutLogin`)은 고치기 전에도 초록이다 — 매니페스트가 기댈 주소를 지키는 시험으로 둔다. 빨강 → 초록은 그룹 · 끝내는 시간 시험 둘(「db 는 구성원이 아님」 · 「expected 20S but was 30S」)
- DB 를 끊으면 readiness 는 바로 503 이 아니라 **30초 뒤 503**(DB 연결 대기 Hikari 기본 30초), Redis 는 **60초 뒤 503**(Redis 명령 대기 기본 60초). 쿠버네티스는 1초 안에 답이 없으면 실패로 치므로(readinessProbe timeout 기본 1초) 두 번(10초)이면 Pod 가 「준비 안 됨」이 된다 — 뜻은 지켜진다. liveness 는 그동안 0.01초 안에 200. 내 PC 확인(2026-10-28, 확인용 compose `nl29check`)

## 되돌리는 법

- 두 MR 각각 Revert. backend 는 Revert 뒤 dev 파이프라인 태그 MR 머지, infra 는 Argo CD 가 바로 되돌린다. DB · 데이터 변경이 없어 모두 되돌릴 수 있다
- 사이트에서 liveness 재시작이 보이면 infra MR 만 Revert 하면 포트 확인으로 돌아간다(앱 설정은 남아도 무해)
