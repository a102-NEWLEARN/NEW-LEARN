# Jira 34 — B1 기사 투입 내부 API · 기사가 보이는 때를 「분석이 끝난 뒤」로

## 무엇을 / 왜

수집 배치(보류)를 빼고 B1 `POST /internal/v1/articles/{articleId}/release` 만 만든다. AI 팀이 mock 워커로 B1 → 큐 → W1 흐름을 맞추려면 기사를 투입하는 입구가 필요하다. 2026-10-26 사용자가 `data-model.md` 5절 8번(기사가 언제 화면에 보이나)을 **「분석이 끝난 뒤부터」**로 정했다. 그래서 B1 은 분석만 걸고, 기사가 보이기 시작하는 때(`released_at`)는 EXTRACT 결과를 처음 저장할 때로 옮긴다.

## 정한 것

| 항목 | 정한 것 |
|---|---|
| 기사가 보이는 때 (2026-10-26 사용자) | EXTRACT 결과를 처음 저장한 때 `released_at` 을 서버 시각으로 채운다. 다시 분석해도 그대로. EXTRACT 가 끝내 실패한 기사(분석할 내용 없음 · 거절 등)는 화면에 나오지 않는다 |
| 채우는 자리 | `AnalysisJobService.receiveResult` 의 성공 길 — 단계가 EXTRACT 면 처리기 저장 뒤 기사를 공개한다(처음만). 56 이 EXTRACT 처리기를 더해도 자리는 그대로라 56 이 따로 기억할 것이 없다 |
| B1 | 기사 행을 잠그고 읽는다 → 없으면 404 `ARTICLE_NOT_FOUND` → EXTRACT 작업이 이미 있거나 `released_at` 이 있으면 409 `ALREADY_RELEASED` → `AnalysisJobService.queueRelease`(30, 커밋 뒤 큐) → 202. 같은 기사 B1 두 개가 동시에 와도 행 잠금으로 하나만 202 |
| 202 본문 | `{ "articleId": 456, "jobs": [{ "jobId": 789, "stage": "EXTRACT", "attempt": 1 }, { "jobId": 790, "stage": "EMBED", "attempt": 1 }] }` — 사람 · AI 가 시험할 때 W1 에 넣을 작업 ID 를 바로 보게. 배치는 읽지 않아도 된다 |
| 결과로 생기는 것 | 화면에 보이는 기사는 모두 마인드맵 결과가 있어 `mindmapStatus` 가 사실상 늘 `SUCCEEDED` 다. 「분석 중」(`QUEUED`) · `NOT_ANALYZABLE` 은 기사 목록 · 상세에 나오지 않는다. 값은 계약에 그대로 둔다(보이는 때를 다시 바꿀 때 대비). FE 에 알린다 |

## 바꿀 파일

- `backend/.../ingest/ArticleReleaseInternalController.java`(새) — B1, 202 + 본문. 직원용 문 배치 키 규칙(`/internal/v1/articles/**`)은 이미 있다
- `backend/.../ingest/ArticleReleaseService.java`(새) — 잠금 · 404 · 409 · `queueRelease`
- `backend/.../ingest/dto/ArticleReleaseResponse.java`(새)
- `backend/.../article/Article.java` — `markReleased(Instant)` (처음만 채움)
- `backend/.../article/ArticleRepository.java` — `findForUpdate(id)`(PESSIMISTIC_WRITE)
- `backend/.../analysis/AnalysisJobRepository.java` — `existsByArticle_IdAndStage`
- `backend/.../analysis/AnalysisJobService.java` — 성공 길에서 EXTRACT 면 기사 공개
- 시험: `ArticleReleaseIntegrationTest`(새, 실제 PostgreSQL · Redis), `AnalysisJobQueueIntegrationTest` 에 공개 시험
- 문서
  - `docs/api-internal.md` 2절(B1 뜻 · 202 본문 · 409 뜻), 6절 화면 상태 메모
  - `docs/data-model.md` `released_at` 줄(「공개 시각 — EXTRACT 결과를 처음 저장한 때」), 5절 8번은 정함으로 옮김
  - `docs/api.md` 1절 「투입 전 기사」 → 「공개 전 기사」 문구, 5절 Jira 34 줄
  - `docs/api-screen.md` `mindmapStatus` 줄에 「목록 · 상세에 보이는 기사는 결과가 있다」 한 줄
  - `SSOT.md` 9절 「뒤집은 것」 한 줄(B1 때 보임 → EXTRACT 저장 때 보임)
  - 새 스펙 `docs/specs/F01-article-release-api.md`(AC), 승인한 계획 사본 `docs/plans/2026-10-26-article-release.md`

