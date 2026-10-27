# F06 동일 사건 기사 클러스터링 — W1 EMBED · MATCH_EVENT 저장 · 판정 걸기

계약 원본은 [큐 모양과 순서](../api-internal.md) 3절, [`analysis.match_event` 메시지](../api-internal.md) 4절, [W1 EMBED · MATCH_EVENT 결과](../api-internal.md) 5절, [article_embedding · event · article_event](../data-model.md) 2절이다. 이 문서는 Jira S15P31A102-35 의 검증 기준과 그 기준을 지키는 시험만 둔다. 계획은 `docs/plans/2026-10-27-event-match.md`.

시험은 실제 PostgreSQL(pgvector) · Redis 로 돈다(`TestcontainersConfiguration`). 클래스 이름이 없는 시험은 `EventMatchIntegrationTest` 다 — 진짜 처리기로 W1 을 부르고, 워커가 받을 메시지는 Redis 에서 꺼내 본다. 1분 스케줄러는 시험에서 꺼 두어 판정 고르기는 W1 뒤와 `AnalysisJobService.dispatchMatch()` 로 부른다.

- AC-1: W1 EMBED 성공이면 `article_embedding` 에 벡터를 저장한다(다시 오면 덮어씀, 행은 하나). `model` 이 비거나 `dimension` 이 1024 가 아니거나 `vector` 길이가 다르거나 유한한 숫자가 아닌 값이 있으면 400 `RESULT_SCHEMA_INVALID` 이고 저장하지 않는다
  — `embedSuccessStoresTheVector` · `embedAgainOverwritesTheVector` · `embedWithWrongDimensionIsRejected` · `EmbedResultTest`(12개)
- AC-2: EXTRACT · EMBED 가 모두 성공하고, 대표 사건 번호가 있고, 아직 사건에 안 묶인 기사에만 판정(MATCH_EVENT)이 걸린다. 어느 쪽이 나중에 끝나도, 두 결과가 동시에 와도 판정 작업은 하나다
  — `matchIsQueuedAfterBothExtractAndEmbedSucceed` · `matchIsQueuedWhicheverFinishesLast` · `noMatchWithoutPrimaryCoreOrWhenAlreadyLinked` · `concurrentExtractAndEmbedQueueExactlyOneMatch`
- AC-3: 판정은 한 번에 하나다. 진행 중(`QUEUED`, 또는 실패했는데 다시 걸 예정)인 판정이 있으면 다음 기사는 기다리고, 멈춘 실패는 넘어간다. 걸 때는 판정할 기사 중 발행 시각이 가장 이른 것을 고른다. 판정 결과를 저장하면 바로 다음 기사가 걸린다
  — `matchesOneAtATimeInPublishedOrder` · `theNextArticleSeesTheEventTheFirstOneCreated`
- AC-4: 후보는 기사 벡터가 가까운 사건 최대 5개, 가까운 순서다(사건은 그 사건 기사 중 가장 가까운 것으로 잰다). `similarity` 는 1 − 코사인 거리를 0 ~ 1 로 자른 값이다. 후보는 `analysis_job.candidates` 에 `[{eventId, similarity}]` 로 남고, 메시지에 기사 · `extracted`(요약 · 시점 · 마인드맵 · `primaryEvent`) · 후보(사건 칸 · 첫 기사의 대표 잎 근거 최대 3문장 · `similarity`)가 실린다. 후보가 없어도 판정을 건다
  — `candidatesAreTheNearestFiveEvents` · `messageCarriesThePrimaryEventAndCandidateEvidence` · `matchIsQueuedEvenWithoutCandidates` · `CandidateEventFinderTest.similarityIsOneMinusDistanceClampedToZeroAndOne` · `MindmapContentTest.coreReturnsTheCoreLeafAtTheIndexOrNull`
- AC-5: `EXISTING` 이면 기사가 그 사건에 붙고 사건의 이름 · 키워드 · 요약은 그대로다. 사건 시점이 발행 시각으로 채운 것(`FIRST_PUBLISHED`)이고 붙는 기사가 더 이르면 그 발행 시각으로 당긴다. 본문에서 뽑은 시점(`EXTRACTED`)은 당기지 않고, 더 늦은 기사가 붙어도 늦추지 않는다
  — `existingLinksTheArticleAndKeepsTheEvent` · `existingPullsAFirstPublishedOccurredAtEarlier` · `theNextArticleSeesTheEventTheFirstOneCreated`
