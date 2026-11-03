# 기사 적재 내부 API(B2) — 수집 배치가 NewsData 기사를 DB 에 넣는 길 (Jira S15P31A102-153)

## 무엇을 / 왜

11-16 부터 수집 배치(Jira 154)가 NewsData 최신 기사를 하루 약 100건 받아 분석에 건다. 그런데 B1 기사 투입(`POST /internal/v1/articles/{articleId}/release`)은 이미 DB 에 있는 기사에 분석만 건다. 기사를 넣는 API 가 없다. 그래서 backend 에 B2 기사 적재(`POST /internal/v1/articles`)를 새로 만든다. 필수 값 검사 · 언론사 등록 · 같은 URL 처리를 Java 시험으로 지키고, 배치는 HTTP 만 부르게 한다(F01 뉴스 데이터 적재·조회). 배경과 티켓 나누기는 `docs/plans/2026-11-02-data-1115-1116-infra-prep.md` B 절이다.

## 정한 것 (2026-11-03)

| 무엇 | 정한 것 | 근거 |
|---|---|---|
| 본문(`content`)이 null 인 기사 (11-03 응답 50건 중 6건) | API 는 필수 값 검사로 400. 배치도 미리 걸러 「본문 없음 N건」으로 센다 | 인프라 담당 답 |
| 연예 · 스포츠 (50건 중 연예가 붙은 것 10건 · 스포츠 3건) | 배치가 거른다. API 는 분류를 보고 거절하지 않는다 | 인프라 담당 답. `docs/data-model.md` 2절 category_mapping 「5개 밖 기사는 수집할 때부터 받지 않는다」 |
| 처음 보는 언론사 | 자동 등록 — `press(code = source_id, name = source_name)` 과 `press_mapping(NEWSDATA, source_id)`. 대응 키는 `source_id` 다(지금 2절은 `source_name` 이라 고친다) | 인프라 담당 답. 2절 press 「처음 보는 표기는 수집할 때 만든다」, 5절 15번 가정 |
| 적재 뒤 B1 | 배치가 따로 부른다. B2 는 넣고 id 만 돌려준다. 배치는 201 · 200 모두 B1 을 부르고 409 `ALREADY_RELEASED` 는 건너뛴다 | 인프라 담당 답(티켓 · 11-02 계획 그대로) |
| `source_tags` | NewsData `ai_tag` (`keywords` 는 16건이 null, `'undefined'` 도 옴) | 이미 `docs/data-model.md` 2절 article 표에 있음 |
| 발행 시각 | 오프셋이 없는 글자 시각은 400. 배치가 `pubDate` 에 `pubDateTZ`(UTC)를 붙여 `2026-11-02T23:15:46Z` 로 보낸다. 숫자(epoch)로 보내면 받아들이는 구멍은 W1 과 같이 남는다 | `docs/api.md` 1절 「요청 시각에 오프셋이 없으면 400」, `docs/backend-convention.md` 3절 · 4절 「아직 막지 않은 구멍」 |

## 계획에서 바뀐 것 (reviewer 조수 계획 리뷰 2026-11-03, 「고쳐야 함」 3 · 선택 반영)

