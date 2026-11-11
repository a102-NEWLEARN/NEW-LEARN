-- 공개 기사(released_at 이 있는 행)만 담는 인덱스 둘 (Jira S15P31A102-190)
--
-- 기사 표 13만 행 가운데 공개는 1만 3천 행이다. 인덱스가 기본 키 · URL 뿐이라 공개 기사만 보는 쿼리도
-- 매번 표 전체(약 3만 8천 페이지)를 읽었다. 운영에서 실제로 나간 쿼리 15개 중 13개가 그랬다(infra/server/perf/results.md)
--   첫째: A7 기사 목록 본문 · 개수, A13 검색의 기사, 그리고 공개 기사가 있는지 보는 조인
--         (A1 분야 수의 이슈 수 · A2 이슈 목록 · A13 검색의 사건 · 이슈 — common/PublicEventSql 과 IssueQueryRepository)
--         press_code 를 같이 담아 A2 이슈 카드의 언론사 수를 표 없이 센다
--   둘째: A7 분야 탭 본문 · 개수, A1 분야 수의 기사 수
-- 칸 순서 · 방향은 목록 정렬(ArticleService: published_at desc, id desc)과 같다. 모양은 ArticlePublicIndexSchemaTest 가 지킨다
--
-- concurrently 를 쓰지 않는다 — 운영 13만 행에서 몇 초면 끝나고, 그동안 읽기는 되고 기사 쓰기만 기다린다
-- 되돌리기: 인덱스만 지우면 원래대로다(docs/plans/2026-11-11-query-performance.md 「되돌리는 법」)
create index article_public_published_idx
    on article (published_at desc, id desc) include (press_code)
    where released_at is not null;

create index article_public_category_published_idx
    on article (category_code, published_at desc, id desc)
    where released_at is not null;
