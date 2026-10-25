# AI 답 반영 명세 · Swagger 정리 · NewsData 요약 대체 없앰

## 무엇을 / 왜

AI 담당이 「API v1 AI 질문 1~8번 답변」(2026-10-23)을 보냈다. 사용자가 10-26 BE 결정을 내렸다.

- 대표 사건 표시 · 분석 불가 입력 · 후보 근거 · 판정 기록 · GMS 연결 실패는 찬성
- NewsData 요약 대체는 없앤다. Basic 요금제의 `ai_summary` 는 50건 모두 null 이다
- 임베딩은 문구만 맞춘다

AI 에는 「BE 가 명세 MR 을 올릴 테니 확인해 달라」고 답한다(사용자가 보냄). 같은 날 「Swagger 를 보기 좋게, 확정된 것만 확정 표시」도 정했다. 아직 없는 API 는 Swagger 에 넣지 않는다.

일은 MR 두 개로 나눈다.

| MR | 무엇 | 누가 확인 | 흐름 |
|---|---|---|---|
| **A 명세** | AI 답 반영 — 워커 계약 · 상태 값 · 실패 코드 · 데이터 모델 예정 칸 · 임베딩 문구 | AI 담당(사용자가 링크를 보냄) | `docs/common/S15P31A102-111-ai-answer-contract` → dev. 문서 공통 MR 은 dev 로 바로 간다(-71 과 같음) |
| **B 코드** | NewsData 요약 대체 없앰(코드 + 그 계약 문서) · Swagger 정리 | 파이프라인 · reviewer 조수 | `feat/backend/S15P31A102-112-swagger-summary` → backend → dev → 태그 MR → 사이트 |

NewsData 요약 문서는 B 에 넣는다. 계약과 코드가 한 MR 에서 같이 바뀌어야 둘이 어긋나는 때가 없다. 화면 코드(`origin/frontend`)는 `summarySource` 를 쓰지 않는다(git grep 0건). 그래서 필드를 빼도 화면이 깨지지 않는다.

## 정한 것

| 항목 | 정한 것 |
|---|---|
| Jira | 새 작업 둘 — S15P31A102-111(명세) · S15P31A102-112(코드). 상위 에픽은 S15P31A102-27. 라벨 `be` · `newlearn-mvp`. **A** 「[BE] AI 답 반영 — 워커 계약(대표 사건 · 분석 불가 · 실패 코드)」, 스토리 포인트 2. BE 설계라서 설명 첫 줄에 공동 담당을 쓰고 `pair` 라벨을 단다. **B** 「[BE] Swagger 정리 · NewsData 요약 대체 없앰」, 스토리 포인트 3 |
| 머지 | B 는 파이프라인이 통과하고 머지 직전에 원격 dev · 열린 MR 을 다시 본 뒤 내가 머지한다. backend → dev 와 태그 MR 도 같다. **A 는 AI 담당이 확인한 뒤** 사용자 지시로 머지한다 |
| 계획 사본 | 승인한 계획을 `docs/plans/2026-10-26-ai-answer-swagger.md` 로 A 에 넣는다 |
| 머지 뒤 | dev → infra · backend · frontend · ai 반영(standing 지시). Jira 를 Done 으로 옮기고 zoo_docs · 메모리를 갱신한다 |

## 작업 순서

### A — AI 답 반영 명세 (문서만, 커밋 하나)
- [ ] `docs/api-internal.md`
  - 머리에 v1.1 줄(2026-10-26, Jira 111)
  - 3절: EXTRACT 결과의 `primaryCoreIndex` 가 null 이면 MATCH_EVENT · ISSUE 를 넣지 않는다. 그런 기사는 마인드맵만 가진다
  - 4절 match_event 메시지에 두 칸을 더한다. `extracted.primaryEvent` 는 대표 잎 문장이다. `candidates[].evidence` 는 후보 사건의 첫 기사에서 대표 잎의 근거 문장을 최대 3개 담는다
  - 5절 W1 EXTRACT 결과에 `primaryCoreIndex` 를 더한다. 타입은 number · null 이고 핵심 내용 가지 잎의 순번(0부터)이다. 저장하는 곳은 `article_mindmap.primary_core_index` 다. 범위 밖이거나 핵심 내용 가지가 없는데 숫자가 오면 400 `RESULT_SCHEMA_INVALID` 로 받는다. `occurredAt` 은 그 잎의 시각이다
  - 5절 MATCH_EVENT · ISSUE 결과에 `reason` · `model` · `promptVersion` 을 더하고 `analysis_job.result` 에 저장한다
  - 6절 상태: `mindmapStatus` 에 `NOT_ANALYZABLE` 을 더한다(EXTRACT 가 `INPUT_NOT_ANALYZABLE` 로 실패). `eventMatchStatus` 에 `NO_EVENT` 를 더한다(EXTRACT 는 성공했지만 대표 사건이 없어 판정 작업이 없음)
