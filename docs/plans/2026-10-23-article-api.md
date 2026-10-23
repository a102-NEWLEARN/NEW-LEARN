# Jira S15P31A102-42 기사 목록·상세 조회

2026-10-23 사용자가 승인했다. 최신 origin/backend에서 42번 브랜치를 만든다.
41번 작업 브랜치에서 분기하거나 미머지 변경을 가져오지 않는다.

## 변경 파일

- article의 Controller·Service·Repository·ArticleSummaryAssembler, 요약·상세 DTO와 화면용 enum
- ArticleMindmapRepository·AnalysisJobRepository·ArticleEventRepository의 필요한 조회
- 웹·서비스·DB 조회·통합 테스트, 기능 스펙과 API 원본 문서

## 제외 범위

A6·A9 구현, 수집·분석 작업 생성·재처리, 사건·이슈 연결 쓰기, 본문 노출,
인증·권한, 엔티티·마이그레이션, frontend·ai, 기존 .vscode 변경.

## 리스크

연관 조회 N+1, 조인 중복·페이지 개수 오류, 요약 존재와 결과 존재의 혼동,
분석 상태 조합 누락. 실제 PostgreSQL과 JSON 응답으로 검증한다.

## 검증

테스트 → DTO → 리포지토리 → 서비스 → 컨트롤러 순서로 구현한다.
ArticleSummaryResponse와 조립 로직은 49번 A6에서도 재사용할 수 있게 article에 둔다.
확정한 세 규칙은 API 원본 문서를 참조하고 성공 기준은 기능 스펙에서 확인한다.
stack.md §3의 포맷·전체 테스트·빌드와 실제 HTTP를 확인한다.

## 되돌리는 법

DB 변경 없이 이번 변경만 되돌린다. 기존 변경과 41번 작업은 보존한다.
커밋·push·MR·Jira 변경은 별도 승인 전 하지 않는다.
