# Jira 35 — W1 임베딩 · 동일 사건 결과 저장 (후보 사건 찾기 · 사건 만들기)

## 무엇을 / 왜

F06 동일 사건 기사 클러스터링의 백엔드 몫입니다. 지금은 W1 에 EMBED 결과가 오면 처리기가 없어 500(`INTERNAL`)이고, 판정(MATCH_EVENT)을 거는 코드도 없습니다. 그래서 기사가 사건으로 묶이지 않고, 이슈 맵(F07)도 채워지지 않습니다. 이 티켓이 하는 일은 넷입니다. EMBED 결과(기사 벡터) 저장, EXTRACT · EMBED 가 끝난 기사에 후보 사건을 붙여 판정 걸기(한 번에 하나씩), 판정 결과로 기사를 사건에 붙이거나 새 사건 만들기, 새 사건이면 ISSUE 작업 걸기입니다.

티켓 설명은 10-21 판입니다. 그 뒤 정해진 것까지 지금 명세대로 합니다. 차원 1024(BGE-m3-ko), 대표 사건이 없으면 판정 안 함, 판정 메시지의 `primaryEvent` · 후보 근거, 판정 기록 `result`, 다시 분석 규칙이 그것입니다.

## 지금 있는 것 · 빈 것 (2026-10-27 코드 확인)

| 있음 | 비어 있음 |
|---|---|
| pgvector 확장(V1), `event` · `article_event`(기사 하나에 사건 하나) · `analysis_job.candidates` · `result` 칸 | `article_embedding` 표 |
| 스트림 `analysis.match_event` · `analysis.issue` 와 그룹, 처리기 · 메시지 공장 자리 | EMBED · MATCH_EVENT 처리기, MATCH_EVENT 메시지 공장 |
| 다시 걸기(RetryPolicy · 1분 스케줄러), 못 넣은 작업 다시 넣기 | 단계 잇기(둘 다 끝나면 판정 걸기), 한 번에 하나씩 |
| `Event` · `ArticleEvent` 생성자, `OccurredAtBasis` | 후보 사건 검색, 사건 만들기 |
| `ArticleMindmap.primaryCoreIndex` · `occurredAt` · `content`(`MindmapContent`) | `AnalysisJob` 에 결과 쓰는 메서드 |

## 설계 — 명세가 정하지 않은 것 (BE 안, `api-internal.md` 3 · 4 · 5절에 적음)

**1. 판정 거는 곳은 한 군데 — 「다음 판정 고르기」**
- 처리기 안에서 거는 대신, 커밋이 끝난 상태만 보고 다음 기사를 고르는 `MatchDispatcher` 를 둡니다
- 부르는 때: W1 결과를 처리한 뒤(성공 · 실패 모두, 커밋 뒤 새 트랜잭션), 그리고 1분 스케줄러
- 고르는 규칙
  - 판정 작업이 하나라도 「진행 중」이면 기다립니다. 진행 중 = `QUEUED`, 또는 `FAILED` 인데 다시 걸 예정(`retry_at` 있음)
  - 진행 중인 판정이 없으면, 판정 대상 중 **발행 시각이 가장 이른 기사 하나**를 고릅니다. 대상은 EXTRACT · EMBED 모두 `SUCCEEDED`, 대표 사건 번호가 있음, 판정 작업이 아직 없음, 사건에 안 묶임인 기사입니다
  - 후보를 그때 계산해 판정 작업(`candidates` 포함)을 만들고, 커밋 뒤 큐에 넣습니다
- 두 API Pod 가 동시에 고르지 않게 트랜잭션 잠금 하나(`pg_advisory_xact_lock`)로 줄 세웁니다. 기사 · 작업 행은 잠그지 않아 기존 잠금 순서와 부딪히지 않습니다
- 이렇게 하면 EXTRACT · EMBED 가 동시에 끝나도 「둘 다 안 건다 / 둘 다 걸어 중복」이 생기지 않습니다. 순환 의존도 없습니다(서비스 → 고르기, 고르기는 서비스를 모름)
- 멈춘 실패(다시 걸지 않는 판정)는 「진행 중」이 아니라서 다음 기사로 넘어갑니다

