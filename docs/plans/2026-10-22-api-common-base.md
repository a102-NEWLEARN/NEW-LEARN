# Jira S15P31A102-100 API 공통 기반 — 오류 응답 · 시간 · 목록 모양 · 둘러보기 API 열기

## 무엇을 / 왜

모든 화면 API 가 같이 쓰는 바탕을 만든다: 오류 응답 모양(`ProblemDetail` + `code`), `+09:00` 시각, 목록 응답과 페이지 인자 검사, 로그인 없이 여는 주소. 그리고 모든 BE 티켓이 따를 코드 약속을 저장소 문서로 옮긴다. BE 구현 티켓(41 · 42 · 48 · 49 · 56 · 62 · 65 · 102)이 101 과 이 티켓을 기다린다. 두 사람이 따로 만들면 오류 모양 · 시간 형식이 갈라진다.

101 처럼 묶음 다섯으로 나눈다. 묶음마다 파일을 하나씩 설명하고, 사용자가 「이어서」라고 하면 다음 묶음으로 간다. 묶음 하나가 커밋 하나다.

## 정한 것 (2026-10-22 사용자)

- Querydsl 은 뺀다 — 쓰는 곳이 `QuerydslConfig` 하나뿐이고 코드 약속(Spring Data → JPQL → 네이티브)과 어긋난다
- 코드 약속은 새 문서 `docs/backend-convention.md` 에 둔다. `.claude/stack.md` 7절 색인에 한 줄, Jira 100 설명은 이 문서를 가리키게 고친다
- 먼저 dev → backend 동기화 MR 을 머지한 뒤(`docs/git-convention.md` 1절 작업 흐름 6번) backend 에서 작업 브랜치를 딴다. 코드와 문서를 MR 하나로 backend 에 낸다
- 스프링이 내는 오류에도 code 를 붙인다 — 상태 이름을 코드로: `NOT_FOUND`(404, 그런 주소 없음) · `METHOD_NOT_ALLOWED`(405) · `NOT_ACCEPTABLE`(406) · `UNSUPPORTED_MEDIA_TYPE`(415). `docs/api.md` 2절 표에 더한다

## 설계 검토로 확인한 것 (Gradle 캐시의 jar 를 열어 확인: spring-webmvc 7.0.9 · security 7.1.1 · boot 4.1.1 · jackson-databind 3.1.5)

- 시각: Jackson 3 기본값으로 `OffsetDateTime` 이 가진 `+09:00` 그대로 나간다(`WRITE_DATES_AS_TIMESTAMPS` 꺼짐). 본문의 오프셋 없는 시각은 읽기에서 실패한다 → 설정 파일 없이 테스트로 고정한다. `spring.jackson.time-zone` 은 두지 않는다(두면 모든 시각이 그 시간대로 바뀐다)
- 우리 `SecurityFilterChain` 을 만들면 Boot 가 health 를 열어 두던 기본 체인이 물러난다 → health 를 직접 연다
- 진입점(entry point)을 안 꽂으면 로그인 안 한 사용자가 401 대신 403 을 받는다
- CSRF 는 62 전까지 Spring 기본값이다. 그래서 가입 · 로그인 POST 는 번호표 없이 403 `FORBIDDEN` — 그 API 자체가 62 에서 생기므로 지금 막히는 화면은 없다
- `@WebMvcTest` 는 `SecurityFilterChain` 을 스스로 안 가져온다 → 테스트에 `@Import(SecurityConfig.class)` 를 꼭 붙인다

## 작업 순서

- [x] **0. dev → backend 동기화 MR** — 지금 dev 가 backend 를 모두 담고 있어 충돌이 없다. 시험 병합(`git merge-tree`)과 파일 차이를 보여 주고, 머지는 사용자 지시 뒤. 머지되면 backend 에서 작업 브랜치 `feat/backend/S15P31A102-100-api-common-base` 를 딴다(작업 폴더 `../S15P31A102-wt-100`). 이 계획은 `docs/plans/2026-10-22-api-common-base.md` 로 옮긴다
- [x] **① 오류 바탕** — `ErrorCode` · `ApiException` · `NotFoundException` · 오류 응답 만드는 곳 · `GlobalExceptionHandler`. 확인: `ErrorResponseTest`
- [x] **② 시각** — Instant → `+09:00` 바꾸는 도우미 하나. 확인: `TimeFormatTest`
- [x] **③ 목록** — `PageQuery` · `PageResponse`. 확인: `PageResponseTest`
- [x] **④ 보안** — `SecurityConfig` · 인증 오류도 같은 모양. 확인: `SecurityRulesTest` + 기존 `healthIsUpWithoutLogin`
- [x] **⑤ 정리 · 문서** — Querydsl 빼기, `docs/backend-convention.md`, `docs/api.md` 2 · 6절, `.claude/stack.md` 7절, `SSOT.md` 8절, Jira 100 설명. 확인: 빌드 · 테스트 전체, 문서 대조