## 작업 순서

- [x] Jira 34 진행 중, 브랜치 `feat/backend/S15P31A102-34-article-release` ← `origin/backend`
- [x] ① 공개 시점 — EXTRACT 성공이면 `released_at`(처음만) + 시험(성공 → 공개 · A7 에 나옴, 실패 → 안 보임, 다시 분석 성공 → 그대로)
- [x] ② B1 — 컨트롤러 · 서비스 · 잠금 + 시험(202 · 본문 · 커밋 뒤 메시지 · `released_at` 은 아직 빔, 두 번째 409, 이미 공개 409, 없는 기사 404, 동시 둘 → 하나만 202, 워커 키 403)
- [ ] ③ 문서 · 스펙 · 계획 사본 → reviewer → MR → backend
- [ ] backend → dev → 태그 MR → 사이트 확인 → 브랜치 맞추기(FE 반영 MR 본문에 알림) → Jira 34 완료 · zoo_docs

## 안 바꿀 것

- 수집 배치 · NewsData 받기 · 정규화 · 중복 · CronJob · `ingest_run` 기록(보류, 다시 열 때 새 티켓)
- EXTRACT 결과 저장(56), 마이그레이션(칸은 그대로 — `released_at` 의 뜻만 바뀜), `mindmapStatus` 값 목록, 보안 규칙
- 기사를 적재하는 길(배치가 DB 에 바로 넣나 API 를 부르나 — `SSOT.md` 8절 그대로 미정)

## 리스크

- **56 전에는 W1 EXTRACT 성공이 끝까지 못 간다** — EXTRACT 처리기가 없어 500 · `INTERNAL` 로 남고 기사도 공개되지 않는다. AI 팀이 mock 흐름을 끝까지 맞추려면 56 이 이어서 필요하다. 34 만으로는 B1 → 큐 메시지 → W1(실패 보고 · 404 · 409)까지 시험할 수 있다
- **56 이 들어오기 전 사이트에 보이는 기사가 0** — 지금도 사이트 기사는 0 이라 달라지는 것은 없다
- **같은 기사 B1 동시 호출** → 기사 행 잠금으로 하나만 통과, (기사 · 단계) 고유 키가 한 번 더 막는다
- **기존 시험 픽스처**는 `released_at` 을 직접 넣어 영향 없음. 화면 시험(A6 · A7 · A8)은 그대로 통과해야 한다

## 어떻게 검증하나

- 시험(실제 PostgreSQL · Redis): 위 ① · ② 의 경우마다 하나 이상. 기존 backend 시험 전부 통과
- 되돌림 확인 — 공개 처리 · 409 검사 · 잠금을 하나씩 빼면 새 시험이 단언에서 실패하는지
- 로컬 실행: 확인용 DB · Redis 에 기사 행을 SQL 로 넣고 배치 키로 B1 → 202 본문, `XRANGE analysis.released` 에 메시지, 두 번째 409, 그 기사가 A7 에 아직 없음
- 사이트(반영 뒤, 운영 DB 에 기사를 넣지 않는다): 클러스터 안에서 B1 배치 키 + 없는 기사 404 `ARTICLE_NOT_FOUND`, 워커 키 403, 키 없음 401. health · 기존 화면 API 그대로
- reviewer 조수: 잠금 · 409 판정, 공개 시점이 W1 트랜잭션 안에서 처리기와 같이 되돌아가는지(처리기가 거절하면 공개도 안 됨)

## 확인한 것 · 계획 뒤 바뀐 것

- 시험: 큐 통합 18개(공개 시험 2개 더) · B1 통합 6개 통과. 되돌림 확인 — 공개 처리 빼기(구현 전 빨강), 409 검사 빼기 → 3개 실패, 행 잠금 빼기 → 동시 시험 실패, 공개 시각 덮어쓰기 → 다시 분석 시험 실패
- 큐 통합 시험의 기사 헬퍼를 공개 전(`released_at` 빔)으로 넣게 바꿨다 — 공개가 EXTRACT 성공 때라서
- 서비스 이름은 계획의 `ArticleReleaseService` 그대로

## 되돌리는 법

- MR 을 Revert(backend → dev). 마이그레이션이 없어 코드만 돌아간다
- Revert 하면 「B1 때 보임」도 아니고 B1 자체가 없어진다 — 그때 공개 시점을 되돌리려면 `SSOT.md` 9절 줄을 지운다