**2. 「발행 순서」는 고를 수 있는 기사 중 가장 이른 것**
- 앞 기사가 아직 EXTRACT 중이면 기다리지 않고 다음 기사를 판정합니다. 기다리면, 실패로 멈춘 기사 하나가 뒤를 모두 막습니다
- 나중에 더 이른 기사가 붙으면, `FIRST_PUBLISHED` 사건의 발생 시점을 그 기사의 발행 시각으로 당깁니다(`data-model.md` event 「다시 계산한다」)

**3. 후보 사건 — 기사 벡터끼리 가장 가까운 사건 5개**
- 새 기사 벡터와 「사건에 묶인 다른 기사」 벡터의 코사인 거리(`<=>`)를 정확 검색(인덱스 없음)으로 구합니다. 사건마다 가장 가까운 기사로 대표하고, 가까운 순서로 5개를 고릅니다
- `similarity` = 1 − 코사인 거리, 0 ~ 1 로 자름
- 후보 근거 = 그 사건에 **가장 먼저 묶인 기사**(`linked_at`)의 마인드맵 대표 잎 근거 원문, 최대 3문장, 없으면 `[]`
- 후보가 0개여도 판정을 겁니다. 새 사건의 이름 · 키워드 · 요약은 판정이 지어야 해서입니다
- `candidates` 칸 모양: `[{"eventId": 97, "similarity": 0.83}, …]`. 다시 걸 때 같은 후보로 메시지를 다시 만듭니다

**4. 벡터는 새 의존성 없이 SQL 로**
- `JdbcClient` 네이티브 SQL(`cast(:vector as vector)`, `<=>`)로 저장 · 검색합니다. 엔티티를 만들지 않아 `ddl-auto: validate` 와도 부딪히지 않습니다. 저장소의 기존 조회 쿼리(`IssueQueryRepository`)도 이 방식입니다

**5. 받을 때 보는 것 (400 = 한 번 다시, 56 과 같은 기준)**
- EMBED: `model` 이 비거나 `dimension` ≠ 1024 이거나, `vector` 길이 ≠ `dimension` 이거나, 숫자가 아닌 값 · 무한대 · NaN 이 있으면 400. 다시 오면 덮어씀
- MATCH_EVENT
  - `decision` 이 `EXISTING` · `NEW` 가 아니면 400
  - `EXISTING` 인데 `eventId` 가 후보에 없거나 비면 400
  - `NEW` 인데 `newEvent` 의 이름 · 키워드 · 요약 중 빈 값이 있으면 400
  - `reason` 이 비면 400
  - 맞지 않는 짝 칸은 버립니다(`EXISTING` 의 `newEvent`, `NEW` 의 `eventId`)

**6. ISSUE 작업은 만들기만**
- `NEW` 면 ISSUE 작업을 만듭니다. ISSUE 메시지 공장은 Jira 40 몫이라, 그때까지 이 작업은 큐에 안 들어간 `QUEUED` 로 남습니다
- 40 이 공장을 넣으면 1분 스케줄러(못 넣은 작업 다시 넣기)가 넣습니다. 지금 코드가 이미 그렇게 동작합니다

## 바꿀 파일

**DB · 임베딩**
- `db/migration/V6__article_embedding.sql`(새) — `article_id` 기본 키 · 외래 키, `model text not null`, `embedding vector(1024) not null`, `created_at`. 인덱스 없음
- `analysis/embedding/EmbeddingStore.java`(새) — `JdbcClient` 로 저장(있으면 덮어쓰기) · 읽기
- `analysis/embedding/EmbedResultHandler.java`(새) — EMBED 처리기, 위 5번 검사

