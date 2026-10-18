# 프로젝트: NEW:LEARN (S15P31A102)
한 줄 목적: 뉴스 기사를 AI 로 6하원칙 마인드맵으로 구조화하고, 같은 사건을 다룬 기사를 묶어 이슈의 흐름으로 보여 주는 AI 뉴스 서비스. 최종 발표 2026-11-18.

## 하네스
- 하네스 지도: `.claude/README.md`
- 일하는 원칙 전문: `.claude/HARNESS.md`
- 명령·경로·게이트: `.claude/stack.md`  ← 명령은 여기서만 읽는다

**네 가지 약속** (판단 기준은 `.claude/HARNESS.md`)
1. 증거 없이 "됐다"고 하지 않는다
2. 추측하지 않는다 — 모르면 물어본다
3. 한 번에 작은 작업 하나
4. 같은 사실을 두 곳에 적지 않는다

## 아키텍처
- `frontend/` — React. 기사 마인드맵 · 이슈 에볼루션 맵 화면
- `backend/` — Spring Boot. 조회 API, 분석 작업 등록, 분석 결과 저장. PostgreSQL(pgvector) · Redis
- `ai/` — FastAPI 워커. Redis Streams 작업 큐를 소비해 임베딩과 SSAFY GMS 호출(6하원칙 추출 · 동일 사건 판정)을 한다
- 구성 · 정한 것 · 못 정한 것은 `SSOT.md`. 무엇을 만드는지는 `docs/mvp-overview.md`

## 명령
👉 `.claude/stack.md` §3. **여기에 복붙하지 않는다.**

## 문서 색인
👉 `.claude/stack.md` §7 (충돌 우선순위 포함). 여기에 복붙하지 않는다.

## 규칙
- 큰 변경은 편집 전 `/plan` 으로 승인받는다 (언제 필수인지는 `/plan` 3절). plan mode 에 들어가면 plan 스킬부터 연다
- 계획 · MR 본문 · 커밋 메시지 · 보고는 `/write` 규칙으로 쓴다
- 새 기능은 실패하는 테스트를 먼저
- 기능 번호(F01~F11)는 처음 나올 때 이름을 붙인다 — 예: `F07 사건 중심 이슈 에볼루션 맵`. 이름은 `docs/mvp-overview.md` 3-1 표에서 읽는다. 번호만 보고는 팀원 대부분이 무슨 기능인지 모른다
- MR 본문은 `.gitlab/merge_request_templates/Default.md` 를 따른다. 쓰는 법은 그 파일 머리의 주석에 있다
- 확정 기능은 기사 마인드맵(F03~F05)과 이슈 트래킹(F06~F08), 이를 받치는 F01 · F02 · F11 이다. F09 주장 관계 및 변화 분석 · F10 근거 기반 변화 카드는 추후 논의 — 착수 전에 팀과 확인한다
- `docs/mvp-overview.md` 와 PRD 는 PM 확인이 필요한 팀 문서다. 고칠 때는 MR 로 올려 PM 확인을 받는다
- 개발 흐름(스펙 · 계획 · 구현 · 검증 · 리뷰)은 하네스 스킬이 기본이다 — `/spec` · `/plan` · `/verify` · `reviewer` 조수. BMAD 스킬(`bmad-*`)로 하고 싶은 사람은 BMAD 를 써도 된다. 기획 문서(PRD · UX · 아키텍처)는 BMAD 로 만든다
  - 어느 쪽을 쓰든 지킨다: AI 지시는 이 `AGENTS.md` 하나다 (`bmad-project-context` 로 지시 블록을 따로 만들지 않는다). 진행 상황은 Jira 에만 둔다 (`bmad-sprint-planning` 의 상태 파일을 만들지 않는다). 커밋 · MR 은 하네스 게이트와 MR 템플릿을 거친다

## 건드리지 말 것
- `.env` · GMS 키 · Lightsail 접속 키(`*.pem`) — 비밀값. 문서에는 이름만 적는다
- `_bmad/` · `.claude/skills/bmad-*` — BMAD 가 설치하고 관리한다. 바꿀 때는 `bmad-customize` 로
- `docs/prototype/*.html` · `docs/presentation/screens/` — 내보낸 결과물. 원본에서 다시 만든다
- 이미 적용된 DB 마이그레이션 — 새 파일로만 바꾼다 (마이그레이션 폴더가 생기면 경로를 여기 적는다)
- 인증 · 권한 코드 — 고쳤으면 사람이 최종 확인한다

## 완료 정의
👉 `/feature-done` 이 점검한다. 항목은 `.claude/HARNESS.md` 9절 + 아래.
- Jira 티켓 상태를 옮긴다 (머지되면 Done)
- 바꾼 기능의 스펙(`docs/specs/`)과 `SSOT.md` 의 해당 절이 코드와 맞는다