| 무엇 | 전 | 지금 | 근거 |
|---|---|---|---|
| 바꿀 파일 | api.md 1 · 3 · 5절, data-model 2 · 5절 | 더함 — api.md 머리 계약 지도의 「적재 (길 미정)」 점선, data-model 6절 대조표 · 머리 판 줄, backend-convention 4절 epoch 줄, `Press.java` 주석(5절 15번을 가리킴), `docs/glossary.md` 「수집 실행」 줄 | 같은 사실이 남아 B2 뒤 틀린 말이 됨 |
| 충돌 잡기 범위 | 「유일 키에 걸리면 다시 찾아 200」 | 다시 찾아 있으면 200, 없으면 원래 예외를 다시 던져 500. 기본 키에 걸린 경우 시험 | `SignUpRequest.java:23` 선례(저장 오류를 중복으로 잘못 읽음). 11-15 덤프 뒤 `setval` 이 빠지면 기본 키에 걸림 |
| 동시 요청 시험 | 스레드 둘 | 따로 연 연결에서 같은 URL 을 커밋 없이 넣고, 요청이 유일 키에서 기다리는지 `pg_blocking_pids` 로 본 뒤 커밋 → 200 · 그 id (`BookmarkConcurrencyIntegrationTest` 틀) | 스레드 둘은 대개 미리 찾기에서 끝나 충돌 길을 안 지남 |
| 되돌림 확인 목록 | 같은 URL · URL · U+0000 · 오프셋 · 언론사 | 충돌 잡기를 따로. 오프셋은 뺌, 미리 찾기는 뺌(아래) | 오프셋은 Jackson 이 막아 되돌릴 코드가 없음. 미리 찾기는 충돌 잡기가 같은 답을 내 결과로 구분되지 않음 — 중복마다 오류 로그를 내지 않으려는 길 |
| 트랜잭션 경계 | 적지 않음 | 서비스 클래스 · 메서드에 `@Transactional` 을 두지 않고 `TransactionTemplate` 한 곳 | 클래스 readOnly 를 두면 템플릿이 바깥에 합류해 insert 실패 · 다시 읽기 25P02 |
| 언론사 넣기 | `BookmarkRepository` 틀 인용, 두 문장 | 대응 행은 `insert … on conflict do update set press_code = press_mapping.press_code returning press_code` 한 문장, 다시 읽을 때는 대응 행의 `press_code` | Bookmark 는 한 문장 · 두 문장을 일부러 피함. 코드를 `source_id` 로 짐작하지 않기 |
| 순서 | 적지 않음 | URL 미리 찾기 → 언론사 → 카테고리 → 저장 | 같은 URL 두 번째 요청이 언론사도 만들지 않게 |
| URL 검사 | `java.net.URI` | scheme(`http` · `https`) · 비지 않은 호스트만 보는 `@Pattern`. 한글 경로 시험 | `URI` 는 인코딩 안 된 한글 링크를 막고, `@URL` 은 빈 호스트를 통과 |
| 대표 카테고리 동률 | 없음 | `priority` 가 같으면 `category.sort_order` | 고르는 법이 하나여야 시험이 됨 |
| 사이트 확인 | 「밖에서는 입구가 막는다」 | 밖에서 부른 `/internal/…` 는 frontend 로 간다 — backend 응답(`code`)이 아님을 본다. 안에서는 `kubectl -n app port-forward svc/backend` 로 401 | `infra/k8s/services/app/routes.yaml` 의 `/` 길, backend 정책은 envoy · ai 만 받음 |
| 되돌리는 법 | MR 되돌리기 | + 배포 태그를 앞 커밋으로 | dev 되돌리기만으로는 떠 있는 이미지가 그대로 |
| AC | 9개 | 목록 개수 · 항목 길이 · 빈 항목, `reporter` 빈 값 → null, `sourceTags` 없음 → null, 기본 키 충돌 500 더함 | 계획이 정한 규칙을 시험으로 |
| 시험 문맥 | — | `@TestPropertySource` 키 값을 `ArticleReleaseIntegrationTest` 와 같게 | Spring 문맥을 다시 써 CI 공용 DB 연결을 늘리지 않음 |

## MR 전 리뷰에서 바뀐 것 (reviewer 조수 2026-11-03, 「통과」 · 선택 반영)

