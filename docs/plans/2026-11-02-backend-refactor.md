# 백엔드 리팩토링 — 동작 그대로 · W1 결과 NUL 처리 · 인증 정리 (2026-11-02)

## 무엇을 / 왜

사용자 요청 「백엔드쪽 리팩토링 전반적으로 다 하면서 남은 작업 정리」. 범위는 사용자 결정(2026-11-02): **AnalysisJobService 나누기까지 전부, 사이트까지 반영**.

- 조사 조수가 main 163개 파일을 읽어 후보 15개를 골랐다. 가장 큰 덩어리는 분석 결과 받기(W1) 쪽의 복붙과 화면 API 서비스의 같은 검사 · DTO 변환이다
- 10-30 `/code-review` 지적 7개는 지금도 그대로 남아 있다
- 사이트 backend 로그에 Spring 이 만든 기본 계정 비밀번호 줄이 1개 있다(10-30 Pod 시작)
- 발표가 11-18 이고 FE 가 API 계약으로 화면을 만드는 중이라, **URL · 응답 모양 · 상태 · 오류 코드 · detail 문구는 바꾸지 않는다**. 응답이 바뀌는 버그 고침과 인증 코드는 MR 을 따로 둔다

## 바꿀 파일 — MR 셋

셋을 차례로 `backend` 에 모은 뒤 `backend → dev` 한 번, 태그 MR 한 번으로 사이트에 낸다. 뒤 브랜치는 앞 MR 이 머지된 뒤 딴다(같은 파일이 겹침).

### MR 1 — 리팩토링, 동작 그대로 (Jira 새 티켓 A)

1. **실패 경로 시험 먼저** — 나누기 전에 지금 동작을 시험으로 굳힌다
   - `publishUnpublished`: 큐에 넣다 실패하면 표시를 지우고 그 차례를 멈춘다
   - W1 뒤 고르기(판정 · ISSUE)가 실패해도 W1 응답은 그대로다
   - 스케줄러: 한 일이 실패해도 다음 일은 돈다
2. **W1 결과 읽기 도우미 한 곳** — `IssueResult` · `MatchEventResult` · `ExtractResult` · `EmbedResult` · 두 결과 처리기에 복사된 text · 정수 id · 없음 · NUL 검사를 analysis 쪽 도우미 하나로 모은다
   - NUL 검사는 이미 있는 `common/web/QueryText.containsNul` 을 쓴다
   - `Judgment` record 하나로 합친다. detail 문구, Judgment 칸 이름 · 순서(jsonb 저장 모양)는 그대로
3. **AnalysisJobService 안 정리**
   - catch 셋에 되풀이된 「새 트랜잭션에서 실패 남기기」를 메서드 하나로
   - 단계 → 메시지 공장 목록을 `AnalysisMessageFactories` 로 뺀다(`AnalysisResultHandlers` 와 같은 모양). 앱이 뜰 때 네 단계가 모두 있는지 확인한다
   - 「공장이 아직 없다」 분기 · 낡은 주석 · 안 쓰는 `RetryPolicy.retryableCodes()` 를 지운다
4. **AnalysisJobService 나누기(341줄)**
   - `retryDue` · `publishUnpublished` · `markAndBuild` → 새 `AnalysisJobRecovery`(스케줄러용)
   - 둘이 같이 쓰는 큐에 넣기 · 다시 걸기 · 실패 남기기는 새 컴포넌트 하나로
   - 서비스에는 투입(`queueRelease`) · W1 받기 · 고르기만 남긴다
   - 스케줄러의 try/catch 여섯을 `runQuietly` 하나로. 시험의 부르는 곳(`service.retryDue` 등)만 새 클래스로 바꾼다
