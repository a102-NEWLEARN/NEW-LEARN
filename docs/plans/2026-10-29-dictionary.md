# 102번 A19 용어사전 API 구현 계획

2026-10-29 사용자 승인. 브랜치 `feat/backend/S15P31A102-102-dictionary`(`origin/backend` 7ae29e1 에서).

## 무엇을 / 왜

F13 용어사전의 A19 `GET /api/v1/dictionary?q=` 를 계약(`docs/api-screen.md` A19 · Jira 102)대로 만든다. 서버가 국립국어원 표준국어대사전 Open API 를 대신 불러 인증 키를 화면에 드러내지 않는다. 키가 아직 없어서 바깥 사전 호출은 인터페이스(`DictionarySource`) 뒤에 두고, 시험은 가짜로 바꿔 끼워 돌린다. 키는 사이트에 연결할 때만 필요하다.

## 정한 것 (2026-10-29 사용자)

| 물음 | 답 |
|---|---|
| 결과를 저장하나 | Redis 에 하루. 키 `dict:<다듬은 검색어>`, 만료 1일. 실패한 결과는 두지 않는다. 저장 · 읽기가 실패하면(Redis 가 꽉 참 · 멈춤) 건너뛰고 사전 결과를 그대로 준다 — 사용자의 검색은 막지 않는다 |
| 사전이 200 + 빈 본문을 주면 | 502 `DICTIONARY_UNAVAILABLE`, 저장 안 함, 경고 로그. 키 없이 · 틀린 키로 불렀을 때 실제로 이렇게 온다(2026-10-29 curl 로 확인). 진짜 「결과 없음」도 빈 본문이면 키를 받은 뒤 200 빈 `items` 로 바꾼다 → **같은 날 키를 받아 확인: 결과 없음도 빈 본문이라 200 빈 `items` 로 바꾸고, 결과 없음은 저장하지 않기로 함. 「품사 없음」 → null, `[확정] A19`** |
| `source` 값 | 「국립국어원 표준국어대사전」. 사전 저작권 정책(CC BY-SA 2.0 KR)이 저작자 표시를 요구한다. 계약의 고정값을 이 MR 에서 바꾸고 FE 에는 알리기만 한다 |

조사로 확인한 것 · 못 한 것

- 확인(공식 안내 `stdict.korean.go.kr/openapi/openApiInfo.do`): 주소 `https://stdict.korean.go.kr/api/search.do`, 변수 `key` · `q` · `req_type=json`, 응답 `channel.item[]` 의 `word` · `pos`(품사 이름) · `sense.definition`, 오류 `{"error":{"error_code","message"}}`
- 확인(`stdict.korean.go.kr/join/copyrightPolicy.do`): 텍스트 자료는 CC BY-SA 2.0 KR, 저작자 표시 필수
- **미확인**: 하루 요청 한도(공개 안내에 없음, 키 신청 화면은 로그인 필요), 검색어 길이 제한(안내에 없음 — 계약의 50자 그대로), 진짜 결과 없음의 응답 모양, `sense` 가 배열로 올 때가 있는지

## 바꿀 파일

- 새 패키지 `backend/src/main/java/kr/io/newlearn/dictionary/`
  - `DictionaryController` — `@GetMapping("/api/v1/dictionary")`, `@RequestParam(required = false) @Nullable String q`, Swagger 설명 · 400 · 502
  - `DictionaryService` — 다듬기(앞뒤 공백 `strip` → NFC) → 비었거나 50자(코드포인트) 넘으면 400 + `errors[q]` → 저장소 확인 → 사전 부르기 → 저장
  - `DictionaryCache` — `StringRedisTemplate` + `JsonMapper`. 읽기 · 쓰기의 `DataAccessException` 은 경고 로그(검색어는 안 적음)만 남기고 넘어간다
  - `DictionarySource` — 인터페이스 `List<DictionaryItem> search(String query)`. 실패는 `ApiException(DICTIONARY_UNAVAILABLE, …)`
  - `StdictClient` — `RestClient` 로 부른다. 본문을 문자열로 받아 `JsonMapper` 로 읽는다(응답 종류가 `text/json`). `item` · `sense` 가 객체 하나든 배열이든 받고, 뜻풀이 하나를 항목 하나로 옮긴다. 빈 `pos` 는 null, `word` · `definition` 이 빈 항목은 뺀다. 키가 비면 부르지 않고 502. 연결 2초 · 읽기 3초 넘으면 502
  - `DictionaryConfig` — `DictionarySource` 빈. 키는 `newlearn.dictionary.stdict-key`
  - `dto/DictionaryResponse(query, items, source)` · `dto/DictionaryItem(word, @Nullable pos, definition)`