**판정 걸기**
- `event/CandidateEventFinder.java`(새) — 후보 사건 5개 SQL, 후보 근거(첫 기사의 대표 잎)
- `analysis/match/MatchDispatcher.java`(새) — 위 1 · 2번
- `analysis/match/MatchEventMessageFactory.java`(새) — `analysis.match_event` 메시지(4절 표). 새로 걸 때 · 다시 걸 때 · 못 넣은 작업 다시 넣을 때 같이 씀
- `analysis/AnalysisJobService.java` — W1 처리 뒤와 스케줄러에서 「다음 판정 고르기」 부르기(새 트랜잭션), 고른 작업을 커밋 뒤 큐에
- `analysis/AnalysisJobScheduler.java` — 1분마다 고르기
- `analysis/AnalysisJobRepository.java` — 「진행 중인 판정이 있나」 · 「판정 대상 중 가장 이른 기사」 쿼리

**판정 결과 저장**
- `event/MatchEventResultHandler.java`(새) — 위 5번 검사 → `EXISTING` 이면 사건에 붙이기(필요하면 발생 시점 당기기), `NEW` 면 사건 만들기 + 붙이기 + ISSUE 작업. 판정 기록 `result = {reason, model, promptVersion}`
- `analysis/AnalysisJob.java` — `recordResult(json)`
- `event/Event.java` — 발생 시점 당기기 메서드

**시험**
- 단위: EMBED 결과 검사, MATCH_EVENT 결과 검사, 메시지 모양
- 통합(새 `EventMatchIntegrationTest`, 실제 PostgreSQL + pgvector · Redis, 진짜 처리기)
  - EXTRACT · EMBED 를 W1 로 보내면 판정이 걸리는지(둘 다 끝나야, 대표 사건이 있어야, 이미 묶였으면 안 걸림)
  - 한 번에 하나씩 · 발행 시각 순서, 진행 중이면 기다림
  - 후보 5개 · 가까운 순서 · `candidates` 기록 · 메시지 칸
  - `EXISTING` → 붙음(이름 그대로, 더 이른 기사면 발생 시점 당김), `NEW` → 사건 · ISSUE 작업
  - 400 경우들
- 기존 시험 정리 순서(`article_embedding` · `article_event` · `event` 를 기사보다 먼저 지우기)

**문서**
- `docs/specs/F06-event-match.md`(새) — 성공 기준과 시험
- `docs/api-internal.md` 3 · 4 · 5절 — 위 「설계」 1 ~ 6 을 BE 안으로
- `docs/data-model.md` — 6절 F06 줄의 「`article_embedding`(미정)」 고침, `article_embedding` 은 V6
- `SSOT.md` 10절 — 후보 찾기 시간 잰 값
- `docs/plans/2026-10-27-event-match.md` — 승인한 계획 사본

## 작업 순서 (커밋 넷, 파일 하나씩 시험 먼저 → 설명)

- [x] Jira 35 진행 중, 브랜치 `feat/backend/S15P31A102-35-event-match` ← `origin/backend`
- [x] 커밋 1 「임베딩 저장」 — V6 · `EmbeddingStore` · `EmbedResultHandler` + 시험
- [x] 커밋 2 「판정 걸기」 — `CandidateEventFinder` · `MatchDispatcher` · 메시지 공장 · 서비스 · 스케줄러 + 시험
- [x] 커밋 3 「판정 결과 저장」 — `MatchEventResultHandler` · 사건 만들기 · ISSUE 작업 + 시험
- [x] 커밋 4 「문서 · 잰 값」 — 스펙 · api-internal · data-model · SSOT 10절 · 계획 사본
- [x] `/verify`(되돌림 확인) → reviewer 조수 → MR → backend → dev → 태그 MR → 사이트 → 브랜치 맞추기 → Jira 35 완료 · zoo_docs

## 계획과 달라진 것 (구현 중 2026-10-27)

