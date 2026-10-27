# Jira 56 — A9 마인드맵 조회 · W1 EXTRACT 결과 저장

2026-10-27 사용자 승인. 작업 순서의 체크는 이 MR 에서 끝낸 것이다. 구현하며 달라진 것은 맨 아래.

## 무엇을 / 왜

지금 W1 에 EXTRACT 성공 결과가 오면 저장할 처리기가 없습니다. 그래서 500(`INTERNAL`)으로 끝나고 기사도 공개되지 않습니다(`docs/specs/F01-article-release-api.md:27`). 이 티켓에서 마인드맵을 저장하는 처리기(F03 기사 핵심 정보 구조화)와 화면이 읽을 A9(F04 기사 마인드맵 생성)를 만듭니다.

티켓 설명은 10-21 판입니다. 그 뒤에 대표 사건 번호 `primaryCoreIndex`(Jira 111), `NO_EVENT`(Jira 30 이 넘긴 일), 다시 분석하면 덮어쓰기(10-26)가 정해졌습니다. 이 셋까지 지금 명세대로 합니다.

## 지금 있는 것 · 빈 것 (2026-10-27 코드 확인)

| 있음 | 비어 있음 |
|---|---|
| `ArticleMindmap` 엔티티(칸 8개 · 생성자만) · `ArticleMindmapRepository`(요약 조회 하나) | EXTRACT 처리기(`AnalysisResultHandler` 구현이 main 에 하나도 없음) |
| `receiveResult` 흐름 — 처리기 저장 → EXTRACT 면 `markReleased`(처음 한 번만) → 성공 | `primary_core_index` 칸(마이그레이션 · 엔티티) |
| `ResultSchemaInvalidException` → 400 · 되돌림 · 한 번 다시 걸기 | A9 컨트롤러 · 서비스 · 응답 · 근거 대조 |
| `ErrorCode.MINDMAP_NOT_FOUND`, `GET /api/v1/articles/**` 로그인 없이 | `ArticleAnalysisStatus.NO_EVENT`, A8 의 그 계산 |
| A6 · A7 · A8 의 `summary` · `mindmapStatus` 는 행이 생기면 저절로 따라 바뀜(`ArticleSummaryAssembler`) | A9 Swagger `[확정]` · `OpenApiDocsTest` 항목 |

## 명세에 없던 경우 — 이렇게 정한다 (BE 안, `api-internal.md` 5절에 적음)

명세가 정한 400(가지 없음, 범위 밖 번호, `CORE` 가지 없이 온 번호)과 「근거만 지우고 잎은 남김」은 그대로 둡니다. 명세가 정하지 않은 경우는 아래처럼 처리합니다. 기준은 하나입니다. **화면을 그릴 수 없으면 거절하고, 버려도 화면이 같으면 고쳐서 받습니다.** 거절하면 GMS 를 한 번 더 부르기 때문입니다.

| 경우 | 처리 | 까닭 |
|---|---|---|
| `schemaVersion` 이 없거나 `mindmap-v1` 이 아님 | 400 | 모르는 모양을 저장하면 화면이 깨짐 |
| 모르는 가지 `type` · 같은 `type` 두 번 · `items` 가 빔 · 잎 `text` 가 없거나 공백뿐 | 400 | 가지 · 잎을 그릴 수 없음 |
| EXTRACT 성공인데 봉투의 `model` · `promptVersion` 이 없음 | 400 | DB 칸이 `not null` 이라 그대로 두면 500. 워커 잘못으로 보고 거절 |
| 가지 순서가 표와 다름 | 표 순서(CORE · CAUSE · REACTION · OUTLOOK)로 바꿔 저장 | 순서만 다름. 다시 부를 일이 아님 |
| 근거 칸이 빠졌거나 타입이 틀림 | 그 근거만 지움(지운 개수에 셈) | 「맞지 않는 근거만 지운다」와 같은 규칙 |
| `primaryCoreIndex` 가 null 인데 `occurredAt` 이 옴 | `occurredAt` 을 null 로 | 명세: 번호가 null 이면 시점도 null |

- 저장은 받은 JSON 을 그대로 두지 않습니다. 위 모양(`title` · `branches[].type` · `items[].text` · `evidence[]`)으로 다시 써서 저장합니다. 모르는 칸은 버립니다. 모양이 바뀌면 `schemaVersion` 을 올리는 것이 약속이라서입니다.
- 「발행일보다 뒤인 `occurredAt` 은 null」은 AI 안대로 워커가 합니다. API 는 다시 확인하지 않습니다.