| 무엇 | 전 | 지금 | 근거 |
|---|---|---|---|
| B1 다시 걸기 설명 | 「적재 뒤 B1 이 실패한 기사가 다음 실행에서 다시 걸린다」 | 같은 기사를 다시 받을 때만. 실행 안에서 다시 걸지는 154 가 정한다 | 최신 기사만 받아 대개 다시 오지 않음 |
| 언론사 등록 로그 | 트랜잭션 안에서 | 커밋 뒤 | 같은 URL 충돌로 되돌아가면 없는 언론사를 「등록했다」고 남김 |
| 대표 카테고리 동률 | 계획 · 스펙 · 코드에만 | `docs/data-model.md` 2절 category_mapping `priority` 칸에도 | 대응 행을 더하고 다시 계산할 때 쓰는 진실 문서 |
| 시험 원본 분류 | 실제 값 `top` · `business` | `ingest153-` 시험 값 | 대응 행이 나중에 생겨도 AC-1 이 엉뚱하게 깨지지 않게 |
| AC-5 경우 | — | `url` · `pressName` 공백, 태그 항목 101자 더함 | 같은 꼴이지만 빠짐없이 |
| URL 설명 | 「호스트가 비지 않았다」 | 「`http://` · `https://` 뒤에 한 글자 이상」, 500 행에 DB 색인 상한(약 2,700바이트) | 정규식은 `https://@` 도 통과. 2048자 한글은 색인 상한을 넘음 |
| 낡은 말 | `PressMapping` 주석 · data-model 4절 끝 「수집 티켓(Jira 34)」 | B2 · 사람이 SQL 로 묶기 | B2 뒤 틀린 말 |
| `SSOT.md` 8절 줄 | 「누가」 · 「관련」 칸도 바꾸고 「B2 로 정했다」를 더함 | 「적재하는 길」만 지움(계획대로) | 정한 사실을 「못 정한 것」 표에 다시 적지 않기 |
| SSOT 가리키기 | 8절 「스포츠 · 연예 제외」 | 9절 2026-10-20 「카테고리 7개 → 5개」 | 8절 그 말은 처리 상한 칸의 괄호 문구 |

## B2 약속 — 구현 · 명세의 기준

`POST /internal/v1/articles`, 배치 출입증(`X-Internal-Key`, 역할 BATCH). 본문은 기사 하나다. 지금은 NewsData 기사만 받는다(소스가 늘면 `source` 칸을 더한다).

| 요청 칸 | 필수 | 규칙 | NewsData 칸 | 저장하는 곳 |
|---|---|---|---|---|
| `url` | 예 | `http` · `https` 이고 호스트가 비지 않았다(`@Pattern`, 한글 경로는 받는다). 2048자까지. 받은 그대로 둔다(정규화 안 함) | `link` | `article.url` |
| `pressSourceId` | 예 | 100자까지 | `source_id` | `press_mapping.source_value`, 처음이면 `press.code` |
| `pressName` | 예 | 100자까지. 언론사를 처음 등록할 때만 쓴다 | `source_name` | 처음이면 `press.name` |
| `title` | 예 | 300자까지 | `title` | `article.title` |
| `reporter` | 아니오 | 200자까지. 빈 값은 null 로 둔다 | `creator[]` — 잇는 법은 배치가 정한다 | `article.reporter` |
| `body` | 예 | 공백만은 안 된다. 10만 자까지 | `content` | `article.body` |
| `publishedAt` | 예 | 오프셋 필수 | `pubDate` + `pubDateTZ` | `article.published_at` |
| `sourceCategories` | 아니오 | 20개 · 항목마다 100자까지, 빈 항목은 안 된다. 없으면 빈 목록 | `category[]` | `article.source_categories`, 대표 카테고리 계산 |
| `sourceTags` | 아니오 | 같은 규칙. 없으면 null | `ai_tag[]` | `article.source_tags` |