- 발생 시점 당기기를 `Event.java` 메서드 대신 `EventRepository.pullOccurredAt` 조건부 갱신 한 줄로 했습니다. 엔티티를 고쳐 저장하면 Hibernate 가 모든 칸을 다시 써서, 그사이 이슈 붙이기(Jira 40)가 바꾼 `issue_id` 를 옛 값으로 덮을 수 있습니다
- MATCH_EVENT 결과 검사를 `event/MatchEventResult.java` 로 뗐습니다(EMBED 의 `EmbedResult` 와 같은 모양). 저장하는 글자의 U+0000 도 400 입니다(EXTRACT 와 같은 기준)
- 「ISSUE 작업은 만들기만, 공장이 생기면 1분 스케줄러가 넣는다」에 빠진 것이 있었습니다. 못 넣은 작업 넣기는 오래된 순서로 100개를 읽고 공장이 없는 단계를 건너뛰어서, ISSUE 작업이 100개를 넘으면 다른 단계의 못 넣은 작업(판정 포함)이 다시 안 들어가 판정 줄이 멈출 수 있었습니다. 공장이 있는 단계만 읽게 고쳤습니다(사용자 승인, 커밋 3)
- `CandidateEventFinder.read` 를 두어 `candidates` 칸 읽기를 메시지 공장과 처리기가 같이 씁니다
- `MindmapContent.core(index)` 를 더했습니다 — 판정 메시지의 `primaryEvent` 와 후보 근거가 대표 잎을 같은 코드로 꺼냅니다
- reviewer 조수 리뷰 뒤 더한 것(사용자 승인): `QUEUED` 인 판정에 W1 이 끝내 안 오면 판정 줄 전체가 멈춘다는 것을 문서에 바로 적고 30분 WARN 을 남김(저절로 실패 처리는 안 함), 모르는 `decision` 의 U+0000 이 500 이 되던 것 · 봉투 `model` · `promptVersion` 의 U+0000 · float4 를 넘는 벡터 값을 400 으로, 메시지 공장의 후보당 쿼리를 사건 수와 상관없이 셋으로, 잠금 주석을 사실대로, 시험 통합 7개 · 단위 2개(후보 순서 시험은 사건 번호를 각도와 거꾸로)

## 성공 기준 (`docs/specs/F06-event-match.md` 에 그대로)

- AC-1 EMBED 결과를 저장합니다(다시 오면 덮어씀). 차원 · 길이가 맞지 않거나 숫자가 아니면 400
- AC-2 EXTRACT · EMBED 가 모두 끝나고 대표 사건 번호가 있고 아직 사건에 안 묶인 기사에만 판정이 걸립니다. 어느 쪽이 먼저 끝나도, 동시에 끝나도 한 번입니다
- AC-3 판정은 한 번에 하나씩입니다. 진행 중(QUEUED · 다시 걸 예정)이면 다음 기사는 기다리고, 끝나면 발행 시각이 가장 이른 대상이 걸립니다
- AC-4 후보는 가까운 사건 최대 5개, 높은 순서입니다. `candidates` 에 남고, 메시지에 `primaryEvent` · 후보 근거(최대 3문장) · `similarity` 가 실립니다
- AC-5 `EXISTING` → 기사가 그 사건에 붙고 이름 · 키워드 · 요약은 그대로입니다. 더 이른 기사면 `FIRST_PUBLISHED` 발생 시점을 당깁니다
- AC-6 `NEW` → 사건이 만들어지고(발생 시점 = 뽑은 시점, 없으면 발행 시각), 기사가 붙고, ISSUE 작업이 생깁니다
- AC-7 판정 기록 `{reason, model, promptVersion}` 이 `analysis_job.result` 에 남습니다
- AC-8 받을 때 400 경우(위 5번)는 저장하지 않고 한 번 다시 겁니다
- AC-9 A8 `eventMatchStatus` 가 판정 작업 상태(`QUEUED` · `SUCCEEDED` · `FAILED`)를 보이고, 묶이면 `event` 가 채워집니다
- AC-10 후보 찾기 시간을 잰 값이 SSOT 10절에 있습니다(1만 7천 건, 정확 검색)

