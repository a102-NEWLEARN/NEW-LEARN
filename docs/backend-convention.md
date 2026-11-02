# 백엔드 코드 약속

모든 BE 티켓이 따른다. 사람이 쓰든 AI 도구(Claude Code · Codex)로 쓰든 같다. 처음 정한 곳은 Jira S15P31A102-100(2026-10-21)이고, 쓰는 법은 같은 티켓에서 만든 공통 코드(`kr.io.newlearn.common`, 2026-10-22)를 기준으로 적었다.

API 의 모양(주소 · 오류 코드 · 시간 · 목록)은 `docs/api.md`, 테이블은 `docs/data-model.md` 가 정한다. 이 문서는 그것을 코드로 옮기는 법만 다룬다.

## 1. 폴더와 층

- 패키지는 기능별로 평평하게 둔다: `kr.io.newlearn.<기능>` 안에 `XxxController` · `XxxService` · `XxxRepository` · 엔티티, 요청 · 응답은 `<기능>.dto`. 여러 기능이 같이 쓰는 것은 `kr.io.newlearn.common`
- 층은 컨트롤러 → 서비스 → 리포지토리 한 방향이다. 컨트롤러는 리포지토리를 직접 부르지 않는다. 규칙(없으면 404, 투입 전 기사 빼기 등)은 서비스에 둔다
- 의존성은 생성자로 받는다. 필드에 `@Autowired` 를 쓰지 않는다
- 만드는 순서: 테스트 → DTO → 리포지토리 → 서비스 → 컨트롤러

## 2. 엔티티

- Lombok 은 `@Getter` · `@NoArgsConstructor(access = AccessLevel.PROTECTED)` 만 쓴다. `@Setter` · `@Data` 는 쓰지 않는다
- 행을 만드는 생성자는 필수 칸을 받는 public 생성자 하나다. 값을 바꾸는 일은 이름 있는 메서드로 한다(예: `release(Instant)`)
- 연관은 `@ManyToOne(fetch = FetchType.LAZY)` 부터 둔다. 양방향은 필요할 때 더한다
- 시각은 `Instant` (칸은 `timestamptz`). 만든 · 고친 시각은 `@CreationTimestamp` · `@UpdateTimestamp`
- 정해진 값 칸은 Java enum + `@Enumerated(EnumType.STRING)` 이고, 마이그레이션에 같은 값의 `CHECK` 를 둔다. ORDINAL(순서 번호 저장)은 쓰지 않는다 — enum 순서를 바꾸면 옛 값의 뜻이 바뀐다
- 칸 타입 짝: `smallint` → `short`, `jsonb` → `String` + `@JdbcTypeCode(SqlTypes.JSON)`(빼면 앱이 뜨지 않는다), `text[]` → `List<String>` + `@JdbcTypeCode(SqlTypes.ARRAY)`(빈 목록으로 시작)
- 두 칸을 합친 키는 `@EmbeddedId` 일반 클래스(`Serializable`, `equals` · `hashCode`). 키 칸이 외래 키이기도 하면 `@MapsId`
- 테이블은 Flyway 마이그레이션만 바꾼다(`ddl-auto: validate`). 번호 · 바꾸는 법은 `docs/data-model.md` 7절. 예시는 `backend/src/main/java/kr/io/newlearn/` 의 엔티티들

## 3. 요청 · 응답