5. **고르기 · 메시지 공장 중복** — `MatchDispatcher` · `IssueDispatcher` 의 잠금 · 멈춤 판정을 도우미 하나로(로그 문구는 시험이 글자로 보므로 그대로). 메시지 공장의 `findAllById → Map` 네 번은 작은 도우미로
6. **화면 API 서비스**
   - 카테고리 검사 · 공개 기사 찾기를 한 곳으로
   - 목록 응답을 `PageResponse` 한 방식으로(규칙 문서 29줄)
   - `EventRef` · `IssueRef` · `CategoryRef` · `PublisherRef` 에 `from`
   - 선택 쿼리 인자 `category` · `sort` 에 `@Nullable`
   - 작은 중복(OffsetDateTime → Instant 세 곳, 마인드맵 JSON 읽기 두 곳, CORE 가지 찾기, 한국 시간 상수 둘, 행 매퍼 안의 Map 부작용)
   - 안 쓰는 `ArticleService.get(long)`
   - 잔손질: 와일드카드 import, 괄호 없는 if, `java.util.List.of()`
   - 시험의 Spy bean 때문에 Spring 맥락이 하나 더 뜨는 것(10-30 리뷰 5) — 바꿔도 시험이 같은 것을 보면 고친다

### MR 2 — W1 결과 NUL · 오류 처리, 응답이 바뀜 (Jira 새 티켓 B, 버그)

시험을 먼저 써서 빨간 것을 본 뒤 고친다.

- EMBED 결과 `model` 에 U+0000 → 지금 500 INTERNAL(저장 때 터져 1분 뒤 다시 걸림) → **400 RESULT_SCHEMA_INVALID**. 다른 세 단계와 같게
- FAILED 봉투의 `error.code` · `message` 에 U+0000 — 지금 동작을 시험으로 먼저 재고, 500 이면 같은 방식으로
- `InvalidParameterException` 의 상태가 HTTP 코드가 아니면 → 500 대신 400(10-30 리뷰 1)
- 반응 대상 사건 번호 경고 로그에 AI 원문 값을 그대로 찍는 곳 → 앞부분만(10-30 리뷰 4)
- 문서: `docs/api-internal.md` 5절 EMBED 규칙 · FAILED 봉투 줄

### MR 3 — 인증 정리, 사람 최종 확인 (Jira 새 티켓 C)

- Spring 기본 계정 · 비밀번호 줄 없애기 — 자동 구성 `UserDetailsServiceAutoConfiguration` 을 끈다. 시험: 앱이 뜰 때 로그에 `generated security password` 가 없다. 로그인 · 세션 시험은 그대로
- 로그인 · 가입이 복사해 쓰는 `MemberPrincipal` 만들기 → 한 곳(`MemberPrincipal.of`). 비밀번호 바이트 규칙도 한 곳으로
- ~~`AuthService` 에 읽기 트랜잭션(규칙 6절)~~ → 리뷰 뒤 빼기로 바꿈(2026-11-02 사용자 결정 — 로그인 동안 DB 연결을 잡고 동시 로그인 시험이 경쟁을 못 만든다. 규칙 6절에 예외 한 줄). 「세션의 회원이 없다」 401 두 곳을 하나로
- 인증 주체 만들기는 `MemberPrincipal.of` 대신 `MemberResponse.toPrincipal()` — common 이 member.dto 를 import 하지 않게
- 🔴 머지 전에 사용자가 diff 를 본다(AGENTS.md 「인증 · 권한 코드 — 고쳤으면 사람이 최종 확인」)

## 작업 순서

- [ ] Jira 티켓 셋(BE · 라벨 backend · 스토리 포인트 A 5 · B 2 · C 2) → 브랜치 `refactor/backend/S15P31A102-<A>-…` 를 backend 에서
- [ ] MR 1 커밋 1 ~ 6 — 커밋마다 `backend_LINT` · `backend_TEST`
- [ ] MR 1 리뷰(reviewer · `/code-review`) → backend 머지
- [ ] MR 2(브랜치 `fix/backend/…`) 시험 먼저 → 고침 → 리뷰 → backend 머지
- [ ] MR 3(브랜치 `refactor/backend/…`) → 리뷰 · `/security-review` → 사용자 확인 → backend 머지
- [ ] backend → dev → 태그 MR(w5) → 사이트 확인 → 분야 브랜치 넷 맞추기 → Jira 완료
- [ ] 남은 백엔드 작업 정리(파일 카드) · zoo_docs(learn: 파일별 코드 캡처 — 사용자 방식)

