# F08 사건별 관련 기사 조회 — A5·A6 구현 계획

2026-10-26 사용자 승인. 기준은 최신 `origin/backend`(`ae12a87`),
작업 브랜치는 `feat/backend/S15P31A102-49-event-panel-api`다.

사건 패널과 관련 기사를 조회한다. 계약 원본은 [A5·A6](../api-screen.md),
검증 기준은 [기능 스펙](../specs/F08-event-panel-api.md)이다.
승인한 정렬·요약 기준은 계약 원본에만 적는다.

## 바꿀 파일

- `backend/src/main/java/kr/io/newlearn/event/`: `EventRepository`, `ArticleEventRepository`,
  새 `EventService`, `EventController`, `dto/EventPanelResponse`.
- `article/ArticleRepository`: 사건별 투입 기사 페이지 조회. 기존 기사 요약 DTO·조립기는 호출만 재사용한다.
- `common/web/OpenApiConfig`, `OpenApiDocsTest`: 사건 태그·A5·A6 명세 검증.
- 사건 API의 통합·쿼리·서비스·컨트롤러 테스트와 데이터 fixture.
- 이 계획, 기능 스펙, `docs/api-screen.md`, `SSOT.md`의 해당 참조.

## 안 바꿀 것

`.vscode/`와 타 티켓 변경, 마이그레이션·엔티티·인증·권한, FE·AI·큐,
사건 요약 재생성, F09 주장 관계 및 변화 분석·F10 근거 기반 변화 카드.
커밋·push·MR·Jira 변경·병합·브랜치 삭제는 승인 범위가 아니다.

## 리스크

투입 전 기사가 집계에 섞이거나, 시각 동률에서 앞뒤 이동·페이지가 흔들릴 수 있다.
기사별 연관·요약·상태 조회가 늘 수 있어 press·category를 함께 읽고 기존 일괄 조립기를 사용한다.
문서의 `NOT_ANALYZABLE`은 W1 구현 때부터 나온다. 49에서 별도 상태 계산을 만들지 않는다.

## 어떻게 검증하나

실패하는 테스트를 실제 확인한 뒤 DTO → 리포지토리 → 서비스 → 컨트롤러 순서로 구현한다.
스펙의 인수 기준과 기존 A1~A4·A7·A8 회귀, 페이지 크기별 SQL 수를 검사한다.
명령은 `.claude/stack.md` §3의 backend 포맷·전체 테스트·빌드·실행을 사용한다.
별도 임시 DB·Redis로 실제 HTTP 응답을 확인하고 테스트의 되돌림 확인을 한다.

## 되돌리는 법

49 변경만 되돌린다. DB 구조를 바꾸지 않아 데이터 복구는 필요 없다.
기존 `.vscode/`와 타 티켓 파일·스테이지 상태는 보존한다.