- 요청 · 응답은 Java `record` 다. 엔티티를 그대로 내보내지 않는다
- 시각: 응답 DTO 로 옮길 때 `ApiTime.toKst(entity.getPublishedAt())` 를 쓴다. `+09:00` · 초 단위 `OffsetDateTime` 이 된다. 요청 시각은 `OffsetDateTime` 으로 받는다 — 오프셋이 없으면 따로 검사하지 않아도 400 이다. `spring.jackson.time-zone` 은 두지 않는다(두면 모든 시각이 그 시간대로 바뀐다)
- 목록: `@Valid PageQuery query` 로 받고 `query.toPageable(Sort.by(…))` 로 리포지토리를 부른 뒤 `PageResponse.from(page.map(XxxResponse::from))` 로 돌려준다. 행 묶음을 조립기로 한꺼번에 만들면 `PageResponse.of(page, 조립한 항목)`. Spring 의 `Pageable` 인자를 바로 받지 않는다 — 범위 밖 값을 400 대신 조용히 고친다
- 입력 검사: 검증 어노테이션마다 `message` 에 화면에 그대로 보일 한국어 문장을 쓴다(예: `@Size(max = 20, message = "이름은 20자까지예요")`). 이 문장이 `errors[].reason` 이 된다. 빼면 기본 문구(영어일 수 있다)가 나간다
- 공개 입력의 글자가 SQL 에 닿으면 U+0000(NUL)을 먼저 본다 — PostgreSQL 이 이 글자를 받지 못해 500 이 난다. 검색어는 `QueryText.normalize`, 그 밖의 칸은 `QueryText.containsNul` 로 보고 그 칸의 계약 답(없는 코드 404 · 400 `errors[칸]` · 없는 아이디 401)을 준다(2026-10-30)
- 컨트롤러 클래스에 `@Validated` 를 붙이지 않는다. 붙이면 다른 예외가 나서 400 이 아니라 500 이 된다
- 쿼리 파라미터에 `+` 가 들어가면(시각의 `+09:00`) `%2B` 로 보낸다. 서버는 쿼리의 `+` 를 공백으로 읽는다

## 4. 오류

- 없는 자원: `throw new NotFoundException(ErrorCode.ISSUE_NOT_FOUND, "이슈를 찾을 수 없다: " + issueId);` → 404 와 `code`
- 그 밖에 우리가 고르는 실패: `throw new ApiException(ErrorCode.LOGIN_ID_TAKEN, "…");`
- `ErrorCode` 에는 `docs/api.md` 2절 표의 코드가 모두 있다. 새 코드가 필요하면 2절 표와 `ErrorCode` 를 같은 MR 에서 고친다
- 두 번째 인자(`detail`)는 개발자용 설명이다. 화면 문구는 화면이 `code` 를 보고 고른다
- 나머지는 공통 처리기가 한다(`common/error/GlobalExceptionHandler`): 스프링이 내는 오류에 상태 이름 코드 붙이기, 입력 오류의 `errors[]`, 예상 못 한 오류를 500 `INTERNAL_ERROR` 로 바꾸고 원인은 로그에만 남기기. Tomcat 이 쿼리 인자를 못 읽은 오류(`InvalidParameterException` — UTF-8 이 아닌 퍼센트 인코딩 등)는 Tomcat 이 준 상태(보통 400)와 `VALIDATION_FAILED` 로 바꾼다(2026-10-30). 상태가 4xx · 5xx 가 아니면 400(2026-11-02)
- 아직 막지 않은 구멍
  - 필터 단계에서 터진 오류는 스프링 기본 `/error` 응답으로 가서 `code` 가 없다
  - 본문 시각을 숫자(epoch)로 보내면 받아들인다. 지금 시각을 받는 API 는 내부 W1 뿐이다

## 5. 보안

