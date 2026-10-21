# Jira 99 — 데이터 모델 · API 명세 v1 (10-19 ~ 10-21 회의 결과 반영)

2026-10-21 사용자 승인. 작업 순서의 체크는 이 MR 에서 끝낸 것이다.

## 무엇을 / 왜

10-19 테이블 검토 · 10-20 팀 회의 · 10-21 마인드맵 회의에서 정한 것이 FigJam 보기용 사본에만 있고, 팀 문서(v0)는 뒤처져 있다. 기능 티켓이 테이블을 만들기 전에 ERD · API 명세를 v1 로 맞춘다.
마인드맵이 6하원칙에서 가지 4개로 바뀌고 회원 · 용어사전이 MVP 에 들어와, MVP 개요(PM 확인 문서)도 따로 MR 로 고친다. 테이블(마이그레이션)은 이번에도 만들지 않는다.

## 문서에 넣을 결정 (사용자 확인 끝)

| 날짜 | 결정 |
|---|---|
| 10-20 | 카테고리 5개(정치 · 경제 · 사회 · 국제 · IT·과학), 5개 밖 기사는 수집 단계에서 안 받음. 원본 분류를 맞추는 행 · 이슈의 카테고리 여러 개는 실제 데이터 뒤 |
| 10-20 | 회원 = 아이디 · 비밀번호 · 이름 + 관심 분야 여러 개(고칠 수 있음). 관심 언론사 · 탈퇴 · 정보 수정 없음. 로그인 유지는 세션(10-21), 둘러보기는 로그인 없이 |
| 10-20 | 이슈는 사건 3개가 모이면 생성, 이름은 그때 AI 가 한 번(고정), 요약은 사건이 붙을 때마다 AI 가 다시. 검색창 아래는 새로 생성된 이슈 순 |
| 10-20 | 사건 이름(title) · 키워드(label) 모두 AI. 사건 패널은 사건 요약 + 관련 기사, 핵심 근거는 안 보임 |
| 10-20 | 타임라인은 메인 · 서브 레인만(선 종류 · 새사실 태그 없음). 나누는 기준은 미정 |
| 10-20 | 사용자 URL 입력(A10 · A11 · A12) 삭제. 데이터셋은 검증용, 실서비스는 NewsData 를 CronJob 하루 두 번(00 · 12시 `Asia/Seoul` — 10-19 사용자 제안을 10-20 에 「기존 정한 것 맞음」으로 확인) |
| 10-19 | 우리 AI 기사 요약은 GMS 토큰을 아끼려고 끌 수 있게(비워도 됨). NewsData 기사 요약은 따로 둔다 |
| 10-21 | 마인드맵 가지 4개 확정 — 핵심 내용(무슨 일이?) · 원인·배경(왜 일어났나?) · 반응(누가 뭐라고 했나?) · 전망(앞으로는?). 내용 있는 가지만. 같은 데이터를 흐름지도 · 마인드맵(가제) 두 보기로. 가운데는 기사 제목(나중에 AI 제목 가능), 잎은 문장만 |
| 10-21 | 노드 상세 창 · 원문 근거 화면 표시는 추후. 근거는 데이터로만 남김 |
| 10-21 | 언론사는 명부 표(`press`)를 둔다 |
| 10-21 | 용어사전 = 표준국어대사전 Open API 를 우리 API 가 대신 부름. 로그인 없이, 검색 기록 저장 없음. 「어려운 용어 자동 설명」(P2)을 대체해 MVP |

## v1 에서 새로 제안하는 것 (이 계획으로 승인받을 것)