- 모든 글자 칸 · 목록 항목에 U+0000 이 있으면 400(`SignUpRequest.name` 의 `@Pattern("[^\\x00]*")` 과 같은 방식). 길이 상한은 우리 제안이다(11-03 응답의 최댓값: 제목 57자 · 링크 197자 · 본문 7,157자)
- 응답: 201 `{ "articleId": 123, "created": true }` 새로 넣음(`released_at` 비움 — 화면에 아직 없음). 200 `{ "articleId": 123, "created": false }` 같은 URL 이 이미 있다 — 아무 칸도 바꾸지 않는다. 400 `VALIDATION_FAILED` + `errors[칸]`. 401 · 403 은 B1 과 같다
- 순서: URL 미리 찾기 → 언론사 → 대표 카테고리 → 저장. 서비스 클래스 · 메서드에 `@Transactional` 을 두지 않고, 언론사 · 저장을 `TransactionTemplate` 한 트랜잭션에 둔다(`AnalysisJobService` 틀)
- 같은 URL: 넣기 전에 URL 로 찾아 있으면 200(중복마다 오류 로그를 내지 않게). 동시에 같은 URL 이 들어와 저장(`saveAndFlush`)이 무결성 오류에 걸리면, 트랜잭션 밖에서 URL 로 다시 찾아 있으면 200, 없으면 원래 예외를 다시 던진다(500 — 기본 키 충돌 같은 다른 오류를 중복으로 잘못 읽지 않게). 잡는 틀은 `MemberService.signUp`
- 언론사: `press_mapping(NEWSDATA, pressSourceId)` 가 있으면 그 언론사. 없으면 `insert into press … on conflict (code) do nothing` 뒤 `insert into press_mapping … on conflict (source, source_value) do update set press_code = press_mapping.press_code returning press_code` 한 문장으로 대응 행의 `press_code` 를 받는다. 같은 코드의 언론사가 이미 있으면(11-15 덤프 · 11-02 시험 언론사) 그 행에 대응만 붙고 이름은 그대로다. 새로 만들면 로그 한 줄
- 대표 카테고리: 원본 값마다 `category_mapping(NEWSDATA, 값)` 을 본다. 표에 없는 값이 하나라도 있으면 비우고 로그 한 줄, 모두 있으면 칸이 찬 행 중 `priority` 가 가장 작은 것, 같으면 `category.sort_order`(2절 category_mapping 규칙). 지금은 행이 없어 모두 비고 로그가 남는다

## 바꿀 파일

코드 — `backend/src/main/java/kr/io/newlearn/`

- `ingest/ArticleIngestInternalController.java`(새) — B2 주소, 201 · 200
- `ingest/ArticleIngestService.java`(새) — 같은 URL · 언론사 등록 · 대표 카테고리 · 저장
- `ingest/dto/ArticleIngestRequest.java` · `ArticleIngestResponse.java`(새) — 검증 어노테이션의 `message` 는 한국어 문장(`docs/backend-convention.md` 3절)
- `article/Article.java` — 선택 칸(기자 · 대표 카테고리 · 태그)을 채우는 이름 있는 메서드 하나(생성자는 필수 칸만 — 같은 문서 2절). 머리 주석의 「적재(보류)」를 B2 로
- `article/ArticleRepository.java` — URL 로 id 찾기
- `press/PressRepository.java` · `press/PressMappingRepository.java` — 언론사 없으면 넣기, 대응 행 넣고 `press_code` 받기(네이티브 쿼리, 위 「언론사」)
- `press/Press.java` — 주석이 가리키는 「5절 15번」을 2절로
- `common/security/InternalApiSecurityConfig.java` — **주석만**(배치 키가 B1 · B2 를 연다). 규칙 `/internal/v1/articles/**` 가 `/internal/v1/articles` 도 덮는지 시험으로 본다. 덮지 않으면 멈추고 규칙을 바꾸는 계획을 다시 승인받는다. 주석이라도 인증 코드라 사람이 최종 확인한다
- `backend/src/main/resources/application.yaml` — 출입증 주석 한 줄(B1 · B2)

시험 — `backend/src/test/java/kr/io/newlearn/`

