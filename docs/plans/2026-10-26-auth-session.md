# Jira 62 — 가입 · 로그인 · 로그아웃 (세션 · CSRF 번호표 · 실패 잠금)

## 무엇을 / 왜

A14 가입 · A15 로그인 · A16 로그아웃을 만든다(F12 회원 · 관심 분야). BE 팀원의 65(내 정보 · 관심 분야) · 63(스크랩) · 64(관심 이슈)가 로그인을 기다리고 있어 먼저 한다(2026-10-26 분배). 명세는 `docs/api-screen.md` A14 ~ A16, 규칙은 `docs/api.md` 1절 「인증」 — 세션 쿠키 · Redis 세션 · CSRF 번호표(`csrf.spa()`), JWT 안 씀(2026-10-21). 인증 코드라 사람이 최종 확인한다(`AGENTS.md`).

## 정한 것 (2026-10-26 사용자 선택)

| 항목 | 정한 것 |
|---|---|
| 아이디 | 영문 소문자 · 숫자 · `_`, 4 ~ 20자(`^[a-z0-9_]{4,20}$`). 어기면 400, 문장 「아이디는 영문 소문자 · 숫자 · _ 로 4~20자여야 해요」 |
| 실패 잠금 | 같은 아이디로 **5번 연속 틀리면 1분 잠금**. 잠긴 동안은 비밀번호가 맞아도 **429 `TOO_MANY_REQUESTS`**(「로그인을 5번 틀려 1분 뒤에 다시 할 수 있어요」). 없는 아이디도 똑같이 세어 있는지 여부를 드러내지 않는다. 횟수는 Redis(`login-fail:{아이디}`, 마지막 실패 뒤 10분 기억), 성공하면 지운다. 주소별 요청 수 상한은 이번에 안 하고 인프라 입구(Envoy)에서 따로(`SSOT.md` 8절에 남김) |
| 로그인 유지 | **로그인한 때부터 하루** — 세션 쿠키 `Max-Age` 1일 + Redis 세션 비활동 만료 1일. 브라우저를 닫아도 하루 동안 남는다 |
| 진행 | 시험 먼저로 다 만든 뒤, 끝나면 파일별 코드 캡처 + 설명 글(zoo_docs learn)을 쓰고 사람 최종 확인은 그 글을 보며 한다 |
| 비밀번호 해시 | `PasswordEncoderFactories.createDelegatingPasswordEncoder()` — 지금 기본 bcrypt, 저장값 앞에 `{bcrypt}` 가 붙어 나중에 바꿀 수 있다. 없는 아이디로 로그인할 때도 가짜 해시와 비교해 걸리는 시간을 맞춘다 |
| 세션 저장 | Spring Session Redis(Boot 4 모듈 `spring-boot-starter-session-data-redis` — 구현 때 Maven Central 에서 이름 · 판 확인). Redis 는 `noeviction` · AOF 라 세션이 밀려나거나 재시작에 사라지지 않는다 |
| 쿠키 | 세션 쿠키 `HttpOnly` · `SameSite=Lax` · 사이트에서는 `Secure`(env `SESSION_COOKIE_SECURE=true`, 로컬은 false — Envoy 가 TLS 를 풀어 앱은 http 로 받아서 직접 정한다). 번호표 쿠키 `XSRF-TOKEN` 은 화면이 읽어야 해 `HttpOnly` 아님, `Secure` 는 같은 env |
| 첫 번호표 | 화면이 첫 POST(가입 · 로그인) 전에 `XSRF-TOKEN` 을 갖게 한다. `csrf.spa()` 가 응답마다 쿠키를 주는지 시험으로 보고, 안 주면 모든 응답에서 번호표를 꺼내 쿠키로 내보내는 필터 하나를 더한다(Spring 문서의 SPA 방식) |
| 로그인한 회원 꺼내기 | `MemberPrincipal(id, loginId, name)` record 를 인증 주체로 세션에 넣고, 컨트롤러는 `@AuthenticationPrincipal MemberPrincipal me` 로 받는다 — 65 · 63 · 64 가 그대로 쓴다. 시험에서 로그인 상태 만드는 법은 `backend-convention.md` 5절에 적는다 |
| 세션 고정 막기 | 가입 · 로그인으로 세션을 열 때 `request.changeSessionId()` 로 세션 ID 를 새로 낸다(`api-screen.md` A15) |
| Swagger | 새 태그 「회원」(카테고리 · 이슈 · 기사 다음), A14 ~ A16 에 `[확정]`. Swagger 화면에서 POST 를 눌러 볼 수 있게 `springdoc.swagger-ui.csrf.enabled: true`(쿠키 값을 헤더로 붙여 줌) |
| 티켓 · 흐름 | Jira 62 (진행 중으로). 브랜치 `feat/backend/S15P31A102-62-auth-session` ← `origin/backend` → MR → backend → dev → 태그 MR → 사이트. 계획 승인 = 검증 뒤 머지해도 된다는 지시(머지 직전마다 원격 dev · 열린 MR 확인) |

