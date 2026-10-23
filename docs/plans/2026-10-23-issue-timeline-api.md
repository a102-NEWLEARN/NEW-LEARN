# Jira S15P31A102-48 이슈 헤더·타임라인 조회

2026-10-23 사용자가 빈 이슈 처리까지 승인했다. 최신 origin/backend에서
feat/backend/S15P31A102-48-issue-timeline-api를 만들고 41번 집계를 재사용한다.
42번 미머지 코드는 가져오지 않는다.

## 바꿀 파일

IssueController·IssueService·IssueQueryRepository·EventRepository,
IssueHeaderResponse·TimelineResponse·TimelineEvent와 웹·서비스·DB·통합 테스트.
API 원본 문서와 기능 스펙, SSOT 참조를 맞춘다.

## 안 바꿀 것

A5 이후 API, 레인 분류, 사건 관계·태그·언론사 필터, 분석·연결 쓰기,
엔티티·마이그레이션·인증·권한, frontend·ai, 기존 .vscode와 41·42번 작업.

## 리스크

공통 집계 변경에 따른 A1·A2 회귀, 조인 중복, 0건 사건 누락,
기사 발행 시각과 사건 발생 시각 혼동, 사건별 추가 쿼리.

## 검증

실제 실패 테스트를 확인한 뒤 테스트 → DTO → 리포지토리 → 서비스 → 컨트롤러 순서.
기능 스펙의 성공 기준과 A1·A2 회귀, 고정 쿼리 수를 실제 PostgreSQL로 확인한다.
stack.md §3의 포맷·전체 테스트·bootJar 및 실제 A3·A4 HTTP 응답을 검증한다.

## 되돌리는 법

DB 구조 변경은 없다. 48번 변경만 되돌리고 기존 변경·41·42번 작업은 보존한다.
커밋·push·MR·Jira·병합·브랜치 삭제는 별도 승인 전 하지 않는다.
