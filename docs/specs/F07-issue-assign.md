# F07 사건 중심 이슈 에볼루션 맵 — ISSUE 단계(사건을 이슈에 붙이기 · 새 이슈)

계약 원본은 [큐 모양과 순서](../api-internal.md) 3절, [`analysis.issue` 메시지](../api-internal.md) 4절, [W1 ISSUE 결과](../api-internal.md) 5절(모두 제안), [issue · issue_category · analysis_job](../data-model.md) 2절, [작업 실패 코드](../api.md) 2절이다. 이 문서는 Jira S15P31A102-40 의 검증 기준과 그 기준을 지키는 시험만 둔다. 계획은 `docs/plans/2026-10-29-issue-stage.md`.

시험은 실제 PostgreSQL(pgvector) · Redis 로 돈다(`TestcontainersConfiguration`). 클래스 이름이 없는 시험은 `IssueStageIntegrationTest` 다 — 진짜 처리기로 W1 을 부르고, 워커가 받을 메시지는 Redis 에서 꺼내 본다. 1분 스케줄러는 시험에서 꺼 두어 ISSUE 고르기는 W1 뒤와 `AnalysisJobService.dispatchIssue()` 로 부른다.

- AC-1: ISSUE 는 한 번에 하나다. 판정 `NEW` 의 W1 뒤에 그 ISSUE 가 바로 큐에 들어간다. 진행 중(후보가 있는 `QUEUED`, 또는 실패했는데 다시 걸 예정)인 ISSUE 가 있으면 다음 대기 작업은 기다리고, 멈춘 실패는 넘어간다. ISSUE 결과를 저장하면 그 W1 뒤에 다음 대기 작업이 걸린다. 같은 ISSUE 가 40분 넘게 `QUEUED` 면 WARN 을 남긴다
  — `theIssueIsQueuedRightAfterTheJudgmentCreatesTheEvent` · `issuesRunOneAtATimeInJobOrder` · `aRetryingIssueWaitsAndAStoppedOneLetsTheNextGo` · `anIssueStuckInQueuedIsWarned` · `EventMatchIntegrationTest.newCreatesTheEventAndAnIssueJob`
- AC-2: 대기 작업(후보가 빈 `QUEUED`)은 작업 번호 순서로 고른다. 1분 스케줄러의 「못 넣은 작업 넣기」는 대기 작업을 넣지 않고, 고른 뒤 못 넣은 작업은 같은 후보로 넣는다. 고른 작업의 사건이 이미 이슈 안이면 묻지 않고 `SUCCEEDED` 로 끝내고 다음 대기 작업을 고른다
  — `issuesRunOneAtATimeInJobOrder` · `waitingIssuesAreLeftToTheDispatcherButAPickedOneIsRepublished` · `anEventAlreadyInAnIssueIsFinishedWithoutAsking` · `AnalysisJobQueueIntegrationTest.jobsWithoutAMessageFactoryDoNotCrowdOutOthers`
- AC-3: 후보 이슈는 최대 5개, 이슈마다 최근 사건 5개다. 후보 사건은 이슈 밖이고 이번 사건보다 먼저 생긴 사건 최대 10개다. 둘 다 이번 사건을 만든 기사 벡터와 가까운 순서이고, `similarity` 는 판정 후보와 같다. 후보는 `analysis_job.candidates` 에 `{ issues: [{ issueId, similarity }], events: [{ eventId, similarity }] }` 로 남는다. 후보가 없어도 건다
  — `candidatesAreTheNearestIssuesAndEarlierEventsOutsideIssues` · `aLaterRetryIsPickedAgainWithFreshCandidates`
- AC-4: 메시지에 `articleId` · `jobId` · `attempt`, 이번 사건(`id` · `title` · `label` · `summary` · `occurredAt`), 후보 이슈(`issueId` · `title` · `summary` · 최근 사건 `{ title, label, occurredAt }` 를 발생 시점 순서로), 후보 사건(사건 칸 · `similarity`)이 실린다
  — `messageCarriesTheEventAndTheRecentEventsOfEachIssue`
