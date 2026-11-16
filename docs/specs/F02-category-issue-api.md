# F02 카테고리별 뉴스·이슈 조회 — A1·A2

계약 원본은 [API 공통 규칙](../api.md), [A1·A2](../api-screen.md),
[데이터 모델](../data-model.md)이다. 이 문서는 Jira S15P31A102-41의 검증 기준만 둔다.

- AC-1: A1이 계약의 카테고리 순서로 items만 반환하며 이슈·공개 기사 수가 정확하고 없는 집계는 0이다. 이슈 수는 A2 목록과 같은 기준으로 세서 두 수가 늘 맞는다(`api.md` 1절, Jira 179 · 208).
- AC-2: A2가 전체·카테고리 필터, 두 정렬, ID 동률 정렬과 페이지 계약을 지킨다.
- AC-3: 카드의 모든 필드, 카테고리 순서, 최근 사건 동률 선택이 계약과 같다.
- AC-4: 기사·언론사 수에서 공개 전 기사를 빼고 중복을 세지 않는다. 사건 수·기간은 공개 기사가 문턱(`QUERY_MIN_PUBLIC_ARTICLES`, 기본 1 · 사이트 3)을 넘는 사건 기준이고, 그런 사건이 없는 이슈는 목록과 총수에서 빠진다(Jira 179 · 206).
- AC-8: 그렇게 센 사건이 `QUERY_MIN_PUBLIC_EVENTS`(기본 1 · 사이트 3)개보다 적은 이슈는 A2 목록 · 총수와 A1 개수에서 빠진다. 그 이슈의 A3 · A4 는 그대로 200 이다 — 목록에서만 뺀다(Jira 208). 그렇게 센 사건 중 메인 흐름(MAIN) 사건이 `QUERY_MIN_MAIN_EVENTS`(기본 0 = 끔 · 사이트 1)개보다 적은 이슈도 같은 자리에서 빠진다(Jira 224). — 확인: `MinPublicEventsApiIntegrationTest` · `MinMainEventsListShapeTest`
- AC-5: 빈 결과·범위 밖 페이지는 200, 없는 카테고리는 404 CATEGORY_NOT_FOUND,
  잘못된 sort·page·size는 400 VALIDATION_FAILED다.
- AC-6: null 필드를 생략하지 않고 시각을 +09:00으로 보낸다. 로그인 없이 조회할 수 있다.
- AC-7: 카드마다 별도 SQL을 실행하지 않는다.