## 바꿀 파일

패키지는 `kr.io.newlearn.common` 아래 (코드 약속 「여러 기능이 같이 쓰는 것은 common」).

① 오류 바탕
- `common/error/ErrorCode.java` — enum, 코드마다 HTTP 상태. `docs/api.md` 2절 표의 코드를 **지금 모두** 넣는다(화면용 · 내부용 · 위 프레임워크 넷). 두 사람이 기능 티켓마다 같은 enum 에 따로 더하면 머지 때 부딪쳐서다
- `common/error/ApiException.java` — `ErrorCode` 와 개발자용 `detail` 을 담는 예외. `NotFoundException` 은 그 아래, 404 코드만 받는다
- `common/error/FieldErrorItem.java`(record `field` · `reason`) · `common/error/ProblemDetails.java` — 오류 응답을 만드는 곳 하나. MVC 와 Security 가 같이 쓴다
- `common/error/GlobalExceptionHandler.java` — `@RestControllerAdvice`, `ResponseEntityExceptionHandler` 를 물려받는다. `code` 는 `handleExceptionInternal` 한 곳에서 붙인다(상태 → 코드). 입력 검사 셋(본문 `@Valid` · 파라미터 제약 · 타입이 틀린 값)과 읽을 수 없는 본문 · 빠진 파라미터는 `VALIDATION_FAILED` + `errors[]`. 타입이 틀린 칸도 한국어 `reason`. 예상 못 한 예외는 500 `INTERNAL_ERROR`, `detail` 은 고정 문구(내부 사정이 새지 않게)이고 서버 로그에만 원인을 남긴다. 보안 예외는 다시 던져 Security 가 처리하게 한다
- 테스트 `ErrorResponseTest` — `@WebMvcTest` + 테스트 안에만 있는 시험용 컨트롤러(`/probe/**`)

② 시각
- `common/web/ApiTime.java` — `Instant` → `+09:00` `OffsetDateTime`(초 단위로 자름 — `docs/api.md` 1절 예시 `2026-10-06T09:30:00+09:00` 모양). 빈 값은 빈 값
- 테스트 `TimeFormatTest` — 응답이 `+09:00`, 본문 · 쿼리의 오프셋 없는 시각 → 400 `VALIDATION_FAILED`, `+` 를 `%2B` 로 보낸 쿼리는 읽힘

③ 목록
- `common/web/PageQuery.java` — record `page`(기본 0, 0 이상) · `size`(기본 20, 1 ~ 100). 제약마다 한국어 `message`. 범위 밖이면 잘라 주지 않고 400. Spring 의 `Pageable` 인자는 범위 밖 값을 조용히 잘라서 쓰지 않는다
- `common/web/PageResponse.java` — record `items` · `page` · `size` · `totalElements` · `totalPages`, Spring `Page` 에서 만드는 정적 메서드
- 테스트 `PageResponseTest`

④ 보안 (인증 · 권한 코드 — 사람이 최종 확인한다, `AGENTS.md`)
- `common/security/SecurityConfig.java` — 로그인 없이 여는 것: `GET /actuator/health` · 둘러보기 `GET /api/v1/categories|issues|events|articles|search/**` · `GET /api/v1/dictionary` · `POST /api/v1/members`(가입) · `POST /api/v1/auth/login`. 나머지(`/internal/v1/**` 포함)는 로그인 필요. 인증 실패 → 401 `UNAUTHORIZED`, 권한 없음 · CSRF 실패 → 403 `FORBIDDEN`, 둘 다 ①과 같은 모양(`application/problem+json`, `instance` 포함). HTTP Basic · 폼 로그인 · 기본 `/logout` 끔, 요청 저장(401 마다 세션이 생기는 것) 끔. 오류 처리 경로(ERROR dispatch)는 연다
- 테스트 `SecurityRulesTest` — 열린 GET → 401 이 아니고 404 `NOT_FOUND`, 닫힌 주소 · 내부 주소 → 401, 번호표 없는 POST → 403. `/api/v1/categories` 처럼 `/**` 앞 주소 자체도 열리는지 고정
- `BackendApplicationTests` — 그대로(health 가 계속 열려 있는지 이 테스트가 본다)

