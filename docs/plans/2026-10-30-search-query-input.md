# A13 통합 검색 · A19 용어사전 남은 손질 — 깨진 쿼리 인자 · NUL 400, 주석, AC-6 시험

2026-10-30 사용자 승인. 브랜치 `fix/backend/S15P31A102-43-query-input`(`origin/backend` bebc4b3 에서). Jira 43 의 후속이라 새 티켓은 만들지 않는다.

## 무엇을 / 왜

A13 통합 검색(`GET /api/v1/search`)과 A19 용어사전(`GET /api/v1/dictionary`)을 사이트에 올린 뒤 리뷰 · 로컬 실행에서 남은 셋을 한 MR 로 고친다. 사이트에서 오늘 다시 재 보니 아래와 같다.

| 요청 | 지금 사이트 | 바꾼 뒤 |
|---|---|---|
| `search?q=%B3%AA%B9%AB` (cp949 「나무」) | 500 `INTERNAL_ERROR` | 400 `VALIDATION_FAILED` |
| `search?q=%ZZ` (깨진 퍼센트) | 500 | 400 |
| `search?q=%00` (NUL) | 500 — PostgreSQL 이 NUL 글자를 못 받음 | 400 + `errors[q]` |
| `dictionary?q=%B3%AA%B9%AB` | 500 | 400 |
| `dictionary?q=%00` | 200, `query` 에 NUL 을 그대로 돌려주고 사전을 한 번 부름 | 400 + `errors[q]`, 사전 안 부름 |

원인은 둘이다.
- 깨진 퍼센트 인코딩: Tomcat 11 은 쿼리 인자를 못 읽으면 `org.apache.tomcat.util.http.InvalidParameterException`(`IllegalStateException` 하위, `getErrorCode()` 기본 400)을 던진다. 스프링이 `@RequestParam` 을 읽을 때 터져 공통 처리기의 「그 밖의 오류」로 가서 500 과 ERROR 스택 로그가 남는다. 모든 API 공통이다(tomcat-embed-core 11.0.24 jar 에서 확인)
- NUL: 검색어 규칙(`common/web/QueryText`)이 U+0000 을 거르지 않는다

## 정할 것 (승인 때 같이)

- NUL 오류 문구는 기존처럼 기능마다 넘긴다(`QueryText.normalize` 에 세 번째 문구). 검색 「검색어에 쓸 수 없는 글자가 들어 있어요」 · 용어사전 「찾을 단어에 쓸 수 없는 글자가 들어 있어요」. 화면 검색창에서는 칠 수 없는 글자라 주로 Swagger · 다른 호출자에게 보인다
- 거르는 글자는 U+0000 하나다. Jira 56(W1 봉투)과 같은 기준이다. 다른 제어 글자는 DB 가 받아서 그냥 결과 없음이 된다
- 깨진 인코딩의 400 에는 `errors` 를 싣지 않는다. 어느 인자인지는 Tomcat 이 메시지 글자로만 알려 준다. 깨진 JSON 과 같은 처리다(`ErrorResponseTest.brokenJsonIsValidationFailed`)

## 바꿀 파일

- `backend/src/main/java/kr/io/newlearn/common/error/GlobalExceptionHandler.java` — `@ExceptionHandler(InvalidParameterException.class)`: 상태는 `ex.getErrorCode()`(400, 요청 본문이 너무 크면 Tomcat 이 413), detail 은 고정 문장(「쿼리 인자를 읽지 못했다 — UTF-8 이 아닌 퍼센트 인코딩 · 깨진 인자 · 너무 많거나 큰 인자」). code 는 기존 `handleExceptionInternal` 이 상태로 붙인다(4xx → `VALIDATION_FAILED`). 4xx 라 ERROR 로그를 남기지 않는다
- `backend/src/main/java/kr/io/newlearn/common/web/QueryText.java` — strip · NFC 뒤 U+0000 이 있으면 400 + `errors[q]`(넘겨받은 세 번째 문구). 머리 주석에 NUL 까닭 한 줄
- `backend/src/main/java/kr/io/newlearn/search/SearchService.java` · `dictionary/DictionaryService.java` — NUL 문구 상수 하나씩, `normalize` 에 넘기기
- `backend/src/main/java/kr/io/newlearn/search/SearchController.java` · `dictionary/DictionaryController.java` — Swagger 400 설명에 「U+0000 이 들어 있음 · 쿼리를 UTF-8 로 읽을 수 없음」
- `backend/src/main/java/kr/io/newlearn/search/SearchQueryRepository.java` 11줄 — 주석을 「LIKE '%'||q||'%' 면 % 는 모든 제목, _ 는 아무 한 글자, 끝의 \ 는 닫는 % 를 글자로 만들어 결과가 조용히 틀어진다」로(스펙 동작 2 와 같게)
- 시험
  - 새 `backend/src/test/java/kr/io/newlearn/QueryEncodingHttpTest.java` — 실제 Tomcat(RANDOM_PORT)으로 A13 · A19 에 `%B3%AA%B9%AB` · `%ZZ` 를 날것 그대로 보내 400 · `application/problem+json` · `VALIDATION_FAILED` · `errors` 없음. MockMvc 는 쿼리를 UTF-8 로 미리 풀어 버려 재현이 안 된다. `SessionCookieHttpTest` 와 어노테이션을 똑같이 둬 띄운 서버(컨텍스트 · 컨테이너)를 같이 쓴다. 출력 캡처로 「처리하지 못한 오류」 ERROR 로그가 없는지도 본다(고치기 전에 실패하는지 먼저 확인하고, 캡처가 로그를 못 잡으면 이 단언은 뺀다). → 뺐다: 그 로그는 5xx 일 때만 남아 400 단언이 통과하면 늘 성립한다(reviewer 지적). `%ZZ` 는 `java.net.URI` 가 보내기 전에 막아 시험에서 빼고 로컬 curl 로 봤다
  - `SearchApiIntegrationTest` — NUL(`"\u0000"` · `"예\u0000산"`) → 400 · 검색 문구. AC-6 시험 보강(아래)
  - `DictionaryApiIntegrationTest` — NUL → 400 · 용어사전 문구 · 사전을 부르지 않음(`verifyNoInteractions(source)`)
