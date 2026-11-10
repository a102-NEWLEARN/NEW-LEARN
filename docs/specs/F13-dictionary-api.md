# F13 용어사전 — A19 · A26

2026-11-10 부터 화면은 A26(드래그한 말의 문맥 뜻)을 쓴다 — 아래 「A26」 절. A19 는 서버에 남겨 두고 화면에서만 뺐다(Jira 187, 계획 [2026-11-09-dictionary-meaning-bubble](../plans/2026-11-09-dictionary-meaning-bubble.md)).

## A26 — 드래그한 말의 문맥 뜻 (Jira 187)

계약 원본: [A26](../api-screen.md), [공통 규칙 · 오류 코드](../api.md). 화면 동작은 UX 문서(EXPERIENCE.md) 「용어사전 말풍선」.

- AC-10: 로그인과 CSRF 번호표가 필요하다. 손님은 401, 번호표가 없으면 403 이고 GMS 를 부르지 않는다.
- AC-11: 응답은 `query`(다듬은 `term`) · `word` · `pos` · `definition` 하나다. 모델이 풀이할 수 없다고 하면(말 조각 · 문맥에 근거 없음 · 거절 · 내용 필터) 200 에 세 칸이 null 이다.
- AC-12: `term`(비었음 · 글자 없음 · 50자 초과 · NUL), `around`(비었음 · 120자 초과), `contextType`(ARTICLE · ISSUE · EVENT 밖), `contextId`(없음)가 맞지 않으면 400 `VALIDATION_FAILED` 와 그 칸의 `errors[]`. `term` 이 `around` 안에, `around` 가 그 대상의 화면 글(기사 제목 · `content.title` · 잎, 이슈 제목 · 요약, 사건 제목 · 이름 · 요약) 안에 없어도 400 이다. 비교는 공백을 뺀 NFC 다. 기사 본문은 화면 글이 아니다. 400 이면 GMS 를 부르지 않는다.
- AC-13: 대상의 공개 규칙은 각 화면과 같다 — 없거나 숨긴 기사 · 이슈 · 사건은 `ARTICLE_NOT_FOUND` · `ISSUE_NOT_FOUND` · `EVENT_NOT_FOUND`. 마인드맵이 없는 기사도 제목은 고를 수 있다. 모델에는 고른 말 · `around` · 제목 · 문맥(기사는 본문의 그 말 근처)을 준다.
- AC-14: 같은 대상의 같은 말(공백 · 유니코드 조합만 다른 것 포함)은 하루 한 번 부른다. 키 `meaning:<종류>:<id>:<공백 뺀 말>` 에 만료(1일)가 있다. 풀이 불가는 두고 실패는 두지 않는다.
- AC-15: GMS 를 부르려 한 수를 한국 날짜로 세어 하루 한도(`newlearn.dictionary.meaning.daily-limit`, 기본 3,000)를 넘으면 502 `DICTIONARY_UNAVAILABLE`. 저장해 둔 답은 세지 않는다. 세는 키 `meaningquota:<날짜>` 에 만료(2일)가 있다. 세지 못하면(Redis 실패) 막는다. 한도 0 이면 부르지 않는다.
- AC-16: GMS 키가 없거나 · 401 · 429 · 400 · 늦은 실패 · 읽을 수 없는 답(JSON 아님 · `found` 없음 · 표제어나 뜻풀이가 비었거나 50 · 200자 초과)이면 502 `DICTIONARY_UNAVAILABLE`. 2초 안에 실패한 연결 오류 · 5xx 만 한 번 더 부른다. 품사가 10자를 넘으면 null.
- AC-17: 키 · 고른 말 · 문맥 · GMS 답(오류 본문 포함)은 로그에 남지 않는다.
- AC-18: Swagger 에 `[확정] A26` · 요청 본문 칸 설명 · 400 · 401 · 403 · 404 · 502 와 null 이 될 수 있는 응답 칸이 있다.

시험: AC-10 ~ AC-15 는 `DictionaryMeaningApiIntegrationTest`, AC-15 의 Redis 실패 · 0 은 `dictionary/MeaningQuotaTest`, AC-16 · AC-17 은 `dictionary/GmsMeaningClientTest`, AC-18 은 `OpenApiDocsTest`. 화면 쪽 드래그 규칙은 `frontend/src/components/meaning/pickTerm.test.ts`, 말풍선은 `MeaningBubble.test.tsx`.