- `ArticleIngestIntegrationTest.java`(새) — 실제 PostgreSQL · Redis(`ArticleReleaseIntegrationTest` 와 같은 틀, 같은 `@TestPropertySource` 키 값). 동시 요청은 `BookmarkConcurrencyIntegrationTest` 틀(따로 연 연결 · `pg_blocking_pids`)
- `common/security/SecurityRulesTest.java` — `POST /internal/v1/articles` 를 배치 키는 지나고 워커 키는 403

문서

- `docs/api-internal.md` — 머리에 v1.4 줄, 1절 그림에 B2, 2절을 「수집 배치 — B2 적재 · B1 투입」으로 묶어 B2 명세(위 약속)를 B1 앞에. B1 의 「적재하는 길은 SSOT 8절」 · 「`ingest_run` 에 남긴다」 줄을 고친다. 절 번호는 그대로(다른 곳이 「2절」로 가리킨다)
- `docs/api.md` — 머리 계약 지도(「적재 (길 미정)」 점선 → B2 · /internal/v1), 머리 문서 색인 줄, 1절 「인증」 배치 키 B1 · B2, 3절 주소 지도 · 표에 B2, 5절 티켓 표에 153 줄
- `docs/specs/F01-article-ingest-api.md`(새) — 성공 기준과 시험 이름. `docs/specs/F01-article-release-api.md` 「하지 않는 것」 줄이 이 스펙을 가리키게
- `docs/data-model.md` — 머리에 v1.4 줄(press_mapping NewsData 키 `source_name` → `source_id`), 2절 press_mapping 의 NewsData 대응 키 · press 등록 규칙, article 의 url(정규화 안 함) · 필수 값 줄 · `pubDate` 줄, ingest_run(지금 안 씀), 6절 대조표(F01 줄 · 머리 글에 B2). 5절 15번은 정했으니 지운다
- `docs/backend-convention.md` — 4절 epoch 줄(시각을 받는 API 는 W1 · B2), 5절 직원용 문 목록에 B2
- `docs/glossary.md` — 「수집 실행」 줄(`ingest_run` 은 지금 안 씀, 실행 기록은 배치 Job 로그)
- `SSOT.md` — 2절 3번에 「B2 로 적재하고 B1 로 투입한다, DB 에 직접 쓰지 않는다」. 8절 첫 줄에서 「적재하는 길」만 지운다(구현 언어 · 배치 보류는 154 가 고친다)
- `docs/plans/2026-11-03-article-ingest-api.md` — 이 계획

## 작업 순서

`C:/tmp/wt-153` worktree, 브랜치 `feat/backend/S15P31A102-153-article-ingest-api`(`origin/backend` 에서).

- [x] 계획 커밋 — `docs(backend): …` 
- [ ] 시험을 먼저 쓰고 빨강 확인(컨트롤러 · DTO 뼈대만 둔 상태에서 단언으로). 구현 → 초록 → 고친 곳을 하나씩 되돌려 그 시험이 단언에서 빨개지는지 — 충돌 잡기(동시 요청 시험) · 다시 찾아 없으면 다시 던지기(기본 키 충돌 시험) · URL 모양 · U+0000 · 언론사 등록 · 대표 카테고리. 커밋 게이트가 빨간 커밋을 막으니 시험과 구현은 한 커밋, 빨강 결과는 MR 본문에 — `feat(backend): …`
- [ ] 문서 커밋 — `docs(backend): …`
- [ ] reviewer 조수 → 반영 커밋 → MR(feat → backend) → 파이프라인 success → 머지 직전 원격 SHA 를 같은 스크립트에서 GitLab API 로 읽고 머지 → MR(backend → dev, 제목은 같은 방향으로 머지된 MR 을 읽고 따른다) → 머지 → 분야 브랜치 맞추기
- [ ] 배포 태그 MR 은 사용자가 머지(사이트 반영) → 사이트 확인 → `/feature-done` → Jira 153 댓글 · 완료, 154 · 152 댓글(아래 「알릴 것」)