## 바꿀 파일

- `backend/build.gradle` — Spring Session Redis 의존성
- `backend/src/main/resources/application.yaml` — 세션 시간 · 쿠키(`server.servlet.session.*`), `springdoc.swagger-ui.csrf.enabled`
- `backend/src/main/java/kr/io/newlearn/common/security/SecurityConfig.java` — `csrf.spa()`, 세션 컨텍스트 저장소, `PasswordEncoder` 빈, (필요하면) 번호표 쿠키 필터
- 새 `common/security/MemberPrincipal.java`, (필요하면) `common/security/CsrfCookieFilter.java`
- 새 `member/MemberController.java`(A14) · `member/MemberService.java` · `member/dto/SignUpRequest.java` · `member/dto/MemberResponse.java`, `member/MemberRepository.java`(아이디로 찾기 · 있나) · `member/MemberCategoryRepository.java`(회원의 분야 읽기)
- 새 `auth/AuthController.java`(A15 · A16) · `auth/AuthService.java` · `auth/LoginAttemptGuard.java`(Redis 실패 횟수 · 잠금) · `auth/dto/LoginRequest.java`
- `common/error/ErrorCode.java` — `TOO_MANY_REQUESTS(429)`
- `common/web/OpenApiConfig.java` — 태그 「회원」
- 시험: 새 `MemberAuthApiIntegrationTest`(Testcontainers — 가입 · 로그인 · 로그아웃 · 잠금 · 세션이 Redis 에 있고 만료 1일), 새 `auth/LoginAttemptGuardTest`, `common/security/SecurityRulesTest`(번호표 없는 POST 403 · 첫 번호표 쿠키), `OpenApiDocsTest`(POST 작업도 보게 `op(path, method)`, 회원 셋 `CONFIRMED`)
- 인프라: `infra/k8s/services/app/backend.yaml` 의 env 에 `SESSION_COOKIE_SECURE=true`
- 문서: `docs/api-screen.md` A14(아이디 규칙) · A15(잠금 429), `docs/api.md` 1절 인증(로그인 유지 하루 · 첫 번호표 받는 법) · 2절(`TOO_MANY_REQUESTS`) · 4절 FE 7번에 정해진 것, `SSOT.md` 8절 「API 인증」 줄(실패 잠금 · 세션 정함 → 남는 것은 내부 API 인증 · 주소별 요청 수 상한), `docs/backend-convention.md` 5절(로그인한 회원 꺼내기 · 시험에서 로그인 · 번호표), 새 `docs/specs/F12-member-auth-api.md`(성공 기준 AC)
- 승인한 계획 사본: `docs/plans/2026-10-26-auth-session.md`

## 작업 순서 (커밋 넷, 모두 실패하는 시험 먼저)