## 바꿀 파일

**DB · 저장(W1)**
- `backend/src/main/resources/db/migration/V5__article_mindmap_primary_core_index.sql`(새) — `primary_core_index int` 칸(null 가능, `check (primary_core_index >= 0)`)
- `mindmap/ArticleMindmap.java` — `primaryCoreIndex` 칸, 다시 분석 때 덮어쓰는 `replaceWith(...)`
- `mindmap/MindmapContent.java`(새) — `content` jsonb 의 모양(record: title · branches · items · evidence). 저장과 A9 가 같이 씀
- `mindmap/dto/ExtractResult.java`(새) — `result` 를 읽고 위 표대로 검사. 거절하면 `ResultSchemaInvalidException`
- `mindmap/EvidenceChecker.java`(새) — 본문을 문단으로 나누고(줄바꿈으로 나누기 → 줄마다 `strip()` → 빈 줄 빼기) 근거를 글자 그대로 대조. 남긴 근거와 지운 개수를 돌려줌
- `mindmap/ExtractResultHandler.java`(새) — `AnalysisResultHandler`(EXTRACT) 구현
  - 순서: 봉투 검사 → `ExtractResult` → 근거 대조 → 행이 없으면 저장, 있으면 덮어쓰기 → 지운 개수 로그
  - 공개는 하지 않음(`receiveResult` 몫). article 행도 잠그지 않음(`AnalysisResultHandler` 주석의 잠금 순서)

**조회(A9 · A8)**
- `mindmap/MindmapController.java` · `MindmapService.java`(새) — `GET /api/v1/articles/{articleId}/mindmap`
  - 없거나 공개 전인 기사는 404 `ARTICLE_NOT_FOUND`(A8 과 같은 `findByIdAndReleasedAtIsNotNull`), 행이 없으면 404 `MINDMAP_NOT_FOUND`
  - Swagger 는 기사 태그에 `[확정] A9`, 응답 200 · 400 · 404
- `mindmap/dto/MindmapResponse.java`(새) — `articleId` · `schemaVersion` · `generatedAt`(`ApiTime.toKst`) · `aiGenerated`(true) · `title`(`content.title` 이 비면 기사 제목) · `branches`(근거 뺌)
- `article/dto/ArticleAnalysisStatus.java` — `NO_EVENT`(A8 `eventMatchStatus` 에만)
- `article/ArticleService.java` — MATCH_EVENT 작업이 없을 때, 마인드맵이 있고 번호가 null 이면 `NO_EVENT`, 아니면 `NONE`
- `common/web/OpenApiConfig.java` — 기사 태그 설명에 F04

**시험**
- `mindmap/EvidenceCheckerTest`(새, 단위) — 문단 나누기(빈 줄 · 공백만 있는 줄 · `\r\n`), 대조(맞음 · 범위 밖 · 한 글자 다름 · `sentenceIndex` 는 안 봄)
- `mindmap/ExtractResultTest`(새, 단위) — 위 표의 거절 경우마다 하나, 고쳐 받는 경우마다 하나
- `MindmapApiIntegrationTest`(새, 실제 DB · 진짜 처리기)
  - W1 로 EXTRACT 결과를 보내면 저장되고 A9 · A8 이 바뀜
  - 거절이면 행이 없고, 기사는 비공개이고, 시도 2가 걸림
  - 이미 행이 있으면 덮어쓰고, 공개 시각은 그대로
- `OpenApiDocsTest` — `CONFIRMED` 에 A9
- `ArticleApiIntegrationTest` — `NO_EVENT` · `NONE` 줄
- 마인드맵 행을 쓰는 시험은 지울 때 `article_mindmap` 부터 지움(외래 키에 `on delete` 가 없음)

**문서**
- `docs/specs/F03-F04-mindmap.md`(새) — 아래 성공 기준
- `docs/api-internal.md` 5절 — 위 「명세에 없던 경우」 표
- `docs/data-model.md` — `primary_core_index` 「다음 마이그레이션에서」 → V5
- `docs/specs/F01-article-release-api.md:27` · `docs/specs/F03-F07-analysis-job-queue.md:36` · `docs/api.md` 5절 56번 메모 — 끝난 일로 고침
- `docs/plans/2026-10-27-mindmap-extract.md` — 승인한 계획 사본

## 작업 순서