실제로 확인한 것(2026-11-10, 로컬 backend `bootTestRun` + 빈 DB 에 넣은 시험 기사): 화면(실제 frontend)에서 흐름지도 잎을 드래그해 「의미」를 누르면 검사를 지나 GMS 까지 가고, 마인드맵 보기 SVG 글 6개(줄을 나누며 공백이 빠진 잎 5 · 가운데 제목)도 400 없이 지났다 — 화면 글과 서버 글이 맞는다. 이 PC 의 `GMS_API_KEY` 환경변수는 GMS 가 401 로 거절해 502 가 됐고, 로그에 키 · 고른 말이 남지 않았다. 처음 돌렸을 때 키만 있고 주소(`GMS_BASE_URL`)가 비면 500 이 나는 결함을 찾아 502 로 고쳤다(AC-16, `GmsMeaningClientTest.missingBaseUrlIs502NotInternalError`). 실제 뜻 응답 · 응답 시간 · 크레딧은 아직 못 쟀다 — 맞는 키로 사이트에 봉인한 뒤 잰다.

## A19 — 표준국어대사전 검색

계약 원본: [A19 용어사전](../api-screen.md), [공통 규칙 · 오류 코드](../api.md), [데이터 소스 · 못 정한 것](../../SSOT.md) 5 · 8절.
결과 저장(Redis 하루, 결과가 있을 때만) · 빈 응답 처리 · 출처 표시(「국립국어원 표준국어대사전」)는 2026-10-29 사용자 결정으로 원본에 반영했다. 같은 날 실제 키로 응답 모양을 확인했다. 계획은 [2026-10-29-dictionary](../plans/2026-10-29-dictionary.md).

- AC-1: 로그인 없이 부른다. 응답은 `query`(다듬은 검색어) · `items[]`(`word` · `pos` · `definition`) · `source` 이고, 품사가 없으면(사전의 「품사 없음」 포함) `pos` 를 빼지 않고 null 로 보낸다.
- AC-2: 결과가 없으면 200 과 빈 `items`. 사전이 결과 없음으로 주는 200 + 빈 본문도 여기다.
- AC-3: `q` 가 없거나, 앞뒤 공백을 지운 뒤 비었거나, 50자를 넘으면 400 `VALIDATION_FAILED` 와 `errors[q]` 한국어 이유를 준다. 50자는 받는다. U+0000(NUL)이 들어 있어도 400 이다(2026-10-30, A13 과 같은 규칙). 이때 사전을 부르지 않는다.
- AC-4: 사전의 오류 JSON · HTTP 오류 · 시간 초과(연결 2초 · 읽기 3초) · JSON 이 아니거나 모양이 다른 응답(항목이 왔는데 하나도 못 읽음 포함) · 인증 키 없음은 502 `DICTIONARY_UNAVAILABLE` 이다. 키가 없으면 사전을 부르지 않는다.
- AC-5: 같은 검색어(앞뒤 공백 · 유니코드 조합만 다른 것 포함)는 하루 안에 사전을 한 번만 부른다. 결과가 있을 때만 저장하고, 저장 키에는 만료(1일)가 있다. 결과 없음 · 실패는 저장하지 않는다(틀린 키도 빈 본문이라).
- AC-6: Redis 저장 · 읽기가 실패해도(가득 참 · 끊김 · 깨진 값) 사전 결과를 그대로 준다.
- AC-7: 인증 키는 응답 · 예외 설명 · 로그에 나오지 않는다. 검색어와 사전이 준 오류 문구를 로그에 남기지 않는다.
- AC-8: Swagger 에 「용어사전」 태그 · `q` 설명 · 400 · 502 Problem 예시가 있다. 실제 응답을 확인해 `[확정] A19` 를 붙였다.
- AC-9(Jira 135, 2026-10-29): 사전을 부르려 한 수(사전 오류 포함)를 한국 날짜 단위로 세어 하루 한도(설정 `newlearn.dictionary.daily-limit`, 사이트 45,000 — Open API 한도 50,000 의 90%)를 넘으면 사전을 부르지 않고 502 `DICTIONARY_UNAVAILABLE` 이다. 저장해 둔 결과는 세지 않는다. 세는 키 `dictquota:<날짜>` 에는 만료(2일)가 있고 검색어 키와 섞이지 않는다. Redis 가 실패하면 세지 않고 부른다.

시험: AC-1 · 2 · 3 · 5 는 `DictionaryApiIntegrationTest`, AC-4 · 7 은 `dictionary/StdictClientTest`, AC-6 은 `dictionary/DictionaryCacheTest`, AC-8 은 `OpenApiDocsTest`, AC-9 는 `DictionaryQuotaIntegrationTest` · `dictionary/DictionaryQuotaTest`.

실제 키로 확인한 것(2026-10-29, 나무 · 구원투수 · 사과 · 먹다 · 뷁뷁뷁): 칸은 공식 예시와 같다. 표제어마다 첫 뜻풀이 하나(`sense` 객체)가 온다. 구 표제어 품사는 「품사 없음」 글자다. 결과 없음은 200 + 빈 본문이다(틀린 키와 같음). 하루 한도는 50,000건이다(신청 화면 안내).