- [x] ① 세션 · CSRF 바탕 — 의존성 · 설정 · `SecurityConfig` · `MemberPrincipal` · 쿠키 env. 시험: 번호표 없는 POST 403(오류 모양 같음), 공개 GET 응답에 `XSRF-TOKEN` 쿠키, 기존 `SecurityRulesTest` 그대로 통과
- [x] ② A14 가입 — 201 + `Location` + 회원 정보 + 세션, 아이디 규칙 · 비밀번호 8자 · 이름 · 분야 1개 이상(중복 합침) 위반 400(`errors` 한국어), 없는 분야 코드 400, 겹치는 아이디 409(동시 가입의 유일 키 충돌도 409), 비밀번호는 해시만
- [x] ③ A15 로그인 · A16 로그아웃 · 잠금 — 200 + 회원 정보 + 새 세션 ID, 틀림 · 없는 아이디 401 `LOGIN_FAILED`, 5번째 뒤 429 · 1분 뒤 풀림 · 성공하면 초기화, 로그아웃 204 · 세션 없이 401 · 로그아웃 뒤 그 세션으로 401, 세션이 Redis 에 있고 TTL 이 하루
- [x] ④ Swagger 회원 태그 · `[확정]` · 문서 · 스펙 · 계획 사본 · 인프라 env

## 안 바꿀 것

- A17 · A18(내 정보 · 관심 분야 바꾸기) — Jira 65(BE 팀원)
- 스크랩 · 관심 이슈 — 114 · 63 · 64
- 내부 API(`/internal/v1`) 인증 방식 — 30 에서(`SSOT.md` 8절에 남김). 지금처럼 막아 둔다
- 주소별 요청 수 상한(Envoy) · 비밀번호 찾기 · 회원 탈퇴 · 소셜 로그인
- `member` · `member_category` 표(V2 그대로, 새 마이그레이션 없음)
- 화면(frontend) 코드 — 번호표 · 쿠키는 axios 기본값이라 화면은 바꿀 것이 없다. FE 에는 메시지로 알린다

## 리스크

- **인증 코드 실수로 열리면 안 되는 주소가 열림** → 기존 `SecurityRulesTest`(손님 401 · 내부 API 잠김 · Basic 꺼짐)를 그대로 통과시키고, 새 규칙도 시험으로. 머지 전에 사람이 설명 글을 보며 최종 확인
- **번호표를 켜면 기존 POST 가 막힘** → 지금 화면이 부르는 POST 는 없다(A1 · A2 만 부름). 둘러보기는 GET 이라 영향 없음. Swagger 의 POST 는 `csrf.enabled` 로 해결
- **Redis 를 작업 큐와 같이 씀** → 세션 하나는 1KB 안팎, 하루 만료가 걸린다(시험으로 TTL 확인). `maxmemory 1gb` · `noeviction` 이라 꽉 차면 쓰기가 실패한다 — 지금 사용량은 작다
- **사이트에서 쿠키 Secure 가 안 붙음** → env 로 직접 켠다. 배포 뒤 응답 머리로 확인
- **Spring Session · Security 7.1 설정 이름이 Boot 3 와 다를 수 있음** → 시험이 먼저라 틀리면 빨갛게 드러남. 공식 문서로 확인
- **사이트에서 실제 가입 · 로그인 확인** → 운영 사이트에 시험 계정을 만들거나 비밀번호를 넣는 것은 내가 하지 않는다. 가입 · 로그인 전체 흐름은 로컬(`bootTestRun`, localhost)에서 확인하고, 사이트는 계정 없이 되는 것만 본다. 실제 가입은 사용자가 화면 · Swagger 로

## 어떻게 검증하나

