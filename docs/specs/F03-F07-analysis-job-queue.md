# F03 · F04 · F06 · F07 을 받치는 분석 작업 큐 — W1 결과 받기 · 실패 다시 걸기 · 직원용 문 출입증

계약 원본은 [내부 API · 작업 큐](../api-internal.md) 3 ~ 6절, [작업 실패 코드 · 인증](../api.md) 1 · 2절, [analysis_job](../data-model.md) 이다. 이 문서는 Jira S15P31A102-30 의 검증 기준과 그 기준을 지키는 시험만 둔다. 기능은 F03 기사 핵심 정보 구조화 · F04 기사 마인드맵 생성 · F06 동일 사건 기사 클러스터링 · F07 사건 중심 이슈 에볼루션 맵 — 모두 AI 결과가 이 큐와 W1 로 들어온다. 단계별 결과 저장은 Jira 56(`EXTRACT`) · 35(`EMBED` · `MATCH_EVENT`) · 40(`ISSUE`), 투입 주소 B1 은 Jira 34 의 몫이다.

시험은 실제 PostgreSQL · Redis 로 돈다(`TestcontainersConfiguration`). 아래에서 클래스 이름이 없는 시험은 `AnalysisJobQueueIntegrationTest` 다.

- AC-1: 직원용 문(`/internal/**`)은 출입증(`X-Internal-Key`)으로만 연다. 출입증이 없거나 틀리면 401 `UNAUTHORIZED`, 남의 문 출입증이면 403 `FORBIDDEN`, 정하지 않은 직원용 주소는 어느 출입증으로도 403. 세션 · CSRF 번호표를 쓰지 않고 쿠키를 만들지 않는다
  — `SecurityRulesTest.internalApisWithoutValidKeyAreUnauthorized` · `internalKeyOpensOnlyItsOwnDoor` · `matchingKeyPassesWithoutCsrfOrSession` · `internalKeyIsNotALoginForPublicApis`
- AC-2: 출입증 설정이 비면 모두 막히고, 두 출입증이 같으면 API 가 뜨지 않으며, 설정한 키의 앞뒤 공백은 뗀다
  — `InternalKeyNotConfiguredTest.everyInternalCallIsUnauthorizedUntilKeysAreSet` · `InternalKeyFilterTest.sameKeyForBothDoorsIsRejectedAtStartup` · `configuredKeyIgnoresSurroundingWhitespace`
- AC-3: API 가 뜨면 스트림 셋 · 그룹 넷(`analysis.released` 의 `extract` · `embed`, `analysis.match_event` 의 `match_event`, `analysis.issue` 의 `issue`)이 있다
  — `streamsAndGroupsExistAfterStartup`
- AC-4: 투입은 `EXTRACT` · `EMBED` 작업을 만들고, 트랜잭션이 커밋된 뒤에만 기사 본문을 담은 메시지 하나를 넣고 `published_at` 을 적는다. 되돌아가면 넣지 않는다
  — `releaseIsQueuedAfterCommitWithTheArticleBody` · `rolledBackReleaseIsNotQueued`
- AC-5: 넣을 때 `ACKED MAXLEN ~ N` 으로 자른다 — 한 그룹이라도 ack 하지 않은 메시지는 남고, 모든 그룹이 ack 한 것만 잘린다
  — `trimsOnlyWhatEveryGroupAcknowledged`
- AC-6: W1 은 없는 작업 404 `ANALYSIS_JOB_NOT_FOUND`, 시도 번호가 다르거나 끝난 작업이면 409 `JOB_STATE_CONFLICT` 다. 같은 결과가 두 번 오면 두 번째는 409
  — `unknownJobIs404` · `wrongAttemptOrFinishedJobIs409` · `successGoesThroughTheHandlerOnce`
- AC-7: W1 성공은 단계별 처리기에 넘겨 저장하고 `SUCCEEDED`, 실패는 `error_code` · `error_message` 를 남긴다. 늦춰 걸 코드는 그 자리에서 다시 걸지 않는다
  — `successGoesThroughTheHandlerOnce` · `failureIsStoredAndLeftForTheScheduler`
- AC-8: 처리기가 결과를 거절하거나 봉투 안끼리 안 맞으면 400 `RESULT_SCHEMA_INVALID` 다. 처리기가 쓴 것은 되돌리고, 작업은 실패를 남긴 뒤 바로 한 번(`attempt + 1`) 다시 건다. 다시 건 시도도 거절되면 멈춘다. 봉투를 못 읽거나 `attempt` 가 없으면 400 이고 작업은 그대로다
  — `rejectedResultIsRolledBackRetriedOnceThenStops` · `badEnvelopesAre400`
- AC-9: 늦춰 거는 실패는 API 가 받은 때 + 간격(`api.md` 2절)을 `retry_at` 에 적고, 그때가 지나야 `attempt + 1` 로 다시 걸어 큐에 넣는다. 최대 시도 수(3) · 「한 번만 더」(시도 2) · 다시 걸지 않는 코드에서 멈추고 `retry_at` 을 비운다. 멈춘 실패가 한 차례(100개)보다 많이 쌓여도 때가 된 실패는 걸린다
  — `failureIsStoredAndLeftForTheScheduler` · `failureIsRetriedAfterItsDelayOnce` · `retriesStopWhereThePolicySays` · `stoppedFailuresDoNotBlockDueRetries` · `RetryPolicyTest.decidesByCodeAndAttempt`
- AC-10: 스케줄러 둘이 같이 돌아도(배포 중 Pod 둘) 한 번만 다시 건다
  — `concurrentSchedulersRetryOnce`
- AC-11: 큐에 못 넣은 작업(`QUEUED` 인데 `published_at` 이 빔)은 1분 뒤 한 번만 넣는다. 넣은 작업은 다시 넣지 않는다
  — `unpublishedJobIsPublishedAfterAMinuteOnce`
- AC-12: 기사의 `mindmapStatus` 는 결과가 없고 `EXTRACT` 가 `INPUT_NOT_ANALYZABLE` 로 실패했을 때 `NOT_ANALYZABLE` 이다. 결과가 있으면(다시 분석이 실패해도) `SUCCEEDED` 그대로다
  — `ArticleSummaryAssemblerTest.mindmapStatusComesFromResultThenExtractJob`
- AC-13: 처리기의 예상 밖 오류(버그 · 처리기 없음)는 그 시도를 `INTERNAL` 실패로 남기고 500 이다. 같은 결과를 다시 보내면 409 — 작업이 `QUEUED` 로 남아 워커가 GMS 를 끝없이 부르지 않는다
  — `unexpectedHandlerErrorIsRecordedAsInternal`

## 이 티켓에서 하지 않는 것

- `eventMatchStatus` 의 `NO_EVENT` — `article_mindmap.primary_core_index` 칸이 생긴 Jira 56 에서 했다(`F03-F04-mindmap.md` AC-8)
- 단계별 결과 저장 · `MATCH_EVENT` · `ISSUE` 메시지 만들기와 한 번에 하나씩 돌리기 — Jira 56 · 35 · 40
- 워커 쪽(스트림 읽기 · W1 다시 보내기 · `XAUTOCLAIM`) — AI 팀. 숫자는 BE 안으로 `api-internal.md` 3 · 5절에 두고 `api.md` 4절 AI 9번으로 묻는다
