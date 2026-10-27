# F03 기사 핵심 정보 구조화 · F04 기사 마인드맵 생성 — W1 EXTRACT 저장 · A9

계약 원본은 [W1 EXTRACT 결과](../api-internal.md) 5절, [A9 · 마인드맵 `content`](../api-screen.md) A9 · 3절, [article_mindmap](../data-model.md) 2절이다. 이 문서는 Jira S15P31A102-56 의 검증 기준과 그 기준을 지키는 시험만 둔다. 계획은 `docs/plans/2026-10-27-mindmap-extract.md`.

시험은 실제 PostgreSQL · Redis 로 돈다(`TestcontainersConfiguration`). 클래스 이름이 없는 시험은 `MindmapApiIntegrationTest` 다 — 진짜 EXTRACT 처리기로 W1 을 부른다.

- AC-1: W1 EXTRACT 성공이면 204 다. `article_mindmap` 에 `summary` · `content` · `primary_core_index` · `occurred_at` · `schema_version` · `model` · `prompt_version` · `generated_at`(봉투의 `finishedAt`)이 들어가고 기사가 공개된다
  — `extractSuccessStoresTheMindmapAndReleasesTheArticle` · `CoreMappingTest.articleMindmapStoresContentAsJsonb`
- AC-2: 근거는 본문과 대조해 맞는 것만 남긴다. 범위 밖 문단 · 한 글자라도 다른 근거만 지우고 잎은 남긴다. 지운 개수는 로그에 남긴다. 문단은 빈 줄 · 공백만 있는 줄 · `\r\n` 을 같은 규칙으로 나눈다
  — `EvidenceCheckerTest` · `MindmapContentTest.retainEvidenceKeepsOnlyEvidenceFoundInTheBodyAndKeepsEveryLeaf` · `extractSuccessStoresTheMindmapAndReleasesTheArticle`
- AC-3: 명세의 400(가지 없음 · 범위 밖 번호 · `CORE` 없이 번호)과 `api-internal.md` 5절 「API 가 EXTRACT 결과를 받을 때」의 거절 경우는 400 `RESULT_SCHEMA_INVALID` 다. 행은 저장되지 않고 기사는 공개되지 않으며 한 번 다시 걸린다
  — `rejectedResultStoresNothingAndRetriesOnce` · `extractWithoutModelIsRejected` · `ExtractResultTest.rejectsWhatTheScreenCannotDraw`(15가지)
- AC-4: 고쳐 받는 경우(가지 순서 · 모양이 틀린 근거 · 번호 없이 온 `occurredAt` · 문자열이 아닌 `title`)는 고친 모양으로 저장된다
  — `ExtractResultTest.branchesAreSortedIntoTableOrder` · `malformedEvidenceIsDroppedAndCountedButTheLeafStays` · `occurredAtIsDroppedWithoutPrimaryCore` · `optionalFieldsMayBeAbsent`
- AC-5: 이미 마인드맵이 있는 기사에 성공이 오면 덮어쓴다(새 결과에 없는 대표 사건 · 시점도 비운다). 공개 시각은 그대로다
  — `successOverwritesAnExistingMindmapAndKeepsTheReleaseTime`
- AC-6: A9 는 근거를 뺀 `branches` 를 준다. `title` 은 AI 제목이 비면 기사 제목, `aiGenerated` 는 true, `generatedAt` 은 KST
  — `mindmapReturnsBranchesWithoutEvidence` · `mindmapTitleComesFromTheContentWhenPresent`
- AC-7: A9 는 없거나 공개 전인 기사(결과가 있어도)에 404 `ARTICLE_NOT_FOUND`, 공개됐는데 결과가 없으면 404 `MINDMAP_NOT_FOUND`, 숫자가 아닌 id 는 400 `VALIDATION_FAILED`
  — `mindmapNotFoundCases`
- AC-8: A8 `eventMatchStatus` 는 판정 작업이 없고 마인드맵의 대표 사건이 비었으면 `NO_EVENT`, 대표 사건이 있거나 마인드맵이 없으면 `NONE`
  — `eventMatchStatusIsNoEventOnlyWithoutAPrimaryCore` · `ArticleApiIntegrationTest.statusesAndOptionalRelationsFollowStoredFacts`
- AC-9: Swagger 에 `[확정] A9`(기사 태그)와 응답 200 · 400 · 404 가 보인다
  — `OpenApiDocsTest.implementedOperationsAreMarkedConfirmedWithApiNumberAndTag`

## 알아 둘 것

- 문단을 나눌 때 줄마다 앞뒤 공백은 Java `String.strip()` 으로 지운다. 줄바꿈 없는 공백(U+00A0)은 지우지 않는데, Python `str.strip()` 은 지운다. 문단 끝에 그 글자가 붙은 경우에만 번호 · 대조가 어긋날 수 있다. 지금 NewsData 본문은 줄바꿈이 없어 문단이 늘 하나다(`data-model.md` 2절 article)
- 근거 글자가 비거나 공백뿐이면 맞지 않는 근거로 본다 — 빈 글자는 어느 문단에나 「들어 있어서」 따로 막는다

## 이 티켓에서 하지 않는 것

- `MATCH_EVENT` · `ISSUE` 를 거는 일과 EMBED · 판정 · 이슈 저장 — Jira 35 · 40. 「대표 사건이 없으면 판정을 걸지 않는다」도 판정을 거는 35 몫
- 다시 분석을 거는 길(API · 화면) — 이 티켓은 성공 결과가 오면 덮어쓰기만 한다
- 근거를 화면에 보이기 · 노드 상세 창 — F05 추후. 마인드맵 렌더링은 FE
- 워커가 EXTRACT 결과를 만드는 코드 — AI 팀. 받을 때 보는 것은 `api-internal.md` 5절에 두었다