| 항목 | 제안 | 까닭 |
|---|---|---|
| 언론사 | `press(code PK, name)` + `press_mapping(source, source_value → press_code)`. `article.publisher` → `press_code` | category_mapping 과 같은 모양. 소스마다 다른 표기를 한 언론사로 묶음 |
| 기사 원본 칸 | `source_category` → `source_categories text[]`, `source_tags text[]`, `source_summary text` | FigJam 에 그린 것 그대로 |
| 마인드맵 content | `{schemaVersion: "mindmap-v1", title: null, branches: [{type: CORE·CAUSE·REACTION·OUTLOOK, items: [{text, evidence?}]}]}`. `title` 이 비면 기사 제목 | 가지 4개 · 잎은 문장 · 선 이름 없음. AI 제목 자리만 남김 |
| 근거 | `evidence` 는 선택 칸(v0 의 문단 · 문장 번호 모양 그대로). 화면 응답(A9)에는 빼고 준다. 본문과 안 맞는 근거만 지우고 잎은 남긴다. `EVIDENCE_NOT_IN_BODY` 삭제, 가지가 하나도 없으면 `RESULT_SCHEMA_INVALID` | 화면에 안 쓰고 평가 · 추후 상세 창용 |
| 이슈 만들기 | 새 작업 단계 `ISSUE`: 새 사건이 생길 때 건다(기사만 붙을 때는 걸지 않음). 결과는 「이슈에 붙임(요약 다시)」 · 「새 이슈(사건 3개 이상 · 이름 · 요약)」 · 「아직 없음」. 어떤 사건을 묶을지는 미정(실험) | 지금 문서에는 새 이슈를 만드는 길이 없다. AI 파트 확인 필요로 표시 |
| 사건 키워드 | `event.label`. MATCH_EVENT 의 새 사건 결과에 `label` 추가 | |
| 레인 | A4 사건에 `lane`(MAIN · SUB, 기준 정하기 전엔 null). DB 칸은 기준이 정해진 뒤 | 저장 · 계산 여부는 기준에 달림 |
| 수집 기록 | `ingest_run`(FigJam 그대로). B1 투입은 남기고 「순차 투입」 문구는 「수집 배치(CronJob)가 적재 뒤 투입」으로 | |
| 회원 API | A14 가입 `POST /api/v1/members` · A15 로그인 `POST /api/v1/auth/login` · A16 로그아웃 · A17 내 정보 `GET /api/v1/members/me` · A18 관심 분야 바꾸기 `PUT /api/v1/members/me/categories`. 세션 쿠키, 세션 저장소는 구현 때 | 북마크 · 관심 이슈 API 는 MVP 여부가 미정이라 넣지 않음 |
| 용어사전 API | A19 `GET /api/v1/dictionary?q=` — 로그인 없이. 같은 검색어는 Redis 에 하루 저장 | 키를 화면에 숨기고 호출 수를 아낌 |
| 번호 | A10 ~ A12 는 비워 두고 새 것은 A14 부터 | 옛 문서 · Jira 의 번호와 헷갈리지 않게 |
| 오류 코드 | 삭제: `INVALID_URL` · `UNSUPPORTED_SOURCE` · `SOURCE_FETCH_FAILED`(화면 · 작업) · `TOO_MANY_REQUESTS` · `EVIDENCE_NOT_IN_BODY`. `ANALYSIS_JOB_NOT_FOUND` 는 내부 표로. 추가: `LOGIN_FAILED` 401 · `LOGIN_ID_TAKEN` 409 · `DICTIONARY_UNAVAILABLE` 502. `UNAUTHORIZED` 는 「로그인이 필요한 API · 내부 API」로 넓힘 | |
| 기능 번호 | F12 회원 · 관심 분야, F13 용어사전 (MVP 개요 MR 에서 제안) | 3-1 표에 기능이 없음 |

## 바꿀 파일

MR 1 — ERD · API 명세 v1 (Jira 새 티켓, BE 공동)
- `docs/data-model.md` — ERD 그림, 새 표 5개(category_mapping · press · press_mapping · member_category · ingest_run) 칸 표, article · issue · event · member · analysis_job · article_mindmap 칸, 4절 정한 것, 5절 미정 목록(풀린 것 지우고 새 미정 더함), 6절 기능 대조표
- `docs/api.md` — 계약 · 주소 · 흐름 그림(흐름 B 는 기사 선택만), 엔드포인트 표, 오류 코드 표, 4절 질문 정리, 5절 Jira 대조(57 닫힘 · 62~64)
- `docs/api-screen.md` — A1 · A2 · A4 · A5 · A7 · A8 · A9 고침, A10 ~ A12 삭제, A14 ~ A19 새로, 3절 마인드맵 content 다시 씀
- `docs/api-internal.md` — 작업 단계(`ISSUE` 추가), W1 결과 모양(EXTRACT 새 모양 · MATCH_EVENT `label` · ISSUE), 근거 규칙, 흐름 · 상태 그림의 A10 글자
- `docs/glossary.md` — 바뀐 용어(5개, 가지 4개, 근거, 레인, 언론사)와 새 용어(흐름지도 · 메인/서브 흐름 · 사건 키워드 · 관심 분야 · 용어사전 · 수집 실행)
- `SSOT.md` — 3절 분석 파이프라인 행(가지 4개 추출 · 사건 이름 · 키워드 · 이슈 생성 · 요약), 5절 데이터 소스(데이터셋 검증용 · NewsData CronJob · 표준국어대사전), 8절 못 정한 것 4행 고침 · 새 미정, 9절 뒤집은 것 3행
- `docs/plans/2026-10-21-data-model-api-v1.md` — 이 계획(파일 이름만 바꿔 옮김)