- 로그인 없이 여는 주소는 `common/security/SecurityConfig` 한 곳에 있다. 새 공개 API 를 만들면 이 파일과 `SecurityRulesTest` 를 같은 MR 에서 고친다
- 인증 · 권한 코드를 고치면 사람이 최종 확인한다(`AGENTS.md`)
- 로그인은 세션(Redis, 하루)이고 CSRF 는 번호표 쿠키(`csrf.spa()`)다(`docs/api.md` 1절 「인증」, Jira 62). 세션을 여닫는 일은 `auth/LoginSessions` 한 곳이 한다 — 세션 ID 새로 내기 · 번호표 새로 주기가 거기 있다
- 로그인한 회원은 컨트롤러 인자 `@AuthenticationPrincipal MemberPrincipal me` 로 받는다(`common/security/MemberPrincipal` — `id` · `loginId` · `name`). 로그인이 필요한 주소면 손님은 `SecurityConfig` 가 먼저 401 로 막는다. 로그인 없이 여는 주소에서는 `me` 가 null 일 수 있다
- POST · PUT · DELETE 테스트에는 `.with(TestCsrf.csrfToken())` 을 넣는다(번호표 쿠키 + 같은 값의 헤더). spring-security-test 의 `.with(csrf())` 는 쓰지 않는다 — 공용 CSRF 필터의 저장소를 세션용으로 바꿔 놓아 뒤에 도는 테스트가 엉뚱하게 깨진다(2026-10-26)
- 직원용 문(`/internal/**` — W1 · B1)은 체인이 따로다(`common/security/InternalApiSecurityConfig`, Jira 30). 세션 · CSRF 번호표 없이 `X-Internal-Key` 출입증으로만 연다 — 워커 키는 `/internal/v1/analysis-jobs/**`, 배치 키는 `/internal/v1/articles/**`. 새 직원용 주소는 `InternalApiSecurityConfig` 의 규칙과 `SecurityRulesTest` 를 같은 MR 에서 고친다(규칙에 없는 주소는 어느 키로도 403). 테스트는 `newlearn.internal.worker-key` · `batch-key` 를 시험 값으로 주고 `.header(InternalKeyFilter.HEADER, 키)` 를 붙인다. `.with(TestCsrf.csrfToken())` 은 붙이지 않는다. 직원용 컨트롤러는 동기로 답한다 — 비동기 응답은 아직 시험하지 않았다
- 테스트에서 로그인 상태는 가입 · 로그인 API 를 실제로 불러 받은 `SESSION` 쿠키를 다음 요청에 붙여 만든다. 예시: `MemberAuthApiIntegrationTest` 의 `signUp` · `login` · `sessionCookie`. 쿠키 속성(`HttpOnly` · `Secure` · `Max-Age`)은 MockMvc 가 못 보므로 실제 서버로 띄우는 `SessionCookieHttpTest` 에서 본다

## 6. 조회 쿼리 · 트랜잭션

- 쿼리는 Spring Data 메서드 이름 → 안 되면 `@Query`(JPQL) → 집계가 복잡하면 네이티브 SQL 순서로 고른다. QueryDSL 은 쓰지 않는다(2026-10-22 의존성을 뺐다)
- 목록에서 항목마다 따로 쿼리하지 않는다(N+1)
- 조회 서비스는 클래스에 `@Transactional(readOnly = true)`, 쓰는 메서드만 `@Transactional`
  - 예외: 로그인(`AuthService`)처럼 bcrypt 비교 · Redis 호출을 하는 서비스는 클래스 트랜잭션을 두지 않는다 — 그동안 DB 연결을 잡으면 동시 로그인이 연결 풀(기본 10개)을 다 써 다른 API · readiness 의 DB 검사가 기다린다(2026-11-02 Jira 144)

## 7. 테스트

- 실패하는 테스트를 먼저 쓴다(`AGENTS.md`)
- 컨트롤러: `@WebMvcTest` + `@Import(SecurityConfig.class)` 로 응답 JSON 모양을 본다. `SecurityConfig` 를 빠뜨리면 스프링 기본 보안 위에서 돌아 엉뚱하게 통과한다. 예시: `common/error/ErrorResponseTest` · `common/security/SecurityRulesTest`
- 쿼리 · 매핑: `@DataJpaTest` + `@AutoConfigureTestDatabase(replace = NONE)` + `@Import(TestcontainersConfiguration.class)` 로 실제 PostgreSQL 에서 본다(로컬 Testcontainers, CI 는 services). 저장한 뒤 `flush()` · `clear()` 하고 다시 읽는다. 예시: `CoreMappingTest`

## 8. Swagger 문서

`/swagger-ui.html` 은 컨트롤러 annotation 으로 만든 명세의 사본이다(원본은 `docs/api.md`). FE 가 이것을 보고 쓴다.

