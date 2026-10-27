# F01 뉴스 데이터 적재·조회 — B1 기사 투입 · 기사가 보이는 때

계약 원본은 [B1](../api-internal.md) 2절, [공개 전 기사](../api.md) 1절, [article.released_at](../data-model.md) 2절이다. 이 문서는 Jira S15P31A102-34 의 검증 기준과 그 기준을 지키는 시험만 둔다. 수집 배치(NewsData 받기 · 정규화 · 중복 · CronJob)는 보류라 여기 없다.

2026-10-26 사용자 결정: 기사는 분석이 끝난 뒤부터 보인다. 그래서 B1 은 분석만 걸고, 기사가 보이기 시작하는 때(`released_at`)는 EXTRACT 결과를 처음 저장한 때다.

시험은 실제 PostgreSQL · Redis 로 돈다(`TestcontainersConfiguration`). 클래스 이름이 없는 시험은 `ArticleReleaseIntegrationTest` 다.

- AC-1: B1 은 배치 출입증으로 202 와 건 작업(`EXTRACT` · `EMBED`, 작업 ID · 시도 1)을 준다. 커밋 뒤 투입 메시지 하나가 `analysis.released` 에 들어가고, 기사는 아직 화면에 없다(A8 404)
  — `releaseQueuesExtractAndEmbedButKeepsTheArticleHidden`
- AC-2: 이미 투입한 기사(분석 작업이 있음)나 이미 화면에 있는 기사(`released_at` 있음)는 409 `ALREADY_RELEASED` 이고 작업을 더 만들지 않는다
  — `secondReleaseIs409` · `alreadyPublicArticleIs409`
- AC-3: 없는 기사는 404 `ARTICLE_NOT_FOUND`
  — `unknownArticleIs404`
- AC-4: B1 은 배치 출입증으로만 연다. 워커 출입증이면 403
  — `workerKeyCannotRelease` · `SecurityRulesTest.internalKeyOpensOnlyItsOwnDoor`
- AC-5: 같은 기사 투입 둘이 동시에 와도 하나만 통과하고 나머지는 409 다
  — `concurrentReleasesQueueOnce`
- AC-6: EXTRACT 결과를 처음 저장하면 기사가 화면에 보인다(A8 200). 다시 분석해 성공해도 처음 공개 시각은 그대로다
  — `AnalysisJobQueueIntegrationTest.extractSuccessReleasesTheArticleOnce`
- AC-7: EXTRACT 가 실패하거나, EMBED 만 성공하거나, 처리기가 결과를 거절하면 공개되지 않는다
  — `AnalysisJobQueueIntegrationTest.onlyExtractSuccessReleases` · `rejectedResultIsRolledBackRetriedOnceThenStops`

## 이 티켓에서 하지 않는 것

- 수집 배치 · `ingest_run` 기록 · URL 정규화 · 언론사 대응 — 보류(다시 열 때 새 티켓)
- EXTRACT 결과 저장(마인드맵 · 요약) — Jira 56(`F03-F04-mindmap.md`). 2026-10-27 부터 W1 EXTRACT 성공이 저장되고 그때 기사가 공개된다. 그 전에는 처리기가 없어 500(`INTERNAL`)이었다