- AC-6 시험 보강(`eachKindIsLatestFirstAndCappedAtTwenty`)
  - 이슈의 `updated_at` 을 `created_at` 과 반대 순서로 넣는다 — 정렬을 `updated_at` 으로 바꾸면 갈린다
  - 같은 시각 항목을 2개에서 10개로(n = 12 ~ 21 이 같은 9월 20일), 넣는 순서를 섞는다 — `, id desc` 를 빼면 DB 가 내놓는 순서가 id 내림차순과 맞을 일이 거의 없다
  - `[0] · [1] · [2] · [19]` 만 보던 것을 20개 전체 순서(`contains(...)`)로 본다. 기대 순서: 4401, 4421 ~ 4412, 4411 ~ 4403
- 문서
  - `docs/api.md` 2절 `VALIDATION_FAILED` 행 — 예에 「UTF-8 로 읽을 수 없는 쿼리 인자(`?q=%B3%AA`) — 어느 칸인지 짚지 못해 `errors` 가 없다」
  - `docs/api-screen.md` A13(293줄) · A19(378줄) — 검색어 규칙에 U+0000 → 400 과 문구
  - `docs/specs/F02-search-api.md` — 동작 1 · AC-4 에 NUL, 엣지케이스에 깨진 인코딩 → 400(공통, `api.md` 2절). AC-6 확인 줄에 updated_at · 같은 시각 10개
  - `docs/specs/F13-dictionary-api.md` — AC-3 에 NUL
  - `docs/backend-convention.md` 4절 「공통 처리기가 하는 일」에 「Tomcat 이 쿼리 인자를 못 읽은 오류를 400 으로」

## 안 바꿀 것

- A13 · A19 의 찾는 법 · 결과 · 50자 규칙 · 기존 문구, 바깥 사전 호출 · Redis 저장
- 다른 입력의 NUL — A2 · A6 의 `category` 쿼리, A14 가입 `name` 같은 본문 글자는 DB 에 닿으면 같은 500 이 날 수 있다(미확인). 이 MR 범위 밖이라 끝에 후속으로 따로 묻는다
- 보안 필터 단계 오류(번호표 없는 POST 가 쿼리를 읽다 터지는 경우 등)의 `/error` 응답 — `backend-convention.md` 4절의 「아직 막지 않은 구멍」 그대로
- `SecurityConfig` · 인증 코드 · 마이그레이션 · 화면 · `SSOT.md` · 입구(Envoy) 설정

## 리스크

- 공통 처리기라 모든 API 에 닿는다. 다만 지금 500 이던 한 가지 예외만 400 으로 바뀐다. 다른 오류 처리는 `ErrorResponseTest` 가 그대로 초록이어야 한다
- 공통 처리기가 Tomcat 클래스에 묶인다. 서버를 Jetty 등으로 바꾸면 이 처리가 컴파일부터 깨져 바로 보인다. 지금 바꿀 계획은 없다
- 실제 서버 시험이 하나 늘어 시험 시간이 늘 수 있다. `SessionCookieHttpTest` 와 같은 설정으로 띄운 서버를 같이 써서 수 초로 막는다 — 시험 보고서의 시간을 비교한다
- 사이트 반영은 백엔드 Pod 교체다. 마이그레이션이 없고 늘 하던 교체다

## 어떻게 검증하나

- 실패하는 시험 먼저: 구현 전에 새 시험이 **단언에서** 실패(500 · 200)하는 것을 남긴다
- 시험: 위 시험 셋 + `ErrorResponseTest` · `OpenApiDocsTest` 그대로 초록
- AC-6 변형 확인 두 번(확인 뒤 되돌림): 이슈 정렬을 `updated_at desc, id desc` 로 → 실패, 세 SQL 의 `, id desc` 를 빼기 → 실패
- 되돌림 확인: 새 처리기를 빼면 `QueryEncodingHttpTest` 가 500 으로 실패, NUL 검사를 빼면 NUL 시험이 실패
- `.claude/stack.md` §3 backend: `spotlessCheck` · `compileJava compileTestJava`(Error Prone · NullAway) · `test` · `bootJar`
- 로컬 실제 실행: `./gradlew bootTestRun`(Testcontainers 로 DB · Redis)으로 띄워 위 표의 다섯 요청을 curl 로 — 400, 서버 로그에 ERROR 없음
- reviewer 조수로 diff 리뷰
- MR(작업 브랜치 → `backend` → `dev`) 파이프라인 success 를 본 뒤에만 머지, 머지 직전마다 원격 SHA · 열린 MR 다시 보기
- 사이트: 태그 MR 반영 중 EC2 에서 1초마다 health 실패 0, 반영 뒤 위 표의 다섯 요청이 「바꾼 뒤」 열과 같다. Swagger 400 설명도 본다

## 되돌리는 법

- 이 MR 커밋을 revert 한다. 마이그레이션 · 데이터가 없다
- 사이트는 태그 MR 을 revert(반영 직전 backend 이미지로)하면 Argo CD 가 맞춘다. 그러면 위 표의 「지금 사이트」로 돌아간다