## 안 바꿀 것

- ISSUE 메시지 · 이슈 붙이기 · 이슈 만들기(Jira 40)
- 판정 기준 · 프롬프트 · 임베딩 입력 길이(AI 몫), HNSW 인덱스(잰 값이 느릴 때 따로)
- 다시 분석을 거는 길, 판정 점수 · 근거 저장(실험 뒤)
- 기존 화면 API 응답 모양(A2 ~ A8). 값만 채워짐
- 이미 적용된 V1 ~ V5, 보안 설정, AI 워커 코드

## 리스크

- **마이그레이션 번호** — BE 팀원의 63(북마크)도 V6 을 쓰라고 안내했습니다. 머지 직전 원격 backend 의 가장 큰 번호를 보고, 63 이 먼저 V6 을 넣었으면 이쪽을 V7 로 바꿉니다. 번호가 거꾸로 적용되면 Flyway 검사가 서버 시작을 막으니 꼭 머지 전에 봅니다
- **한 번에 하나씩이 막힘** — 판정 하나가 다시 걸 예정으로 남으면 뒤 판정이 모두 기다립니다. `RetryPolicy` 가 최대 3번(첫 시도 포함), 가장 긴 간격이 5분 + 15분(`LLM_RATE_LIMITED`)이라 최악 약 20분 뒤 멈춘 실패가 되고, 그러면 넘어갑니다. 고르기 로그에 「기다림: 판정 작업 N」을 남깁니다
- **AI 워커가 아직 EMBED · MATCH_EVENT 를 만들지 않음** — 모양은 문서에만 있습니다. 「설계」 표를 api-internal 에 적고, AI 팀에는 MR 링크로 알립니다(사용자)
- **벡터 크기** — 1024차원 숫자를 JSON 으로 받으면 결과 하나가 약 20KB 입니다. W1 본문 크기 상한에 걸리지 않는지 시험으로 봅니다
- **이슈 없는 사건** — 40 전까지 사건은 이슈 없이 쌓입니다. A5 · A6 · A8 은 보이지만, 이슈가 있어야 나오는 A2 · A3 · A4 에는 안 보입니다(명세대로)

## 어떻게 검증하나

- `./gradlew spotlessCheck compileJava compileTestJava test` — 경고 0, 시험 수가 늘고(지금 250) 모두 통과
- 되돌림 확인 — 고르기 · 처리기 · 후보 쿼리의 핵심 줄을 컴파일되는 모양으로 망가뜨리면 해당 시험이 단언에서 빨개지는지
- 동시성 — EXTRACT · EMBED W1 을 두 스레드로 동시에 보내 판정 작업이 정확히 하나인지(통합 시험)
- 후보 찾기 시간 — 로컬 pgvector(사이트와 같은 이미지)에 1024차원 벡터 1만 7천 개를 넣고 `EXPLAIN ANALYZE`
- `/v3/api-docs` 전후 — 바뀌지 않아야 함(화면 API 모양 변화 없음)
- 사이트 — 공개 기사 0건이라 흐름은 통합 시험으로. 사이트에서는 반영 · health · W1 경로가 그대로인지
- reviewer 조수 — 명세와 다른 곳 · 동시성 · 잠금 · null

## 되돌리는 법

- MR 을 Revert 합니다. 처리기가 없어지면 EMBED 는 다시 500, 판정은 걸리지 않는 지금 상태로 돌아갑니다
- 🔴 **V6 은 Flyway 가 되돌리지 않습니다.** 파일을 남기고 코드만 되돌립니다. 새 표 하나라 옛 코드에 영향이 없습니다. 지우려면 V7 `drop table`
- 만들어진 사건 · 연결은 남습니다. 지금 사이트에는 판정할 기사가 없어 실제로 남을 데이터는 없습니다