알릴 것(Jira 댓글)

- 154 — B2 주소 · 요청 · 응답, NewsData 칸 대응, 배치가 거를 것(본문 없음 · 연예 · 스포츠 · `pubDateTZ` 가 UTC 가 아닌 기사), B2 201 · 200 뒤 B1
- 152 — 덤프의 언론사 약속: `press.code` 는 NewsData `source_id`, `press_mapping.source_value` 도 `source_id`. 다르면 11-16 기사가 같은 언론사를 새로 만들어 언론사 수가 둘로 세어진다

## 안 바꿀 것

- B1 · W1 동작과 응답, 작업 큐, 공개 규칙(`released_at` 은 EXTRACT 결과 저장 때)
- `InternalApiSecurityConfig` 의 규칙 · `InternalKeyFilter` — 주석만 고친다
- 마이그레이션 · 표 구조 — 새 마이그레이션 없음
- `category_mapping` 행 — BE · 팀 몫(`docs/data-model.md` 5절 7번). 이번에 넣지 않는다
- `ingest_run` — 쓰지 않는다(지우지도 않는다)
- URL 정규화 · 언론사 묶기(대응 행 바꾸기) · 이미 있는 기사 고치기
- 수집 배치 · CronJob · 정책 · 경보(154), 키 봉인(155), `SSOT.md` 6절 「수집 배치를 만들면 backend · PostgreSQL 길을 더한다」 줄(154 가 고친다)
- infra 주석 둘 — `infra/server/seal-secrets.sh` · `infra/k8s/services/app/backend.yaml` 의 「배치 키는 B1 만」(구현 중 찾음). backend MR 에 infra 파일을 섞지 않고 154 에서 고친다
- Swagger 문서 — 내부 API 는 `springdoc.paths-to-exclude` 로 빠진다

## 리스크

- **보안 규칙이 B2 를 안 덮음** — 덮을 것으로 본다: 같은 매처 꼴인 `SecurityConfig` 의 `/api/v1/categories/**` 를 `SecurityRulesTest` 가 `/api/v1/categories` 로 불러 통과를 단언한다(리뷰 확인). 그래도 B2 주소로 시험하고, 안 덮이면 멈추고 규칙 변경을 다시 승인받는다
- **11-15 덤프 뒤 시퀀스가 낮게 남음** — B2 저장이 기본 키에 걸린다. 같은 URL 로 잘못 읽지 않고 500 으로 드러나게 한다(AC-10). 맞추는 일은 152 적재의 `setval`
- **11-15 덤프와 언론사 코드가 다름** — 덤프가 `source_id` 가 아닌 코드를 쓰면 11-16 기사가 같은 언론사를 새로 만든다. 152 에 약속을 알린다. 생기면 묶기는 2절 press 규칙대로 사람이 SQL 로
- **언론사 이름이 화면에 어색하게 나옴** — `source_name` 이 `Hani` · `Kbs 뉴스` · `Dailian` 처럼 온다. 처음 등록할 때 그대로 넣고 사람이 고친다(B2 는 이미 있는 이름을 덮지 않는다)
- **대표 카테고리가 모두 빔** — 대응 행이 없어 11-16 기사는 카테고리 탭에 안 나온다(A7 최신 기사에는 나온다). 행은 BE · 팀 몫(5절 7번), 11-02 계획에도 적혀 있다
- **처음 보는 분류 로그가 많음** — 행이 찰 때까지 기사마다 한 줄(하루 약 100줄). 본문 · 키는 찍지 않는다
- **운영 영향** — 부르는 곳(154)이 없어 반영해도 DB 에 쓰지 않는다

## 어떻게 검증하나

성공 기준(새 스펙 `F01-article-ingest-api.md` 에 옮긴다). 시험은 `ArticleIngestIntegrationTest`