MR 2 — MVP 개요 (같은 티켓, PM 확인)
- `docs/mvp-overview.md` — F03 · 3-2 ② · 4장 6하원칙 → 가지 4개와 두 보기, F05 → 추후, 원문 근거 줄, 용어사전 MVP(F13), 회원 · 관심 분야(F12), 운영 방식(데이터셋 검증용 · NewsData CronJob), 8장 이슈맵 관계(메인 · 서브 레인)
- `AGENTS.md` — 한 줄 목적과 `ai/` 설명의 「6하원칙」
- `.gitlab/merge_request_templates/Default.md` — 기능 번호 표(F03 이름 · F05 · F12 · F13 · 날짜)

FigJam 보기용 사본
- 00 ERD — press · press_mapping 새 표, member_press 삭제, article 칸, 마인드맵 설명, analysis_job 단계
- 03 주소 지도 · 06 · 07 응답 지도 · 09 오류 코드 표 — A9 · A4 · 회원 · 용어사전 · 오류 코드

## 작업 순서

- [x] Jira 티켓(BE 공동 · pair · 포인트 3 · 스프린트) 만들고 진행 중으로, 브랜치를 최신 dev 에서 땀
- [x] 커밋 1 `data-model.md` — 그림이 mermaid 11 로 그려지는지
- [x] 커밋 2 `api.md` · `api-screen.md` · `api-internal.md` — 그림 확인, 엔드포인트 · 오류 코드 표와 각 절 대조
- [x] 커밋 3 `glossary.md` · `SSOT.md` · 계획 파일 — 커밋 직전 dev 다시 받아 SSOT 충돌 확인
- [x] reviewer 조수 새 눈 리뷰 → 고칠 것 반영
- [ ] MR 1 열기(템플릿, 결정 대조표 첨부)
- [ ] MR 2 브랜치 · 커밋 · MR(PM 확인)
- [ ] FigJam 반영 · 캡처로 확인
- 머지는 사용자가 말할 때. 머지 직전마다 원격 dev · MR 상태 확인

## 안 바꿀 것

- 코드 · 마이그레이션(`backend/src/main/resources/db/migration/`) — 테이블은 기능 티켓이 만든다
- PRD(`_bmad-output/`) · `docs/user-flow.md` · `EXPERIENCE.md` · `docs/specs/` — 이번 MR 밖(PM · 다른 담당)
- 인증 코드 · Spring Security 설정 — 문서에 방식만 적는다
- bookmark · interest_issue(MVP 여부 미정 그대로), F09 · F10, 미정으로 남는 것(이슈로 묶는 기준 · 사건이 되는 기사 수 · 레인 기준 · 임베딩 · 카테고리 대응 행 · 카테고리 코드 · 탭 순서)
- 어제 머지한 MVP 개요의 카테고리 5개 · URL 빼기 문구

## 리스크

- FE · AI 합의 전 제안(ISSUE 단계, content 모양, 회원 · 용어사전 API)이 섞인다 → 문서에 「제안」으로 표시하고 MR 리뷰어에 FE · AI 를 넣는다
- 표준국어대사전 API 하루 한도 · 결과 저장 · 출처 표시 조건이 미확인 → 캐시 기간 · 출처 표기는 「키 신청 때 약관 확인」으로 둔다
- 문서가 길어져 500줄 상한(Jira 80 기준)을 넘을 수 있다 → 넘는 문서는 절을 나눠 새 파일로
- SSOT 를 인프라 세션들이 자주 고친다 → 커밋 직전 dev 를 다시 받고, 충돌이 나면 그 줄만 맞춘다
- FigJam 은 Figma MCP 한도 때문에 내장 브라우저에서 손질한다 → 로그인이 풀리면 사용자 로그인 필요

## 어떻게 검증하나

- 위 결정 표 · 제안 표의 줄마다 문서의 해당 줄을 찾아 대조표로 MR 본문에 붙인다
- `grep -nE "6하원칙|7개|A1[0-2]|USER_URL|INVALID_URL|UNSUPPORTED_SOURCE|EVIDENCE_NOT_IN_BODY|source_category\b|publisher" docs/*.md SSOT.md` 에 남는 줄이 「뒤집은 것 · 삭제 기록」뿐
- 바꾼 Mermaid 그림 전부를 mermaid 11 로 그려 오류 0
- reviewer 조수 새 눈 리뷰, 커밋 게이트 · MR 규칙 검사 통과
- FigJam 캡처로 표 · 선이 읽히는지

## 되돌리는 법

문서만 바뀐다 → MR 을 revert. FigJam 은 버전 기록으로 되돌린다. 되돌릴 수 없는 것은 없다.
