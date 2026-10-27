# F12 회원 · 관심 분야 — A17·A18 구현 계획

2026-10-26 최초 사용자 승인으로 `3f65733` 기준에서 구현·검증했던 변경을 재사용한다.
113번 병합 커밋 `1083ee3`과 V3, 작업 큐 V4를 포함한 `origin/backend`의
`ab98f34dc748aef93b91560c745cae66cb185b65`를 재개 기준으로 확인했다.
작업 브랜치는 `feat/backend/S15P31A102-65-member-categories-api`다.
62번의 `MemberPrincipal`, `MemberResponse`, `MemberService.profile`,
정렬된 관심 분야 조회와 `ApiException.errors`를 재사용한다.

계약 원본은 [A17·A18](../api-screen.md), [인증](../api.md#1-공통-규칙)이며
성공 기준은 [기능 스펙](../specs/F12-member-profile-api.md)이다.
확정한 응답 순서와 인증·CSRF 오류 우선순위는 계약 원본에만 적는다.

## 기준 반영

65번 브랜치를 최신 backend로 fast-forward한 뒤 작업했다.
114번 북마크·관심 이슈 계약과 최신 SSOT·분석 큐·투입 규칙은 그 기준 그대로 따른다.

## 바꿀 파일

- `member/MemberController`, `MemberService`: A17 조회와 A18 전체 교체.
- 새 `member/dto/ChangeCategoriesRequest`: 62번 가입 요청과 같은 한국어 목록·요소 검증.
- `MemberCategoryRepository`, `MemberRepository`: 회원별 교체와 같은 회원의 쓰기 직렬화.
- 회원 조회·교체 통합 시험(`MemberCategoriesApiIntegrationTest`), `OpenApiDocsTest`.
- 이 계획, 기능 스펙, `docs/api-screen.md`, `SSOT.md`의 해당 참조.

## 안 바꿀 것

다른 티켓 작업은 건드리지 않는다.
로그인·가입·로그아웃 정책, principal·회원 응답 모양, Redis 세션·CSRF 설정,
비밀번호·이름 변경·탈퇴·홈 정렬·북마크·관심 이슈·DB 스키마는 바꾸지 않는다.

## 리스크

삭제와 등록 사이 실패, 같은 키 재등록, 동시에 온 전체 교체가 섞이는 경우를 검사한다.
교체는 쓰기 트랜잭션 하나로 수행하고 회원 행 잠금으로 같은 회원의 쓰기를 직렬화한다.
삭제 뒤 JPA 문맥의 옛 연결이 남지 않도록 처리한다.
관심 분야는 principal에 복사하지 않고 DB에서 읽어 기존 세션에서도 최신 정보를 준다.
62번의 필드 오류 처리와 CSRF 테스트 헬퍼를 재사용해 공통 오류·인증 동작을 유지한다.

## 어떻게 검증하나

실패하는 통합 테스트를 실제 확인한 뒤 DTO → 리포지토리 → 서비스 → 컨트롤러 순서로 구현한다.
실제 가입·로그인의 SESSION 쿠키와 `TestCsrf.csrfToken()`을 쓴다.
스펙 기준마다 본인만 변경·중복·없는 코드·빈 값·이전 데이터 유지·실패 rollback·동시 요청을 검사한다.
회원 조회에서 카테고리 수가 늘어도 SQL이 늘지 않는지와 62번·기존 API 회귀를 확인한다.
동시 교체 시험은 두 요청의 시작을 동기화하고, 별도 연결이 회원 행을 잠근 동안 두 요청의 SELECT 잠금 대기를
PostgreSQL `pg_blocking_pids`에서 직접 관측한다. 대기 중 이전 목록 조회, 잠금 해제 후 각 응답과 최종 전체 목록을 확인한다.
회원 행 잠금을 임시로 제외하면 이 시험이 단언에서 실패하는지 확인한 뒤 원래 파일을 복원한다.
명령은 `.claude/stack.md` §3의 backend 포맷·전체 테스트·bootJar·bootRun을 따른다.
실제 HTTP와 새 테스트의 되돌림 확인도 수행한다.

## 되돌리는 법

65번 MR을 Revert한다.
65번 자체에는 마이그레이션이 없으며 이미 backend에 병합된 V1~V4와 Flyway 이력은 건드리지 않는다.
이미 성공한 관심 분야 변경 데이터는 코드 되돌림으로 복구되지 않는다.

## 재개 후 검증 결과 (2026-10-26)

- 기존 회원 행 잠금을 임시 제외했을 때 강화한 동시 교체 시험 1개가 단언에서 실패했다.
  INSERT·DELETE의 대기는 회원 행 SELECT 잠금 대기와 다르다는 것을 잡았다. 원래 파일 복원 후 같은 시험이 통과했다.
- 최종 코드 기준 backend 필수 게이트가 통과했다. 포맷·전체 시험 206개(실패·오류·건너뜀 0개)·bootJar가 성공했다.
  65번 회원 통합·OpenAPI·62번 인증과 기존 A1~A8, 최신 작업 큐·내부 키·기사 투입 및 스키마 회귀를 포함한다.
- 새 임시 DB·Redis와 bootRun 서버에서 실제 HTTP 46건이 통과했다. 회원 2명·세션 2개로 본인만 변경·최신 조회·인증·CSRF와 DB 실패 rollback을 확인했다.
  V3의 source_summary 컬럼 부재와 V4 성공 이력, Swagger 회원 태그·확정 A17/A18·PUT 응답 코드도 확인했다.
- 독립 읽기 전용 리뷰에서 수정 필요 사항이 없었다. 기존 테스트용 비밀번호·PRD 길이 경고는 그대로 두었다.

## 리뷰 반영 (2026-10-27)

- MR 리뷰: 서로 다른 코드를 수만 개 보내면 `findAllById`가 PostgreSQL 매개변수 한도(65,535)를 넘어 500이었다.
  중복을 합친 코드가 분야 수보다 많으면 DB를 부르기 전에 400 `VALIDATION_FAILED`로 끊는다(가입 A14도 같은 도우미).
  시험 `MemberCategoriesApiIntegrationTest.tooManyDistinctCodesAre400BeforeQueryingCategories`
- 이 문서에서 작업 폴더 사정(보존 폴더 · 로컬 증거 경로)과 지금과 맞지 않는 승인 범위 문장을 뺐다
- Jira 56(마인드맵)과 `OpenApiDocsTest` 확정 목록이 겹쳐 두 줄(A9 · A17)을 다 남겼다
