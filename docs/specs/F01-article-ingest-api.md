# F01 뉴스 데이터 적재·조회 — B2 기사 적재

계약 원본은 [B2](../api-internal.md) 2절, [press · article](../data-model.md) 2절이다. 이 문서는 Jira S15P31A102-153 의 검증 기준과 그 기준을 지키는 시험만 둔다. 계획은 `docs/plans/2026-11-03-article-ingest-api.md`.

2026-11-03 인프라 담당 결정: 본문이 없는 기사는 400(배치도 미리 거른다), 연예 · 스포츠는 배치가 거른다, 처음 보는 언론사는 `source_id` 로 자동 등록, B1 은 배치가 따로 부른다. 2026-11-04 부터 배치는 넣기만 모드(B2 만)로 돌고 B1 은 AI 결과 덤프 뒤 켠다(Jira 156, `infra/server/ingest.md`) — B2 계약은 그대로다.

시험은 실제 PostgreSQL 로 돈다(`TestcontainersConfiguration`). 클래스 이름이 없는 시험은 `ArticleIngestIntegrationTest` 다.

- AC-1: 새 기사는 201 · `created: true` 와 id 다. 행은 `NEWSDATA` 이고 받은 칸 그대로, `released_at` 은 비고 A8 은 404 다. 기자명이 빈 값이면 null, 원본 분류가 없으면 빈 목록, 태그가 없으면 null
  — `newArticleIsStoredHiddenAndReturns201` · `optionalFieldsFallBack`
- AC-2: 같은 URL 은 200 · `created: false` 와 같은 id 다. 두 번째 요청의 칸 값 · 처음 보는 언론사로 아무것도 바뀌지 않는다. 같은 URL 을 다른 연결이 커밋 없이 넣고 있으면 요청은 유일 키에서 기다렸다가, 그쪽이 커밋하면 200 과 그 기사의 id 를 받는다
  — `sameUrlReturnsTheSameArticleAndChangesNothing` · `sameUrlInFlightWaitsOnUniqueKeyThenReturnsThatArticle`
- AC-3: 처음 보는 언론사는 언론사(코드 = `pressSourceId`, 이름 = `pressName`)와 대응 행이 생긴다. 같은 `source_id` 의 두 번째 기사는 새로 만들지 않고 처음 이름이 남는다. 같은 코드의 언론사만 있으면 대응만 붙고 이름은 그대로다. 대응 행이 있으면 그 행의 언론사를 쓴다
  — `unknownPressIsRegisteredOnce` · `existingPressCodeGetsOnlyAMapping` · `mappedPressWinsOverSourceId`
- AC-4: `publishedAt` 은 같은 순간으로 저장된다(`2026-11-02T23:15:46Z` → `2026-11-03T08:15:46+09:00`). 오프셋이 없으면 400 `errors[publishedAt]`
  — `newArticleIsStoredHiddenAndReturns201` · `publishedAtWithoutOffsetIs400`
- AC-5: 필수 값(`url` · `pressSourceId` · `pressName` · `title` · `body` · `publishedAt`)이 없거나 비었거나 길이를 넘거나, 목록이 20개를 넘거나 항목이 비었거나 100자를 넘으면 400 `errors[칸]` 이고 아무것도 저장하지 않는다
  — `invalidFieldIs400AndStoresNothing`
- AC-6: `http(s)` 가 아닌 URL(`ftp:` · `javascript:` · `mailto:` · 호스트 없음 · 상대 주소 · scheme 없음)은 400 `errors[url]`. 한글 경로 · 대문자 scheme 링크는 받는다
  — `nonHttpUrlIs400` · `realWorldLinksAreAccepted`
- AC-7: U+0000 이 든 글자 칸 · 목록 항목은 400
  — `nulIs400`
- AC-8: 대표 카테고리 — 원본 값이 모두 대응 표에 있으면 칸이 찬 행 중 `priority` 가 가장 작은 것(같으면 카테고리 순서), 하나라도 없으면 빈다. NewsData 실제 값은 V11 대응 행(Jira 170) — 확인: `ArticleIngestIntegrationTest.newsDataValuesFromV11PickTheMostSpecificCategory`, 마이그레이션의 다시 계산은 `CategoryMappingMigrationTest`
  — `categoryIsChosenOnlyWhenEveryValueIsKnown`
- AC-9: B2 는 배치 출입증으로만 연다. 워커 출입증은 403, 출입증이 없으면 401
  — `onlyTheBatchKeyCanIngest` · `SecurityRulesTest.internalKeyOpensOnlyItsOwnDoor` · `SecurityRulesTest.internalApisWithoutValidKeyAreUnauthorized` · `SecurityRulesTest.matchingKeyPassesWithoutCsrfOrSession`
- AC-10: 저장이 URL 이 아닌 까닭(기본 키 충돌)으로 실패하면 같은 URL 로 잘못 읽지 않고 500 `INTERNAL_ERROR` 이고 행이 생기지 않는다
  — `primaryKeyCollisionIsNotReadAsSameUrl`

## 이 티켓에서 하지 않는 것

- 수집 배치 · CronJob · 거르는 조건(본문 없음 · 연예 · 스포츠) — Jira 154
- 원본 분류 → 카테고리 대응 행 — 이 티켓 밖. NewsData 행은 마이그레이션 V11 이 넣는다(Jira 170, `data-model.md` 2절 category_mapping). 표에 없는 값이 끼면 대표 카테고리가 빈다
- URL 정규화, 언론사 묶기(대응 행 바꾸기), `ingest_run` 기록