- [ ] `docs/api.md`
  - 머리에 v1.1 줄
  - 2절 작업 실패 코드에 둘을 더한다. `INPUT_NOT_ANALYZABLE` 은 다시 돌리지 않는다. `LLM_UNAVAILABLE` 은 GMS 502 · 연결 끊김이다. 워커 안에서 3번 다시 하고, 그래도 안 되면 API 가 나중에 다시 넣는다
  - 4절 AI 질문 1~8 은 한 줄로 바꾼다: 「2026-10-23 AI 답으로 풀림 — 반영은 api-internal v1.1」
- [ ] `docs/api-screen.md` — `mindmapStatus` · `eventMatchStatus` 값 목록에 위 두 값을 더한다. 「W1 구현 때부터 나온다」고 적는다
- [ ] `docs/data-model.md`
  - 머리에 v1.1 줄
  - `analysis_job.result` jsonb(판정 이유 · 모델 · 프롬프트 판)와 `article_mindmap.primary_core_index` int 줄을 더한다. 둘 다 「V3 에서 더함」으로 적는다
  - `article_embedding.embedding` 줄은 「BGE-m3-ko(1024) 유력, Jira 35 전에 확정. 확정 전까지 차원을 정하지 않는다」로 고친다
  - NewsData 언론사 칸은 `source_id` · `source_name` 이다(214줄)
  - NewsData 본문(241줄): 50건 중 49건에 왔고 줄바꿈이 없어 `paragraphIndex` 는 늘 0 이다. 시각은 UTC 다
  - 5절 7번에 본 원본 분류 값 목록을, 15번에 `source_id` 를 반영한다
  - AI 가 동의한 5절 4번(근거만 지우고 잎은 남김) · 12번(날짜까지면 그날 0시)은 해당 절로 옮기고 표에서 지운다(5절 규칙). 3번 가정에 대표 사건을 반영한다 — 구현하며 더한 것
- [ ] `SSOT.md` 59 · 295 · 337줄 — 임베딩 「정했다」를 「유력, Jira 35 전 확정」으로 바꾼다
- [ ] `docs/plans/2026-10-26-ai-answer-swagger.md` — 이 계획의 사본

### B — 코드 (커밋 둘, 각각 실패하는 시험 먼저)
- [ ] **B1 NewsData 요약 대체 없앰**
  - 시험을 먼저 고친다
    - `ArticleSummaryAssemblerTest`: 원본 요약만 있으면 summary 는 null 이다(지금은 원본을 씀)
    - `ArticleApiIntegrationTest` · `ArticleControllerTest`: `summarySource` 칸이 응답에 없다(`doesNotExist`). NEWSDATA 사례는 「원본만 있는 기사 → summary null」로 바꾼다
    - 픽스처는 `source_summary` 를 계속 넣는다. 그 값을 무시하는지 보려는 것이다
  - 그다음 코드를 고친다
    - `article/dto/SummarySource.java` 를 지운다
    - `ArticleSummaryResponse` 에서 `summarySource` 를 뺀다
    - `ArticleSummaryAssembler` 는 `summary = present(own) ? own : null` 로 바꾼다
    - `Article.sourceSummary` 필드를 지운다. 칸은 V3 까지 DB 에 남는다. `ddl-auto: validate` 는 엔티티에 없는 칸을 막지 않는다
  - 함께 고칠 문서
    - `docs/api-screen.md`: `summary` 줄, `summarySource` 줄을 지우고 예시 둘에서도 지운다
    - `docs/specs/F01-F11-article-api.md` AC-2
    - `docs/glossary.md` 53줄
    - `docs/api.md` FE 질문 5번
    - `docs/data-model.md`: ER 74줄, `source_summary` 줄(「안 씀 — V3 에서 지움」), 5절 16번을 지운다(정해짐)