- `common/web/OpenApiConfig` — 태그 「용어사전」을 회원 뒤에
- `backend/src/main/resources/application.yaml` — `newlearn.dictionary.stdict-key: ${STDICT_API_KEY:}` (값 없음)
- `.env.example` — `STDICT_API_KEY=` 한 줄과 설명
- 시험
  - 새 `DictionaryApiIntegrationTest` — 실제 Redis(Testcontainers) + `@MockitoBean DictionarySource`
  - 새 `dictionary/StdictClientTest` — `MockRestServiceServer`, 시간 초과는 로컬 `HttpServer`
  - 새 `dictionary/DictionaryCacheTest` — Redis 오류를 흉내 내 건너뛰는지
  - `OpenApiDocsTest` — 태그 · A19 문서 · 502 예시
- 문서
  - 새 `docs/specs/F13-dictionary-api.md` — 성공 기준 AC-1 ~ AC-8
  - `docs/api-screen.md` A19 — `source` 값, 저장 「(제안)」 지우기, 빈 본문 → 502, 항목은 사전 첫 쪽(최대 10개) · 뜻풀이마다 하나 · `word` 원문 그대로(`^` 포함), Redis 메모리 설정은 `infra/k8s/services/data/redis.yaml`(noeviction 1GB)을 가리킴
  - `docs/api.md` 5절 102 줄 메모, `docs/data-model.md` 용어사전 절은 A19 를 가리키게 줄임
  - `SSOT.md` 5절 사전 줄(키 env 이름 · 출처 · 저장), 8절 못 정한 것은 「하루 한도」만 남김

성공 기준 (`docs/specs/F13-dictionary-api.md` 에 그대로)

- AC-1: 로그인 없이 부르고, 응답은 `query`(다듬은 검색어) · `items[]`(`word` · `pos` · `definition`) · `source`
- AC-2: 결과가 없으면 200 과 빈 `items`
- AC-3: `q` 가 없거나 다듬은 뒤 비었거나 50자를 넘으면 400 `VALIDATION_FAILED` + `errors[q]` 한국어 이유. 50자는 통과
- AC-4: 사전 오류 JSON · HTTP 오류 · 시간 초과 · 빈 본문 · JSON 아님 · 키 없음은 502 `DICTIONARY_UNAVAILABLE`
- AC-5: 같은 검색어(공백 · NFC 만 다른 것 포함)는 하루 안에 사전을 한 번만 부르고, 저장 키에 만료가 있다. 실패는 저장하지 않는다
- AC-6: Redis 저장 · 읽기가 실패해도 사전 결과를 그대로 준다
- AC-7: 인증 키가 응답 · 로그 · 예외 설명에 나오지 않는다. 검색어를 로그에 남기지 않는다
- AC-8: Swagger 에 「용어사전」 태그 · `q` 설명 · 400 · 502 Problem 예시. `[확정]` 은 키로 실제 응답을 본 뒤 붙인다

## 작업 순서

- [x] Jira 102 를 진행 중으로 옮긴다
- [x] 실패하는 시험 — 시험이 컴파일되도록 뼈대(인터페이스 · DTO · 빈 메서드)만 두고, 단언에서 실패하는 기록을 남긴다(컴파일 오류와 구분)
- [x] 구현 — 시험 통과
- [x] 문서(스펙 · 계약 · SSOT) — 코드와 같은지 다시 읽기
- [ ] `/verify` · reviewer 조수 리뷰 → 커밋 · push → MR(→ backend) → 파이프라인 통과에서 멈추고 보고

## 안 바꿀 것

