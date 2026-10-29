# 43번 A13 통합 검색 API 구현 계획

2026-10-30 사용자 승인. 브랜치 `feat/backend/S15P31A102-43-search-api`(`origin/backend` 21d9d28 에서).

## 무엇을 / 왜

F02 카테고리별 뉴스·이슈 조회의 A13 `GET /api/v1/search?q=` 를 확정 스펙(`docs/specs/F02-search-api.md`, AC-1 · 2 · 4 ~ 9)대로 만든다. 화면 검색창(Ctrl+K)은 frontend 브랜치에서 이미 이 응답 모양으로 부르는데, 백엔드에 코드가 없어 사이트에서 404 다. 제목에 검색어가 든 이슈 · 사건 · 기사를 유형마다 최신순 20개까지 준다.

## 정한 것 (2026-10-30 사용자 · 조사)

| 물음 | 답 |
|---|---|
| 범위 | 스펙대로 — 제목만 · 대소문자 무시 · 1 ~ 50자 · 이슈에 묶인 사건만 · 공개된 기사만 · 유형마다 20 · 최신순 |
| 찾는 함수 | `strpos(lower(제목), lower(:q)) > 0` — `%` · `_` · `\` 를 따로 다루지 않아도 글자다(사용자 「따로 다루지 말자」, `LIKE` 면 `\` 로 500) |
| 조회 도구 | `JdbcClient` 네이티브 SQL — 「정렬 · LIMIT 가 든 네이티브 조회」의 기존 모양(`issue/IssueQueryRepository`). 네이티브 쿼리 + DTO 프로젝션 예는 저장소에 없다. 그래서 채팅에서 말한 「JPA 로」 대신 이것으로 하고, SQL 수는 `@MockitoSpyBean JdbcClient` 로 센다(`IssueTimelineQueryTest` 94 ~ 99줄 방식) |
| 검색어 다듬기 | **규칙만** A19 용어사전과 같이 쓴다(앞뒤 공백 · NFC · 코드포인트 1 ~ 50). 두 곳에 같은 규칙을 두지 않으려고 `DictionaryService.normalize` 의 규칙을 공용 `common/web/QueryText.normalize(q, blankReason, tooLongReason)` 로 옮기고, **오류 이유 문구는 기능마다 넘긴다**(2026-10-30 사용자 — 검색창은 「이슈, 사건, 기사 검색」이라 용어사전 문구가 안 맞음). 검색: 「검색어를 입력해 주세요」 · 「검색어는 50자까지예요」. 용어사전: 「찾을 단어를 입력해 주세요」 · 「찾을 단어는 50자까지예요」 그대로. 화면은 빈 검색어를 보내지 않고 오류 때 서버 문구 대신 「검색 결과를 불러오지 못했어요」를 띄워, 이 문구는 주로 Swagger · 다른 호출자에게 보인다 |
| Swagger 태그 | 새 태그 「통합 검색」을 「카테고리」 바로 뒤에 — 화면 순서(검색창은 홈의 카테고리와 같은 화면)를 따른다 |
| `[확정] A13` 시점 | 이 MR 에서 — 계약대로 시험을 마친 작업에 붙이는 관례(`docs/backend-convention.md` 75줄). 사이트에서는 반영 뒤 같은 모양인지 본다. 스펙 AC-8 의 「사이트에서 확인한 뒤」를 「시험을 마친 뒤 붙이고, 사이트에서 같은 모양인지 확인」으로 고친다(번호는 그대로) |

## 바꿀 파일

- 새 패키지 `backend/src/main/java/kr/io/newlearn/search/`
  - `SearchController` — `@GetMapping("/api/v1/search")`, `@RequestParam(required = false) @Nullable String q`(A19 와 같은 까닭 — q 가 없어도 같은 400), `@Tag(TAG_SEARCH)`, summary `[확정] A13 통합 검색`, 200 · 400 `VALIDATION_FAILED — …`(예시는 `ProblemExampleCustomizer` 가 붙임)
  - `SearchService` — `@Service @Transactional(readOnly = true)`. `QueryText.normalize(q)` → 저장소 세 번 → `SearchResponse`
  - `SearchQueryRepository` — `@Repository`, `JdbcClient`. 메서드 셋, 각각 SQL 하나, `limit 20`, 정렬 `… desc, id desc`. 사건은 `issue_id is not null`, 기사는 `released_at is not null`
  - `dto/SearchResponse(List<IssueRef> issues, List<SearchEvent> events, List<SearchArticle> articles)` — 이슈는 기존 `issue/dto/IssueRef(id, title)` 재사용. `SearchEvent(id, title, issueId)` · `SearchArticle(id, title)` 새 record(기존 `EventRef` 는 칸이 달라 못 씀)
- `backend/src/main/java/kr/io/newlearn/common/web/QueryText.java`(새) — `normalize(@Nullable String q, String blankReason, String tooLongReason)`: strip → NFC → 비었거나 코드포인트 50 초과면 400 `VALIDATION_FAILED` + `errors[q]`(넘겨받은 문구)
- `backend/src/main/java/kr/io/newlearn/dictionary/DictionaryService.java` — `normalize` 규칙을 지우고 `QueryText.normalize(q, BLANK, TOO_LONG)` 를 부름. 문구 상수는 그대로 둔다(동작 그대로)
- `SearchService` 에 검색 문구 상수 둘(「검색어를 입력해 주세요」 · 「검색어는 50자까지예요」)
- `backend/src/main/java/kr/io/newlearn/common/web/OpenApiConfig.java` — `TAG_SEARCH = "통합 검색"` 과 태그 설명(「이슈 · 사건 · 기사 제목 검색 — 홈 검색창 · Ctrl+K 빠른 이동 (F02)」), 머리 주석의 태그 순서
- 시험
  - 새 `backend/src/test/java/kr/io/newlearn/SearchApiIntegrationTest.java` — `@SpringBootTest @AutoConfigureMockMvc @Import(TestcontainersConfiguration.class) @Transactional`, 데이터는 `jdbc.sql(...)` 로 직접(사건은 V10 부터 `role` 필수). MockMvc · jsonPath 만 써서 새 타입을 부르지 않는다(되돌림 확인 때 컴파일 오류가 아니라 단언에서 갈리게)
  - `backend/src/test/java/kr/io/newlearn/OpenApiDocsTest.java` — 태그 순서(통합 검색이 1번, 나머지 한 칸씩), `CONFIRMED` 에 `/api/v1/search` → A13, A19 시험처럼 A13 전용(q 인자 하나 · 설명 있음 · required 아님, 200 `$ref` `/SearchResponse`, 400 설명에 `VALIDATION_FAILED` · `$ref` `/Problem`)
- 문서
  - `docs/specs/F02-search-api.md` — 동작 1 「A19 용어사전과 같은 규칙 · 문구다」 → 「같은 규칙, 문구는 검색에 맞게(「검색어를 입력해 주세요」 · 「검색어는 50자까지예요」)」, AC-8 문장(위 표), 끝에 시험 줄(AC 별 시험 이름)
  - `docs/api-screen.md` A13 — 제목의 「구현 전」 지우기, 「Jira 43 구현 계획에서 정한다」 문장을 스펙의 규칙(찾는 곳 · 방식 · 길이 · 사건 · 기사 · 개수 · 순서)으로 바꾸기
  - `docs/api.md` 176 · 196 · 249 · 285 줄 — 「구현 전」 · 「구현 계획에서 정한다」를 지우고 A13 · 스펙을 가리키게
  - `docs/data-model.md` 475 줄 — F02 가 읽는 표에 `event`(A13) 더하기
- Jira 43 — 담당 사용자, 진행 중으로, 스토리 포인트(customfield_10031)가 비었으면 3

## 작업 순서

- [x] Jira 43 담당 · 진행 중 · 포인트(3 은 이미 있었음)
- [x] 실패하는 시험 — 구현 전 13개 단언 실패(새 10 · 문서 3) — `SearchApiIntegrationTest` · `OpenApiDocsTest` 를 먼저 쓰고 돌려, 컨트롤러가 없어 404 · 문서에 경로가 없어 **단언에서** 실패하는 기록을 남김
- [x] 구현 — `QueryText` 로 옮기기(용어사전 시험 그대로 초록) → 검색 패키지 → 시험 통과
- [x] 문서 — 스펙 · 계약 · `api.md` · `data-model.md` 를 코드와 다시 대조
- [ ] `/verify`(포맷 · 린트 · 테스트 · 빌드, 되돌림 확인, `bootRun` 으로 실제 호출) · reviewer 조수 → 커밋 → MR(→ backend) → **파이프라인 성공을 본 뒤** 머지 → backend → dev → 이미지 굽기 → 태그 MR(사이트 반영은 사용자 승인 뒤)
- [ ] 사이트 확인(AC-9) · 학습 기록(파일별 코드 캡처) · 가이드 장면 · 면접 기록 · `/feature-done`

## 안 바꿀 것

- 인증 · 권한: `SecurityConfig` 는 이미 `/api/v1/search/**` 를 GET 으로 열었다. `SecurityRulesTest` 는 컨트롤러를 안 띄우는 슬라이스라 그대로 404 를 본다 — 둘 다 손대지 않는다
- 마이그레이션 · 인덱스(스펙 「하지 않는 것」), 다른 조회 API(A1 ~ A9 · A19 동작), 입구 상한(`infra/`)
- 화면(frontend 브랜치) · FE UX 문서 · PRD · MVP 개요 · `SSOT.md`(A13 언급이 없고 새로 정한 운영 사실도 없음)
- 용어사전의 바깥 사전 호출 · 저장 · 하루 한도 — 검색어 다듬기 한 함수만 공용으로 옮긴다

## 리스크

- 공용으로 옮기다 용어사전 400 문구 · 규칙이 바뀔 수 있다 — `DictionaryApiIntegrationTest` 의 400 시험(없음 · 빈 값 · 공백 · 50 · 51자 · NFD)이 그대로 초록이어야 한다
- 인덱스 없는 표 훑기라 기사가 많아지면 느려질 수 있다 — 지금 사이트는 0건이라 재지 못한다. 데이터가 생기면 응답 시간을 재고 느리면 인덱스 티켓(스펙 「가정」)
- `lower()` 는 DB 의 문자 규칙을 따른다 — 한국어에는 대소문자가 없고 영문은 시험으로 본다
- 사이트 데이터가 0건이라 AC-9 는 빈 배열 · 400 까지만 확인된다 — 스펙에 적어 둠
- 배포: 백엔드 Pod 교체. 마이그레이션이 없고 늘 하던 교체라 EC2 에서 1초마다 health 를 잰다

## 어떻게 검증하나

- AC-1 · 2 · 4 · 5 · 6 · 7: `SearchApiIntegrationTest`
  - AC-1: 결과 있음 — 세 배열의 칸(`events[].issueId` 포함), 로그인 없이. 결과 없음 — 200 과 빈 배열 셋
  - AC-2: 제목 가운데 낱말 · 대문자로 친 영문(「ai」 → 「AI 규제」)이 나오고, 요약에만 있는 낱말은 안 나옴
  - AC-4: `q` 없음 · `""` · 공백 → 400 「검색어를 입력해 주세요」, 51자 → 400 「검색어는 50자까지예요」(`errors[0].field = q`), 50자는 200, NFD 로 친 한글이 NFC 제목을 찾음
  - AC-5: `issue_id` 없는 사건 · `released_at` 없는 기사는 안 나옴
  - AC-6: 유형마다 21개를 넣으면 20개, 최신순 · 같은 시각은 id 큰 것 먼저
  - AC-7: `clearInvocations(jdbc)` 뒤 한 번 부르면 `verify(jdbc, times(3)).sql(anyString())`
  - 덤(옛 AC-3 자리, 기준 아님): `%` · `\` 로 쳐도 500 이 아니고 그 글자가 든 제목만
- AC-8: `OpenApiDocsTest`(태그 · `[확정] A13` · q 설명 · 400 예시)
- 용어사전 회귀: `DictionaryApiIntegrationTest` 전부 초록
- 되돌림 확인: 검색 패키지를 임시 폴더로 옮기면 새 시험이 단언에서 실패(404) — 컴파일 오류가 아님을 확인하고 되돌림
- `.claude/stack.md` §3 backend 포맷 · 린트(Error Prone · NullAway) · 테스트 · 빌드, 실제로 띄워 `curl 'localhost:8080/api/v1/search?q=예산'` 200 · `q=` 400
- AC-9(사이트): 반영 뒤 `curl https://newlearn.io.kr/api/v1/search?q=예산` → 200 · 빈 배열 셋, `q=` → 400, Swagger 에 `[확정] A13`. 반영 중 health(EC2 1초마다) 실패 0
- MR 파이프라인 success 를 본 뒤에만 머지

## 되돌리는 법

- 이 MR 커밋을 revert 한다. 마이그레이션 · 데이터가 없어 조치할 것이 없다
- 사이트는 태그 MR 을 revert(이전 backend 이미지로) — Argo CD 가 맞춘다. 화면 검색창은 다시 404 를 받는다(지금과 같음)