- AC-5: `ATTACH` 면 이번 사건이 그 이슈에 들어가고, 이슈 요약은 받은 요약으로 덮어쓰고 이름은 그대로다. 판정 기록 `{ reason, model, promptVersion }` 이 `analysis_job.result` 에 남는다
  — `attachPutsTheEventInAndRewritesTheSummary`
- AC-6: `CREATE` 면 받은 이름 · 요약으로 새 이슈를 만들고, 이번 사건을 포함한 사건 3개 이상이 그 이슈에 들어간다
  — `createMakesAnIssueWithTheChosenEvents`
- AC-7: `NONE` 이면 사건은 이슈 밖에 그대로이고 판정 기록만 남는다
  — `noneLeavesTheEventOutside`
- AC-8: `api-internal.md` 5절 「API 가 ISSUE 결과를 받을 때」의 거절 경우는 400 `RESULT_SCHEMA_INVALID` 다. 이슈 · 사건을 바꾸지 않고 후보를 새로 계산해 한 번 다시 건다
  — `aRejectedResultChangesNothingAndIsAskedAgainWithFreshCandidates` · `resultsOutsideTheCandidatesAreRejected` · `IssueResultTest`(25개)
- AC-9: 이번 사건이나 `eventIds` 의 사건이 그사이 이슈에 들어갔거나 고른 이슈가 없어졌으면 409 `JOB_STATE_CONFLICT` 다. 아무것도 바꾸지 않고, 그 시도를 `FAILED` · `JOB_STATE_CONFLICT` 로 적은 뒤 후보를 새로 계산해 바로 다시 건다(시도 3까지)
  — `anEventTakenMeanwhileIsAConflictAndAskedAgain` · `aVanishedIssueIsAConflict` · `RetryPolicyTest.decidesByCodeAndAttempt`(`JOB_STATE_CONFLICT` 세 줄)
- AC-10: `issue_category` 는 이슈 기사들의 대표 카테고리 중 기사가 가장 많은 것 하나다(같으면 `sort_order` 가 앞선 것, 대표 카테고리가 없는 기사는 뺌). 이슈를 만들 때 채우고 사건을 붙일 때 다시 계산한다
  — `theCategoryIsTheMostCommonOneAndRecomputedOnAttach` · `aTiedCategoryGoesBySortOrder`

## 알아 둘 것

- ISSUE 를 거는 곳은 `IssueDispatcher` 하나다. 판정 고르기(`MatchDispatcher`)와 따로 돌고 트랜잭션 잠금 키도 다르다 — 판정은 ISSUE 를 기다리지 않는다
- 후보 사건을 「먼저 생긴 사건」으로 자르는 것은 판정 줄이 앞서 나가도 ISSUE 가 「그때까지 생긴 사건」만 보게 하려는 것이다(2026-10-29 사용자). 다시 돌려도 같은 결과가 나와 발행순 재실행(`SSOT.md` 2절)과 맞는다
- 판정은 다시 걸 때 처음 후보를 그대로 쓰지만 ISSUE 는 새로 계산한다. 그래서 메시지 공장의 `requeueNow` 가 ISSUE 만 후보를 비우고 `false` 를 돌려줘, 다시 건 작업을 큐에 바로 넣지 않고 고르기에 돌려보낸다. 다른 공장은 `true`(바로 넣기)다
- 사건을 이슈에 넣는 일은 엔티티를 고쳐 저장하지 않고 조건부 갱신 한 줄(`issue_id` 가 빈 행만)로 한다. 바뀐 행 수가 다르면 충돌로 보고 트랜잭션을 되돌린다 — 판정의 사건 시점 당기기(`EventRepository.pullOccurredAt`)와 같은 까닭이다

## 이 티켓에서 하지 않는 것

- 묶는 기준 · 프롬프트 · 후보 수 실험 — AI 팀. 후보 수는 시작값(상수)이다
- 워커가 ISSUE 결과를 만드는 코드 — AI 팀. 받을 때 보는 것은 `api-internal.md` 5절에 두었다
- 사건이 이슈에 들어간 뒤 판정 `EXISTING` 으로 기사만 늘 때 카테고리를 다시 계산하는 일 — 다음 `ATTACH` 때 다시 계산된다
- 반응 대상 사건 번호 · 깨끗하게 되돌리기 도구 · 하루 처리 상한 — `SSOT.md` 8절