- 인증 · 권한 코드: `SecurityConfig` 는 이미 `/api/v1/dictionary` 를 열어 두었고 `SecurityRulesTest` 도 그 주소를 본다. 손대지 않는다
- 마이그레이션(테이블 없음), 다른 패키지(이슈 · 사건 · 판정 · 분석), 메인 세션의 Jira 40 작업
- 인프라: `infra/k8s/services/app/backend.yaml` 의 env 연결 · 봉인 Secret 은 사용자가 사이트 반영 때 한다. Redis 전역 시간 초과 · 메모리 설정, 요청 수 상한(SSOT 8절, Envoy 안)
- `.env`, FE · UX 문서, `docs/mvp-overview.md` · PRD
- MR 머지 · 사이트 반영(운영 DB 에는 GET 만)

## 리스크

- 실제 응답 모양이 공식 예시와 다를 수 있다(결과 없음 · `sense` 배열) — 둘 다 너그럽게 읽고, 키를 받으면 실제 응답으로 확인해 작은 MR 로 맞춘다
- 진짜 결과 없음도 빈 본문이면, 키 연결 전까지는 결과 없는 단어가 502 로 나간다 — 키 확인 때 바꾼다(위 「정한 것」)
- 인증 키 노출: `RestClient` 예외 메시지에는 키가 든 주소가 들어간다 — 예외 객체를 로그에 넘기지 않고 종류만 적는다. detail 은 고정 문장. 시험으로 본다(AC-7)
- Redis 가 답 없이 멈추면 Lettuce 기본 시간 초과(60초)까지 기다릴 수 있다. 세션도 같아서 이 MR 에서 다루지 않는다
- 요청 수 상한이 없어 누가 마구 부르면 사전 한도를 쓸 수 있다 — 기존 미정(SSOT 8절)
- 클러스터에서 사전으로 나가는 길: backend 에는 나가는 길 정책이 없다(`infra/k8s/services/app/netpol.yaml` 은 들어오는 길만). Java 인증서 확인은 검증에서 키 없이 한 번 불러 본다

## 어떻게 검증하나

- 실패 시험 기록 → 구현 뒤 통과. AC 마다
  - AC-1 · 2 · 3 · 5: `DictionaryApiIntegrationTest` — 결과 있음 · 빈 결과 · 400 네 가지(없음 · "" · 공백 · 51자)와 50자 통과 · 공백 · NFD 로 두 번 찾으면 `search` 1번 · 저장 키 만료가 0초 초과 1일 이하 · 실패 뒤 다시 찾으면 다시 부름
  - AC-4 · 7: `StdictClientTest` — 보낸 변수(`key` · `q` UTF-8 · `req_type=json`), 공식 예시(나무 2개)를 올바른 JSON 으로 고친 것 → 항목 2개, `sense` 배열, 빈 `pos`, `item` 없음 → 빈 목록, 빈 본문 · 오류 JSON(`error_code` 숫자 · 문자 둘 다) · HTTP 500 · I/O 오류 · HTML → 502, 키가 비면 요청 0번, 예외 설명에 키 없음, 읽기 3초 넘는 로컬 서버 → 502
  - AC-6: `DictionaryCacheTest`
  - AC-8: `OpenApiDocsTest`
- 되돌림 확인: 저장 · 다듬기 · 빈 본문 처리를 하나씩 잠깐 빼고 해당 시험이 실패하는지 본다
- `.claude/stack.md` §3 의 backend 포맷 검사 · 린트 · 테스트 · 빌드 전부
- 실제로 띄워 보기: compose 로 DB · Redis, `bootRun` 뒤 `curl 'localhost:8080/api/v1/dictionary?q=나무'` → 키 없음 502, `q=` → 400. 틀린 키(0 32자)를 env 로 주고 다시 → 바깥 사전을 실제로 부르고 빈 본문이라 502(Java 인증서 · 실제 연결 확인)
- MR 파이프라인 통과

## 되돌리는 법

- 이 MR 커밋을 revert 한다. 테이블 · 마이그레이션이 없어 데이터 조치가 없다
- Redis 의 `dict:*` 키는 하루면 저절로 사라진다. 바로 지우려면 `redis-cli --scan --pattern 'dict:*'` 로 찾아 지운다
- 사이트에 키를 넣기 전에는 A19 가 늘 502 라 다른 기능에 영향이 없다