⑤ 정리 · 문서
- `backend/build.gradle` — Querydsl 세 줄(`querydsl-jpa` · `querydsl-apt` · 그 처리기용 `jakarta.persistence-api`) 삭제. `config/QuerydslConfig.java` 삭제
- `docs/backend-convention.md` (새 문서) — Jira 100 의 코드 약속을 옮기고, 이번에 생긴 쓰는 법을 더한다: 없는 자원은 `NotFoundException(ErrorCode.…)`, 시각은 `ApiTime`, 목록은 `PageQuery` · `PageResponse`, 검증 어노테이션마다 한국어 `message`(빼면 영어 기본 문구가 샐 수 있다), 컨트롤러에 `@Validated` 를 붙이지 않는다
- `docs/api.md` — 2절 표에 프레임워크 코드 넷, 1절 「인증」에 「62 전까지 POST 는 번호표 없이 403」 한 줄, 6절 「아직 돌려 보지 않았다」를 테스트 결과로
- `.claude/stack.md` 7절 — 「백엔드 코드 약속」 줄. QueryDSL 언급이 있으면 지운다
- `SSOT.md` 8절 「API 인증」 — 둘러보기 · 가입 · 로그인 · 용어사전을 연 것(Jira 100). 내부 API 인증은 그대로 OPEN
- `docs/plans/2026-10-22-api-common-base.md` — 이 계획
- Jira 100 설명 — 코드 약속 절을 `docs/backend-convention.md` 를 가리키는 한 줄로

## 진행 중 바뀐 것 · 알게 된 것 (2026-10-22)

- 되돌림 확인: 새 클래스를 빼면 컴파일부터 깨져서, 101 처럼 구현을 한 줄씩 일부러 틀리는 방법으로 했다(① 5 · ② 4 · ③ 4 · ④ 6 가지). 정해진 값(enum) 문장 갈래를 지키는 테스트가 없다는 것이 이 과정에서 드러나 하나 더했다
- 시각: 문장을 더하기 전에도 오프셋 없는 시각은 400 `VALIDATION_FAILED` 와 칸 이름까지 맞게 나왔다. Jackson 설정 없이 Spring Boot 4 · Jackson 3 기본값으로 1절 「시간」 규칙이 지켜진다
- 목록: page 검사가 없으면 `-1` 이 `PageRequest.of` 에서 예외가 되어 400 이 아니라 500 이 난다
- 보안: HTTP Basic · 로그인 폼은 직접 만든 체인에서 처음부터 꺼져 있다(스프링 부트의 기본 체인만 켠다). 끄는 줄은 아무 일도 안 해서 두지 않고, 보안 필터 목록에 그 필터가 없는지를 테스트로 본다. `/logout` 은 기본으로 켜져 있어 끈다
- 다른 웹 테스트(오류 · 시각 · 목록)도 `@Import(SecurityConfig.class)` 로 실제 보안 설정 위에서 돌린다
- 실제 실행(확인용 DB · Redis 컨테이너, `SERVER_PORT=18080`): health 200 `UP`, 둘러보기 404 `NOT_FOUND`, 내 정보 · 내부 API 401 `UNAUTHORIZED`, 번호표 없는 POST 403 `FORBIDDEN`, 모두 `application/problem+json`
- 응답 JSON 에 `type` 칸이 없다. RFC 9457 은 `type` 이 없으면 `about:blank` 로 본다 → `docs/api.md` 2절 표를 이 사실에 맞춘다(⑤)
- 로그인 없이 번호표 없는 POST 를 보내면 403 과 함께 `JSESSIONID` 세션이 생긴다. 스프링 기본 CSRF 가 번호표를 세션에 두기 때문이다. Jira 62 의 번호표 쿠키(`csrf.spa()`)로 바뀌면 사라진다 → 62 에 적는다
- 남은 구멍(테스트로 안 봄): 쿼리의 `+` 는 실제 서버에서 공백으로 풀려 `%2B` 로 보내야 한다(MockMvc 는 재현 못 함), 본문 시각을 숫자(epoch)로 보내면 Jackson 이 받는다(검토 조수가 jar 에서 확인)