- [ ] **B2 Swagger 정리**
  - 시험을 먼저 쓴다. 새 `common/web/OpenApiDocsTest` 는 `BackendApplicationTests` 와 같은 설정(Testcontainers · MockMvc)을 쓰고 `/v3/api-docs` 에서 다섯 가지를 본다
    - 태그 셋 `카테고리` · `이슈` · `기사` 가 이 순서로 설명과 함께 있다
    - 여섯 작업(A1 · A2 · A3 · A4 · A7 · A8)의 summary 가 모두 `[확정] A<번호>` 로 시작한다
    - A7 · A2 의 인자가 `query` 덩어리가 아니라 `page` · `size` 로 펼쳐지고, 인자마다 설명이 있다
    - 오류 응답이 붙어 있다: A7 · A2 는 400 · 404, A8 · A3 · A4 는 404. 본문 모양은 ProblemDetail 이다
    - `info.description` 에 「[확정]」 뜻풀이가 있다
  - 그다음 코드를 고친다
    - `common/web/OpenApiConfig.java`: 뜻풀이를 쓴다. 「[확정] = docs/api.md 명세대로 만들고 시험을 마쳐 화면이 그대로 써도 됨, 표시 없음 = 만드는 중이라 바뀔 수 있음」. 태그 순서도 여기서 정한다
    - `ArticleController` · `CategoryController` · `IssueController`: `@Tag` · `@Operation` · `@Parameter` · `@ApiResponse` 를 단다
    - `PageQuery` 는 `@ParameterObject` 로 펼치고 칸마다 설명을 단다
- [ ] B → backend 머지 → backend → dev MR → 태그 MR(deploy/app) 머지 → Argo CD 반영 → 사이트 확인(검증 절)
- [ ] dev → 분야 브랜치 넷 반영, Jira Done, zoo_docs(learn · decisions · 화면 가이드 Swagger 캡처) · 메모리

## 바꿀 파일
- A: `docs/api-internal.md` · `docs/api.md` · `docs/api-screen.md` · `docs/data-model.md` · `SSOT.md` · 새 `docs/plans/2026-10-26-ai-answer-swagger.md`
- B 코드
  - `backend/src/main/java/kr/io/newlearn/article/` 아래 `ArticleSummaryAssembler.java` · `Article.java` · `dto/ArticleSummaryResponse.java` · `dto/SummarySource.java`(지움)
  - 컨트롤러 셋, `common/web/OpenApiConfig.java` · `common/web/PageQuery.java`
- B 시험: `ArticleSummaryAssemblerTest` · `ArticleApiIntegrationTest` · `ArticleControllerTest` · 새 `common/web/OpenApiDocsTest`
- B 문서: `docs/api-screen.md` · `docs/specs/F01-F11-article-api.md` · `docs/glossary.md` · `docs/api.md` · `docs/data-model.md`

## 안 바꿀 것
- DB 마이그레이션. V3(관심 이슈 · 스크랩 표, `primary_core_index`, `analysis_job.result`, `source_summary` 지우기)는 따로 한다. 이번에는 문서에 「V3」로만 적는다
- W1 받는 코드 · 새 상태 값(`NOT_ANALYZABLE` · `NO_EVENT`)의 구현은 W1 티켓에서 한다. 지금 `ArticleAnalysisStatus` 는 그대로 둔다
- 아직 없는 API(A5 · A6 · A9 · A13 ~ A19, 스크랩 · 관심 이슈)는 Swagger 에도 명세에도 더하지 않는다. 스크랩 · 관심 이슈 명세는 로그인(Jira 62 · 65) 뒤 MR-C 로 한다
- 지난 방문(보류) · 임베딩 `vector(N)` 차원 · 사건 판정 기준(AI 회의 뒤)
- DTO 필드마다 붙이는 Swagger 설명(`@Schema`). 이번에는 태그 · 작업 · 인자 · 오류까지만 하고, 필요하면 다음에 한다
- Swagger 공개 여부(계속 열어 둠) · 보안 설정 · 인증 코드
- `docs/mvp-overview.md` · PRD