- AC-1 새 기사는 201 · `created: true` 와 id. 행은 `NEWSDATA` · 받은 칸 그대로, `released_at` 빔, A8 은 404. `reporter` 빈 값은 null, `sourceCategories` 없으면 빈 목록, `sourceTags` 없으면 null
- AC-2 같은 URL 은 200 · `created: false` 와 같은 id. 두 번째 요청의 다른 칸 값 · 새 언론사로 아무것도 바뀌지 않는다. 같은 URL 을 다른 연결이 커밋 없이 넣고 있으면 요청은 유일 키에서 기다렸다가 그쪽이 커밋하면 200 · 그 id
- AC-3 처음 보는 언론사는 `press` · `press_mapping` 이 생긴다. 같은 `source_id` 두 번째 기사는 새로 만들지 않는다. 같은 코드의 언론사만 있고 대응이 없으면 대응만 붙고 이름은 그대로
- AC-4 `publishedAt` 은 같은 순간으로 저장된다(`…23:15:46Z` → `2026-11-03T08:15:46+09:00`). 오프셋이 없으면 400 `errors[publishedAt]`
- AC-5 필수 값(`url` · `pressSourceId` · `pressName` · `title` · `body` · `publishedAt`)이 없거나 빈 값 · 길이를 넘거나, 목록이 20개를 넘거나 항목이 비었거나 100자를 넘으면 400 `errors[칸]` 이고 아무것도 저장되지 않는다
- AC-6 `http(s)` 가 아닌 URL(`ftp:` · `javascript:` · 호스트 없음 · 상대 주소)은 400 `errors[url]`. 한글 경로가 든 `https` 링크는 받는다
- AC-7 U+0000 이 든 칸 · 목록 항목은 400
- AC-8 대표 카테고리 — 원본 값이 모두 표에 있으면 칸 찬 행 중 `priority` 가 가장 작은 것(같으면 `sort_order`), 하나라도 없으면 빔
- AC-9 워커 출입증은 403, 출입증 없으면 401 — 그리고 `SecurityRulesTest` 에 B2 주소
- AC-10 저장이 URL 이 아닌 이유(기본 키 충돌)로 실패하면 같은 URL 로 잘못 읽지 않고 500 `INTERNAL_ERROR`, 행이 생기지 않는다

게이트(`.claude/stack.md` §3 backend): `./gradlew spotlessCheck` · `./gradlew compileJava compileTestJava` · `./gradlew test`(Docker Desktop). 고친 곳 되돌리기로 빨강 확인. reviewer 조수 리뷰. CI 파이프라인 success.

사이트(배포 태그 MR 머지 뒤): 사이트 밖에서 부른 `POST https://newlearn.io.kr/internal/v1/articles` 는 backend 에 닿지 않는다(frontend 로 가는 `/` 길 — 응답에 backend 의 `code` 가 없음을 본다). 클러스터 안에서는 `kubectl -n app port-forward svc/backend` 로 출입증 없이 부르면 401 이다(B2 가 떠 있고 잠겨 있다). port-forward 가 자동 권한 검사에 막히면 사용자 몫 명령으로 준다. 실제 적재는 154 의 첫 실행에서 본다 — 이번에 운영 DB 에 시험 기사를 넣지 않는다.

## 되돌리는 법

- MR 되돌리기(backend → dev)와 배포 태그(`newTag`)를 앞 커밋으로 돌리는 MR — dev 되돌리기만으로는 떠 있는 이미지가 그대로다. 마이그레이션이 없고, 부르는 곳(154)이 켜지기 전이면 DB 에 남는 것이 없다
- 154 가 켜진 뒤 되돌리면 이미 넣은 기사 · 등록한 언론사는 남는다. 공개 전 기사는 화면에 없고, 지우려면 SQL(11-15 적재의 비우는 순서, 백업 뒤)
