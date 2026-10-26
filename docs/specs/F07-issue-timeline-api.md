# F07 사건 중심 이슈 에볼루션 맵 — A3·A4

계약 원본: [API 공통 규칙](../api.md), [A3·A4](../api-screen.md),
[데이터 모델](../data-model.md). 집계 기반은 [A1·A2 스펙](F02-category-issue-api.md).

- AC-1: A3는 A2와 같은 집계·기간·카테고리 순서이며 lastEvent 키는 없다.
- AC-2: A4는 사건 전체를 occurredAt·id 오름차순으로 반환한다. 기사 발행 시각으로 정렬하지 않는다.
- AC-3: 공개 기사와 언론사를 중복 없이 집계한다. 기사 0건·공개 전 기사만 있는 사건도 남긴다.
- AC-4: lane은 null로 남기고 relations는 없다. 두 occurredAtBasis를 저장된 대로 반환한다.
- AC-5: 존재하는 빈 이슈는 A3 집계 0·기간 null, A4 events 빈 배열로 200이다. 없는 이슈는 404 ISSUE_NOT_FOUND, 잘못된 ID 형식은 400이다.
- AC-6: null 필드를 유지하고 시각은 +09:00이다. 로그인 없이 조회한다.
- AC-7: 사건 수가 늘어도 사건별 추가 쿼리는 없다. 공통 집계 변경 후 기존 A1·A2 계약을 유지한다.