- [x] Jira 56 진행 중, 브랜치 `feat/backend/S15P31A102-56-mindmap` ← `origin/backend`
- [x] 커밋 1 「저장」 — V5 · 엔티티 · `MindmapContent` · `ExtractResult` · `EvidenceChecker` · 처리기 + 단위 시험 · W1 통합 시험. 시험을 먼저 써서 빨강을 보고 → 구현 → 초록
- [x] 커밋 2 「조회」 — A9 · `NO_EVENT` · Swagger + 그 시험. 같은 순서
- [x] 커밋 3 「문서」 — 스펙 · api-internal · data-model · 끝난 메모 · 계획 사본
- [ ] `/verify`(되돌림 확인 포함) → reviewer 조수 → MR → `backend` → `dev`(머지 직전마다 원격 dev · 열린 MR) → 태그 MR → 사이트 → 브랜치 맞추기 → Jira 56 완료

## 성공 기준 (`docs/specs/F03-F04-mindmap.md` 에 그대로)

- AC-1 W1 EXTRACT 성공이면 204 를 줍니다. `article_mindmap` 에 `summary` · `content` · `primary_core_index` · `occurred_at` · `schema_version` · `model` · `prompt_version` · `generated_at`(= `finishedAt`)이 들어가고 기사가 공개됩니다
- AC-2 근거 대조
  - 맞는 근거는 남고, 범위 밖 문단 · 한 글자라도 다른 근거만 지워집니다
  - 잎은 남고, 지운 개수는 로그에 남습니다
  - 문단은 빈 줄 · 공백만 있는 줄 · `\r\n` 을 같은 규칙으로 나눕니다
- AC-3 명세의 400 과 위 표의 거절 경우에는 400 `RESULT_SCHEMA_INVALID` 를 줍니다. 행은 저장되지 않고 기사는 공개되지 않으며, 한 번 다시 걸립니다
- AC-4 고쳐 받는 경우(가지 순서 · 잘못된 근거 칸 · 번호 없이 온 `occurredAt`)는 고친 모양으로 저장됩니다
- AC-5 이미 마인드맵이 있는 기사에 성공이 오면 덮어씁니다. 공개 시각은 그대로입니다
- AC-6 A9 는 근거를 뺀 `branches` 를 줍니다. `title` 은 비면 기사 제목이고, `aiGenerated` 는 true, `generatedAt` 은 KST 입니다
- AC-7 A9 는 없거나 공개 전인 기사에 404 `ARTICLE_NOT_FOUND`, 결과가 없으면 404 `MINDMAP_NOT_FOUND` 를 줍니다
- AC-8 A8 `eventMatchStatus` 는 MATCH_EVENT 작업이 없고 번호가 null 이면 `NO_EVENT`, 번호가 있으면 `NONE` 입니다
- AC-9 Swagger 에 `[확정] A9` 와 응답 200 · 400 · 404 가 보입니다

## 안 바꿀 것

- MATCH_EVENT · ISSUE 를 거는 일, EMBED · 판정 · 이슈 저장(Jira 35 · 40). 「번호가 null 이면 판정을 걸지 않는다」도 판정을 거는 35 의 몫
- 다시 분석을 거는 길(API · 화면). 덮어쓰기만 함
- 공개 규칙(`receiveResult` 의 `markReleased`), 큐 · 재시도 · 409 처리(Jira 30 · 34)
- `JobResultRequest` 의 `@Nullable` 표시(린트의 남은 일). 처리기 안에서 null 을 직접 확인
- 근거를 화면에 보이기(F05), 노드 상세 창, 마인드맵 렌더링(FE)
- 이미 적용된 마이그레이션 V1 ~ V4, 보안 설정, A6 · A7 의 응답 모양, AI 워커 코드

## 리스크