## 안 바꿀 것

- API URL · 응답 모양 · 상태 · 오류 코드 · detail 문구(MR 2 에 적은 변화만 예외), Swagger 문서 모양(컨트롤러 `@ApiResponse` 덩어리 · `@Parameter(hidden)`)
- 워커와의 메시지 record(계약) · DB 스키마 · 이미 적용된 마이그레이션
- 패키지 옮기기, Bookmark · InterestIssue 합치기, press · category 매핑 엔티티(배치 표 모양을 `ddl-auto: validate` 로 지킴), `Instant.now()` → Clock, A2 집계 SQL, StdictClient · GlobalExceptionHandler 쪼개기(GlobalExceptionHandler 는 MR 2 의 한 줄만)
- 인증 내부(LoginAttemptGuard 의 Lua · InternalKeyFilter · LoginSessions)
- 10-30 리뷰 중 A13 인덱스(스키마 필요 · 기사 0건) · 검색 세 조회를 한 번에 · 제목 NFC · 사전 한도 넘은 뒤 Redis 쓰기 → 「남은 작업」에만

## 리스크

- diff 가 넓어 시험이 못 지키는 곳에서 동작이 바뀔 수 있다 → 계약은 `/v3/api-docs` 전 · 뒤 비교, 실패 경로는 커밋 1 의 시험
- 뜰 때 공장 넷 확인을 새로 넣는다 → 하나라도 빠지면 앱이 안 뜬다(지금은 넷 다 있음)
- 팀원(BE)이 같은 파일을 고치면 충돌 — 지금 열린 BE 작업은 없다(팀원 브랜치 넷은 dev 에 다 들어감)
- 사이트 backend 교체(10-30 뒤 처음) — 무중단 교체, health 1초마다
- MR 3 은 사용자 확인 전에 머지하지 않는다

## 어떻게 검증하나

- 커밋마다 `backend_LINT`(javac · Error Prone · NullAway) · `backend_TEST`(Testcontainers) — 시험 수 전 · 뒤
- 시험
  - MR 1 커밋 1 의 시험은 지금 코드에서 통과해야 한다(동작을 지키는 시험)
  - MR 2 의 시험은 고치기 전 빨강 → 뒤 초록(되돌림 확인)
- 계약: 시작 전 · MR 1 뒤 · 끝에 `/v3/api-docs` JSON 을 받아 diff — MR 1 뒤에는 같아야 한다. 받는 법은 커밋하지 않는 임시 시험(MockMvc)
- 사이트: 태그 반영 뒤 새 Pod Ready · 재시작 0, EC2 에서 1초마다 health 실패 0, A1 · A2 · A7 · A13 · A19 200, 새 Pod 로그에 `generated security password` 0줄
- reviewer 조수 · `/code-review` · `/security-review`(MR 3) · `/feature-done`

## 되돌리는 법

- MR 마다 revert. 사이트는 태그 MR 을 revert(10-22 에 시험한 길, 9초)
- 스키마 · 데이터를 바꾸지 않아 되돌려도 데이터에 영향이 없다
- 옛 비밀번호 줄은 지우지 않는다 — 로그인 길(httpBasic · formLogin)이 없어 쓸 수 없는 값이다. Loki 로는 Alloy 가 10-28 부터 그 줄을 버렸고(SSOT 6절 「로그」), 컨테이너 로그에 남은 줄은 Pod 가 바뀌면 사라진다