## 리스크
- **A 와 B 가 `docs/data-model.md` 5절의 붙은 줄을 고친다**(A 는 15번, B 는 16번을 지움). 나중에 머지하는 쪽이 충돌한다. 그 브랜치에 dev 를 받아 손으로 푼다. 두 브랜치 모두 내 것이다. 다른 문서는 고치는 줄이 떨어져 있다
- **`summarySource` 를 빼면 쓰던 쪽이 깨질 수 있음**: 화면 코드에 0건이다. AI 워커는 기사 API 를 부르지 않는다. 남는 소비자는 Swagger · 사람뿐이다
- **Swagger 표시용 annotation 이 실제 인자 묶기를 바꿀 수 있음**: `@ParameterObject` · `@Parameter` 는 문서만 바꾼다. 기존 통합 시험(page · size · sort 검사)이 그대로 초록인지 본다
- **`Article.sourceSummary` 를 지운 뒤 기동 검사**: validate 는 엔티티 칸이 DB 에 있는지만 본다. 통합 시험(Testcontainers + Flyway V1 · V2)이 기동을 증명한다
- **AI 가 계약 안을 바꾸자고 할 수 있음**: A 는 AI 확인 전에 머지하지 않는다. B 는 A 와 이어지지 않아 따로 머지해도 된다
- **문서 크기**: `data-model.md` 가 475줄이고 A 에서 5줄쯤 는다. 커밋 게이트의 크기 검사가 막으면 줄이는 쪽으로 고친다

## 어떻게 검증하나
- **A**
  - 커밋 게이트(문서 검사)와 MR 파이프라인이 통과한다
  - `git grep` 으로 새 값을 확인한다. `primaryCoreIndex` · `NO_EVENT` · `NOT_ANALYZABLE` · `INPUT_NOT_ANALYZABLE` · `LLM_UNAVAILABLE` 이 api.md 2절 · api-internal 5 · 6절 · api-screen 에 서로 같은 이름 · 같은 뜻으로 있다
  - 임베딩 「정했다」가 SSOT · data-model 에 남지 않았다
  - AI 담당이 확인한다
- **B 기계 검사**: verifier 조수가 `.claude/stack.md` §3 의 backend 포맷 · 린트 · 테스트를 돌린다. 돈 시험 수를 적는다
- **B 되돌림 확인**
  - B1: 조립기 · DTO 를 고치기 전으로 돌리면 새 단언(원본만 → null, `summarySource` 없음)이 빨개진다
  - B2: 컨트롤러 셋 · OpenApiConfig · PageQuery 를 돌리면 `OpenApiDocsTest` 가 단언에서 빨개진다
- **B 사이트**(태그 MR 뒤 Argo CD 반영)
  - `curl -s https://newlearn.io.kr/v3/api-docs | jq '[.tags[].name], [.paths[][].summary]'` → 태그 셋, summary 여섯이 모두 `[확정]`
  - `curl -s 'https://newlearn.io.kr/api/v1/articles?size=1' | jq '.items[0] | has("summarySource")'` → false. 기사가 없으면 A8 · 빈 목록으로 대신 보고 그렇게 적는다
  - 브라우저에서 `https://newlearn.io.kr/swagger-ui.html` 을 캡처한다. 태그 · `[확정]` · 오류 응답이 보여야 한다
  - health 200, 다른 화면은 그대로
- **스펙 성공 기준**: F01-F11 AC-2(바뀐 문구대로 요약 null)는 B1 시험이, AC-1 · AC-3 ~ AC-7 은 기존 시험이 초록이면 그대로 지켜진다

## 되돌리는 법
- A: MR Revert. 문서만이라 다른 데 영향이 없다
- B: MR Revert(backend · dev 둘 다) → 다음 태그 MR 로 옛 이미지가 돌아온다. `summarySource` · 원본 요약 대체가 되살아난다. DB 칸(`source_summary`)은 그대로 있어 데이터 손실이 없다
- 🔴 되돌릴 수 없는 것: 없음. 지우는 데이터 · 마이그레이션이 없다