- 기계: verifier 조수로 포맷 · 시험 전체(돈 수를 적음). 커밋마다 새 시험의 되돌림 확인(구현을 고치기 전으로 → 단언에서 빨강)
- 로컬 실행(`./gradlew bootTestRun`, localhost:18080, 시험 값만): `GET /api/v1/categories` → `XSRF-TOKEN` 쿠키 → 그 값을 헤더로 가입 201 · `SESSION` 쿠키(HttpOnly · SameSite · Max-Age 86400) → 로그아웃 204 → 같은 쿠키로 로그아웃 401 → 로그인 200 → 틀린 비밀번호 5번 → 429 → 1분 뒤 성공. 시험 Redis 에 `spring:session:sessions:*` 키와 TTL
- 사이트(태그 MR 뒤, 계정 없이): Swagger 에 회원 태그 · `[확정]` 셋, 공개 GET 응답의 `XSRF-TOKEN` 쿠키(Secure), 번호표 없는 `POST /api/v1/auth/login` → 403 `FORBIDDEN`, 번호표 있고 세션 없는 로그아웃 → 401, health 200
- 스펙 성공 기준: 새 `docs/specs/F12-member-auth-api.md` 의 AC 마다(가입 · 로그인 · 로그아웃 · 잠금 · 세션 유지 · 번호표) 시험 이름으로 짚는다
- 사람 최종 확인: 설명 글(파일별 코드 · 요청 흐름 그림)을 보고 사용자가 OK 한 뒤 dev 로 머지

## 되돌리는 법

- MR Revert(backend · dev) → 다음 태그 MR 로 옛 이미지. 로그인 API 가 없던 상태로 돌아간다
- Redis 에 남은 세션 · 실패 횟수 키는 하루 · 10분 뒤 저절로 사라진다
- 사이트에서 사람이 만든 회원 행은 `member` 에 남는다(지우는 것은 사람이 정함)
- 🔴 되돌릴 수 없는 것: 없음(표 구조 변경 없음)

## 하면서 달라진 것 (2026-10-26)

- 번호표 쿠키 필터는 만들지 않았다 — `csrf.spa()` 만으로 번호표 쿠키가 없는 요청의 응답마다 `XSRF-TOKEN` 이 붙는 것을 시험으로 확인했다(`SecurityRulesTest.anyResponseHandsOutCsrfTokenCookie`)
- `LoginAttemptGuardTest` 를 따로 두지 않았다 — 잠금 · 초기화 · 없는 아이디 세기를 실제 Redis 로 `MemberAuthApiIntegrationTest` 가 본다
- spring-security-test 의 `.with(csrf())` 가 공용 CSRF 필터를 바꿔 뒤 시험을 깨뜨려, 쿠키 + 헤더를 붙이는 `TestCsrf.csrfToken()` 으로 바꿨다(`docs/backend-convention.md` 5절)
- `spring.session.timeout: 1d` 를 따로 두었다. Spring Boot 4.1.1 은 내장 서버로 뜰 때만 `server.servlet.session.timeout` 을 Redis 세션 만료로 대신 쓰고, 내장 서버 없는 MockMvc 시험에서는 30분이 되어 시험이 잡았다
- 쿠키 속성은 MockMvc 에 안 보여 실제 서버로 띄우는 `SessionCookieHttpTest` 를 더했다
- 칸별 입력 오류를 서비스에서도 내려고 공용 `common/error/ApiException` 에 `errors` 를 실을 수 있게 하고 `GlobalExceptionHandler` 가 그것을 응답에 넣게 했다(계획의 「바꿀 파일」에 없던 공용 파일, 기존 생성자는 그대로)
- 리뷰(2026-10-26)로 고친 것: ① 한꺼번에 보낸 로그인이 잠금 확인을 함께 지나 모두 비밀번호를 맞춰 봤다 → 맞춰 보기 전에 Redis 스크립트 하나로 시도를 예약해 5번까지만 비교 ② 이름 상한이 없어 큰 이름이 하루 동안 Redis 세션에 남을 수 있었다 → 20자 ③ 공백만으로 된 비밀번호는 가입되지만 로그인은 400 → 가입에서 막음 ④ 로그아웃 때 번호표 교체를 보는 시험이 없었다 → 더함. 요청 본문이 로그에 찍힐 때 비밀번호를 가리게 `toString` 도 바꿨다