- AC-6: `NEW` 면 사건을 만들고(발생 시점 = EXTRACT 가 뽑은 시점 · `EXTRACTED`, 없으면 이 기사의 발행 시각 · `FIRST_PUBLISHED`, 이슈는 비움) 기사를 붙이고 ISSUE 작업을 만든다. ISSUE 메시지 공장은 Jira 40 이라 큐에는 아직 넣지 않는다
  — `newCreatesTheEventAndAnIssueJob` · `newWithoutAnExtractedTimeUsesThePublishedTime`
- AC-7: 판정 기록 `{reason, model, promptVersion}` 이 `analysis_job.result` 에 남는다
  — `existingLinksTheArticleAndKeepsTheEvent` · `newCreatesTheEventAndAnIssueJob`
- AC-8: `api-internal.md` 5절 「API 가 MATCH_EVENT 결과를 받을 때」의 거절 경우(후보 밖 사건 · 빈 이름 · 키워드 · 요약 · 빈 까닭 등)는 400 `RESULT_SCHEMA_INVALID` 다. 사건 · 연결 · ISSUE 작업을 만들지 않고 한 번 다시 건다
  — `existingOutsideTheCandidatesIsRejected` · `newWithABlankLabelIsRejected` · `MatchEventResultTest`(18개)
- AC-9: A8 `eventMatchStatus` 가 판정 작업 상태(`QUEUED` · `SUCCEEDED` · `FAILED`)를 보이고, 사건에 묶이면 `event` 가 채워진다
  — `existingLinksTheArticleAndKeepsTheEvent`(A8 을 불러 봄) · `ArticleApiIntegrationTest.statusesAndOptionalRelationsFollowStoredFacts`
- AC-10: 후보 찾기 시간을 1만 7천 건 정확 검색으로 잰 값이 `SSOT.md` 10절에 있다
  — 2026-10-27 줄(데워진 뒤 중앙값 약 77ms)
- AC-11(구현 중 더함): 1분 스케줄러의 「못 넣은 작업 넣기」는 메시지 공장이 있는 단계만 읽는다. 공장이 없는 단계(Jira 40 전의 ISSUE)의 작업이 한 번에 읽는 수(100)를 채워도 다른 단계의 작업이 막히지 않는다
  — `AnalysisJobQueueIntegrationTest.jobsWithoutAMessageFactoryDoNotCrowdOutOthers`

## 알아 둘 것

- 판정을 거는 곳은 `MatchDispatcher` 하나다. 처리기 안에서 걸지 않고, 커밋이 끝난 상태만 보고 다음 기사를 고른다. W1 처리 뒤(성공 · 실패 모두)와 1분 스케줄러가 새 트랜잭션에서 부른다. API Pod 둘이 같이 골라도 트랜잭션 잠금(`pg_advisory_xact_lock`) 하나로 줄을 선다. 같은 기사를 두 번 거는 일은 `unique (article_id, stage)` 가 먼저 막아서, 동시 시험은 잠금이 없어도 초록이다 — 잠금이 막는 것(서로 다른 두 기사를 동시에 거는 것)은 시험으로 재현하지 못했다
- 판정 하나가 다시 걸 예정으로 남으면 뒤 판정이 모두 기다린다. 다시 걸기는 최대 3번이고 가장 긴 간격이 5분 + 15분이라, 최악 약 20분 뒤 멈춘 실패가 되면 넘어간다. 기다리는 동안 「판정 고르기 기다림: 판정 작업 N」 로그가 남는다
- 사건 시점 당기기는 엔티티를 고쳐 저장하지 않고 조건부 갱신 한 줄(`EventRepository.pullOccurredAt`)로 한다. 엔티티를 저장하면 Hibernate 가 모든 칸을 다시 써서, 그사이 이슈 붙이기(Jira 40)가 바꾼 `issue_id` 를 옛 값으로 덮을 수 있다
- 벡터는 엔티티로 매핑하지 않고 `JdbcClient` 와 pgvector 글자 표기(`cast(:vector as vector)`)로 저장 · 비교한다 — Hibernate 벡터 의존성 없이

## 이 티켓에서 하지 않는 것

- ISSUE 메시지 · 이슈 붙이기 · 만들기 · ISSUE 를 한 번에 하나씩 거는 고르기 — Jira 40. 35 가 만든 ISSUE 작업은 「걸 차례를 기다리는」 표시다(`api-internal.md` 3절)
- 판정 기준 · 프롬프트 · 임베딩 입력 길이 — AI 팀. HNSW 인덱스 — 잰 값이 느릴 때 따로
- 다시 분석 · 판정을 다시 거는 길(API · 화면)
- 워커가 EMBED · MATCH_EVENT 결과를 만드는 코드 — AI 팀. 받을 때 보는 것은 `api-internal.md` 5절에 두었다