## 안 바꿀 것

- 화면 API(A1 ~ A19)의 컨트롤러 · 서비스 · 쿼리 — 기능 티켓
- 세션 저장(Redis) · `csrf.spa()` · 가입 · 로그인 · 로그아웃 — Jira 62
- 내부 API(`/internal/v1`) 인증 방식 — `SSOT.md` 8절 OPEN, Jira 30 · 34
- 마이그레이션 · 엔티티 · 리포지토리(101 것), `application.yaml`, `TestcontainersConfiguration`, `.gitlab-ci.yml`, `.env`
- frontend · ai 폴더
- Spring Boot 기본 `/error` 응답 — 필터 단계에서 터진 오류만 이리로 오고 `code` 가 없다. 「남은 구멍」으로 문서에 적고 고치지 않는다

## 리스크

- health 가 닫히면 compose · 쿠버네티스 헬스 체크가 실패한다 → `healthIsUpWithoutLogin` 이 잡는다
- 검사 오류가 세 갈래(본문 · 파라미터 · 타입)로 나뉘고, `message` 를 안 적은 제약은 기본 문구(영어일 수 있음)가 샌다 → 세 갈래를 테스트로 고정하고 약속 문서에 「`message` 필수」
- `code` 가 빠진 응답이 남을 수 있다 → 상태 → 코드 한 곳 매핑, 프레임워크 오류 넷을 테스트로 고정
- 시험용 컨트롤러 주소가 나중 실제 주소와 겹침 → `/probe/**` 로 두고 테스트 클래스 안에만 둔다
- 보안 설정이 뜻과 다르게 열리거나 닫힘 → 규칙 표를 테스트로 고정하고, MR 에서 사람이 최종 확인
- `build.gradle` 이 바뀌어 dev 머지 뒤 백엔드 이미지 굽기가 의존성을 다시 받는다(지난번 345초)
- BE 팀원이 이 MR 전에 기능 티켓을 시작하면 `common` 패키지가 겹친다 → 100 머지 뒤 시작하도록 Jira · 안내에 적는다

## 어떻게 검증하나

- 묶음마다 `/verify` — 포맷 검사 · 테스트 전체 통과 개수
- 되돌림 확인 — 새 클래스를 빼면 컴파일부터 깨지므로 101 처럼 일부러 틀려 본다: `code` 붙이는 줄 빼기 · 한국어 `message` 빼기 · `PageQuery` 범위 바꾸기 · health 허용 줄 빼기 · 진입점 빼기 → 해당 테스트가 단언에서 빨갛게. 원래대로 돌려 초록 확인
- 실제 실행 — 확인용 DB · Redis 컨테이너로 `./gradlew bootRun` 을 띄우고 `curl`:
  - `GET /api/v1/categories` → 401 이 아니고 404 `NOT_FOUND` 오류 JSON(아직 컨트롤러가 없어서)
  - `GET /api/v1/members/me` → 401 `UNAUTHORIZED`
  - `GET /actuator/health` → 200 `UP`
  - 없는 주소 → 404 오류 JSON, `Content-Type: application/problem+json`
- Jira 100 완료 기준 대조 — 오류 모양 · `VALIDATION_FAILED` 의 `errors[]` 한국어 · `+09:00` 과 오프셋 없는 입력 400 · 목록 모양과 범위 400 · 로그인 없이 여는 주소 · Boot 4 · Jackson 3 에서 테스트로 확인
- CI — MR 파이프라인 `w3:backend` 통과

## 되돌리는 법

- 머지 전: 작업 브랜치 · 작업 폴더를 지우면 끝
- backend 머지 뒤: MR 을 revert 한다. DB 마이그레이션이 없어 되돌릴 수 없는 것은 없다
- dev → backend 동기화 MR 도 revert 로 되돌린다(파일만 바뀐다)