- 컨트롤러 클래스에 `@Tag(name = OpenApiConfig.TAG_…)` 를 단다. 새 묶음이 필요하면 `OpenApiConfig` 의 `tags` 에 화면 순서로 더한다
- 작업마다 `@Operation(summary, description)`, 인자마다 `@Parameter(description)` 를 단다. 목록 인자는 `@ParameterObject @Valid PageQuery query` 로 받아 `page` · `size` 로 펼친다
- 오류는 `@ApiResponse(responseCode = "404", description = "코드 — 언제", content = @Content(mediaType = OpenApiConfig.PROBLEM_JSON, schema = @Schema(implementation = ApiProblem.class)))` 로 적는다. 오류 응답을 하나라도 적으면 `@ApiResponse(responseCode = "200", description = "성공")` 도 적는다 — 안 적으면 성공 응답이 문서에서 빠진다
- `@Parameter` 에 `schema = @Schema(…)` 를 직접 주면 자바 타입을 읽지 않고 문자열로 보인다. 숫자면 `type = "integer"` 를 같이 적는다
- summary 앞 `[확정] A번호` 는 명세대로 만들고 시험을 마친 작업에만 붙인다. 붙일 때 `OpenApiDocsTest` 가 확인하게 한다 — GET 은 `CONFIRMED` 에 경로를 더하고, POST · PUT · DELETE 는 작업마다 응답 코드까지 보는 시험을 둔다(예: `memberApisAreConfirmedWithTheirResponses`). 표시가 없으면 「만드는 중이라 바뀔 수 있음」이다(`OpenApiConfig` 뜻풀이)
- 내부 API(`/internal/**`)는 문서에 넣지 않는다(`application.yaml` 의 `springdoc.paths-to-exclude`)

## 9. null · 컴파일 경고

`backend/build.gradle` 이 컴파일 안에서 javac 경고(`-Xlint:all`) · Error Prone(버그 패턴) · NullAway(null 검사)를 돌린다. 경고 하나도 컴파일 실패다 — 커밋 게이트 · CI 의 「린트」가 이것이다(Jira 124).

- main 의 `kr.io.newlearn` 아래 모든 패키지를 NullAway 가 본다. 새 패키지도 따로 할 일 없이 들어간다. 표시가 없는 칸 · 인자 · 반환은 null 이 아니라고 본다
- 비어 있을 수 있는 곳에만 `org.jspecify.annotations.Nullable` 을 단다. 자리는 타입 바로 앞이다: `private @Nullable Instant releasedAt;` · `@Nullable String detail` · `public @Nullable String problem()`. 안쪽 타입은 `AnalysisJobRepository.@Nullable StateView`
  - 엔티티: 마이그레이션에 `not null` 이 없는 칸에 단다. Lombok `@Getter` 가 getter 에도 옮긴다
  - DB 가 채우는 칸(`@Id` · `@CreationTimestamp` · `@UpdateTimestamp`)은 달지 않는다 — 「생성자가 채우나」 검사에서만 뺐다. 그래서 저장 전에 `getId()` 를 부르면 NullAway 가 못 잡는다. 엔티티의 인자 없는 생성자(JPA 용)도 그 검사에서 뺐다
  - 응답 record: null 로 나갈 수 있는 칸(`docs/api-screen.md` 에 「· null」인 칸, 예: `ArticleDetailResponse.event` · `IssueCardResponse.firstEventAt`)에 단다
  - null 이 들어오면 null 을 돌려주는 도우미는 `@Contract("!null -> !null")`(`org.springframework.lang.Contract`)을 같이 단다 — 부르는 곳마다 null 확인이 번지지 않는다. 본문이 약속을 지키는지도 검사한다. 예: `ApiTime.toKst`
- JDBC · JDK 처럼 표시가 없는 라이브러리 값은 NullAway 가 non-null 로 본다. 비어 올 수 있는 칸은 받는 자리에서 `@Nullable` 로 받는다(예: `IssueQueryRepository` 의 `nullableInstant` — 사건이 없는 이슈의 `min(e.occurred_at)`). 그 값에 `@Contract` 도우미를 바로 씌우면 null 이 가려진다
- 요청 record(JSON 으로 받는 칸) · `@RequestParam(required = false)` · Spring Data 조회 뷰의 칸은 아직 표시하지 않았다. 비어 올 수 있으니 쓰기 전에 확인한다(예: `JobResultRequest.problem()`)
- 테스트(`src/test`)는 NullAway 가 보지 않는다 — 일부러 null 을 넘기는 시험이 많다. javac 경고 · Error Prone 은 본다
- 검사를 꼭 꺼야 하면 가장 좁은 자리(메서드 · 지역 변수)에 `@SuppressWarnings("<검사 이름>")` 을 달고 바로 위에 까닭 한 줄을 쓴다. 예: `AnalysisJobRecovery` 의 `NullAway`(제네릭 콜백의 null), `InternalKeyFilter` 의 `ArrayRecordComponent`
- `Serializable` 을 구현하면 `@Serial private static final long serialVersionUID = 1L;` 을 둔다(예외 클래스 · 복합 키)