- **마이그레이션 번호가 겹칠 수 있음** — BE 팀원 티켓 63 · 64 도 「dev 의 가장 큰 번호 다음」을 씁니다. 지금은 V4 가 끝이라 V5 를 씁니다. 팀원이 먼저 V5 를 머지하면 MR 전에 번호를 다음으로 옮깁니다(머지 직전 원격 dev 확인)
- **AI 워커가 아직 EXTRACT 를 만들지 않음** — 결과 모양은 문서에만 있습니다(`ai/` 에 코드 없음). 워커가 다른 모양으로 보내면 400 이 나고 다시 한 번 걸립니다. 그래서 「명세에 없던 경우」 표를 api-internal 5절에 적어 두고, AI 팀에는 MR 링크로 알립니다(사용자가)
- **기사가 화면에 처음 보이게 되는 변경** — 지금까지는 EXTRACT 가 성공해도 500 이라 공개된 기사가 0건이었습니다. 이 MR 뒤에는 워커가 결과를 보내는 순간부터 기사가 보입니다. 사이트 워커는 아직 mock 이고 결과를 보내지 않아서 당장은 그대로입니다
- **문단 나누기가 Java 와 Python 에서 다를 수 있음** — 줄바꿈 없는 공백(U+00A0)은 `String.strip()` 이 지우지 않고 Python `strip()` 은 지웁니다. 지금 NewsData 본문은 줄바꿈이 없어 문단이 늘 하나라 영향이 거의 없습니다(`data-model.md:245`). 스펙에 적어 둡니다
- **기존 시험의 정리 순서** — `article_mindmap` 행이 생기면 `article` 을 지우는 정리가 외래 키로 막힐 수 있습니다. 새 시험의 정리에 넣고, 기존 시험이 깨지면 그 정리에도 넣습니다

## 어떻게 검증하나

- `./gradlew spotlessCheck compileJava compileTestJava test` — 경고 0, 시험 개수가 늘고(지금 197) 모두 통과
- **되돌림 확인** — 구현 파일만 고치기 전으로 돌리면 새 시험이 단언에서 빨개지는지
- AC 마다 시험 이름을 스펙에 적고 하나씩 짚음 — AC-1 ~ 5 는 `MindmapApiIntegrationTest` · 단위 시험, AC-6 ~ 8 은 A9 · A8 통합 시험, AC-9 는 `OpenApiDocsTest`
- `/v3/api-docs` 전후 비교 — 바뀐 곳이 A9 추가 · `NO_EVENT` · 기사 태그 설명뿐인지
- 사이트(태그 MR 머지 뒤)
  - 서버의 backend 이미지 태그가 바뀌었는지, 교체 동안 health 실패 0
  - `GET /api/v1/articles/999999/mindmap` 이 404 `ARTICLE_NOT_FOUND` problem+json 인지(지금은 경로가 없어 다른 404)
  - Swagger 에 `[확정] A9`
  - 공개된 기사가 0건이라 저장 · 조회 전체 흐름은 사이트에서 못 봄 — 통합 시험(실제 PostgreSQL)으로 확인하고, 그 한계를 보고에 적음
- reviewer 조수 — 명세와 다른 곳 · 빠진 거절 경우 · null 처리

## 되돌리는 법

- MR 을 Revert 해서 backend → dev → 태그 MR 순으로 올립니다. 처리기가 없어지면 EXTRACT 성공은 다시 500 이 되고, 기사는 공개되지 않는 지금 상태로 돌아갑니다
- 🔴 **V5 마이그레이션은 Revert 로 지워지지 않습니다.** Flyway 는 적용된 마이그레이션을 되돌리지 않고, 파일을 지우면 다음 시작 때 검사가 실패합니다. 되돌릴 때는 V5 파일을 남기고 코드만 되돌립니다. 칸은 null 가능 칸 하나라 남아도 옛 코드에 영향이 없습니다. 칸을 지워야 하면 새 마이그레이션(V6 `drop column`)으로 합니다
- 사이트에 공개된 기사가 0건이라, 되돌려도 지워질 화면 데이터는 없습니다

## 구현하며 달라진 것

- 거절 경우 둘을 더했다 — `primaryCoreIndex` 가 있는데 `occurredAt` 을 시각으로 못 읽음, `summary` 가 문자열도 null 도 아님. 같은 기준(판정 · 화면에 쓸 값을 못 읽음)이라 `api-internal.md` 5절 표에 같이 적었다
- `EvidenceChecker` 는 비거나 공백뿐인 근거 글자를 틀림으로 본다 — 빈 글자는 어느 문단에나 「들어 있다」
- `MindmapContent` 의 목록 칸은 JSON 에 없으면 빈 목록으로 읽는다 — 옛 행 · 시험이 손으로 넣은 `content '{}'` 를 A9 가 읽어도 터지지 않게
- `NO_EVENT` 시험은 `ArticleApiIntegrationTest` 한 줄(픽스처 4204) 말고도 `MindmapApiIntegrationTest` 에 W1 → A8 흐름으로 하나 더 뒀다
- 엔티티 생성자가 `replaceWith` 를 부르던 것을 칸 대입으로 바꿨다 — NullAway 는 생성자가 부른 메서드 안까지 따라가 보지 않는다
