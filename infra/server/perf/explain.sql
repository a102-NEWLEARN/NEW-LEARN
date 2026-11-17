-- 조회 쿼리 실행 계획 — 개선 전 · 후에 같은 파일을 돌린다 (Jira S15P31A102-189 · 190)
-- 돌리는 법 · 읽는 법: 같은 폴더 README.md. 결과는 results.md
--
-- SQL 은 운영에서 실제로 나간 문장이다(2026-11-11, pg_stat_activity 에서 받음). 매개변수만 값으로 바꿨다
--   A7 기사 목록 `GET /api/v1/articles` · A6 사건 관련 기사 `GET /api/v1/events/{eventId}/articles`
--     — Spring Data JPA(Hibernate)가 만든 문장. 본문(body)까지 읽고 언론사 · 분야를 조인한다
--   A1 분야 수 `GET /api/v1/categories` · A2 이슈 목록 `GET /api/v1/issues` · A13 통합 검색 `GET /api/v1/search`
--     — JdbcClient 문장 (CategoryQueryRepository · IssueQueryRepository · SearchQueryRepository · PublicEventSql)
-- 앱은 같은 문장을 다섯 번 넘게 보내면 일반 계획(generic plan)을 쓸 수 있다(pgJDBC prepareThreshold). 여기 값은 값을 넣은 계획이다
\pset pager off
\set ON_ERROR_STOP on
\echo '== 기사 표 행 수 (표를 한 번 통째로 읽는다 — stats.sql 짝 사이에 두지 않으려고 여기 둔다)'
select count(*) as rows, count(*) filter (where released_at is not null) as released_rows from article;
-- 사건 관련 기사(A6)는 공개 기사가 가장 많은 사건으로 잰다
select ae.event_id as event_id from article_event ae join article a on a.id = ae.article_id and a.released_at is not null
group by ae.event_id order by count(*) desc, ae.event_id limit 1 \gset
\echo 'A6 사건 =' :event_id

\echo '== A7 기사 목록 첫 쪽 — 본문'
explain (analyze, buffers, timing off, summary on)
select a1_0.id,a1_0.body,c1_0.code,c1_0.name,c1_0.sort_order,a1_0.created_at,p1_0.code,p1_0.name,a1_0.published_at,a1_0.released_at,a1_0.reporter,a1_0.source,a1_0.source_categories,a1_0.source_tags,a1_0.title,a1_0.url from article a1_0 left join category c1_0 on c1_0.code=a1_0.category_code left join press p1_0 on p1_0.code=a1_0.press_code where a1_0.released_at is not null order by a1_0.published_at desc,a1_0.id desc fetch first 8 rows only;
\echo '== A7 기사 목록 — 개수'
explain (analyze, buffers, timing off, summary on)
select count(*) from article a1_0 where a1_0.released_at is not null;
\echo '== A7 기사 목록 1000쪽 — 본문'
explain (analyze, buffers, timing off, summary on)
select a1_0.id,a1_0.body,c1_0.code,c1_0.name,c1_0.sort_order,a1_0.created_at,p1_0.code,p1_0.name,a1_0.published_at,a1_0.released_at,a1_0.reporter,a1_0.source,a1_0.source_categories,a1_0.source_tags,a1_0.title,a1_0.url from article a1_0 left join category c1_0 on c1_0.code=a1_0.category_code left join press p1_0 on p1_0.code=a1_0.press_code where a1_0.released_at is not null order by a1_0.published_at desc,a1_0.id desc offset 8000 rows fetch first 8 rows only;
\echo '== A7 분야 탭(정치) 첫 쪽 — 본문'
explain (analyze, buffers, timing off, summary on)
select a1_0.id,a1_0.body,c1_0.code,c1_0.name,c1_0.sort_order,a1_0.created_at,p1_0.code,p1_0.name,a1_0.published_at,a1_0.released_at,a1_0.reporter,a1_0.source,a1_0.source_categories,a1_0.source_tags,a1_0.title,a1_0.url from article a1_0 left join category c1_0 on c1_0.code=a1_0.category_code left join press p1_0 on p1_0.code=a1_0.press_code where a1_0.released_at is not null and a1_0.category_code='politics' order by a1_0.published_at desc,a1_0.id desc fetch first 8 rows only;
\echo '== A7 분야 탭(정치) — 개수'
explain (analyze, buffers, timing off, summary on)
select count(*) from article a1_0 where a1_0.released_at is not null and a1_0.category_code='politics';

\echo '== A1 분야 수 — 기사 수'
explain (analyze, buffers, timing off, summary on)
select category_code, count(*) as total from article where released_at is not null and category_code is not null group by category_code;
\echo '== A1 분야 수 — 이슈 수'
explain (analyze, buffers, timing off, summary on)
select ic.category_code, count(*) as total from issue_category ic join issue i on i.id = ic.issue_id where exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) group by ic.category_code;

\echo '== A2 이슈 목록 — 개수'
explain (analyze, buffers, timing off, summary on)
select count(*) from issue i where exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) and (null::text is null or exists ( select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = null::text));
\echo '== A2 이슈 목록 — 카드 3장(최근 사건순)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where (null::text is null or exists ( select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = null::text)) group by i.id order by case when 'lastEventAt' = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last, i.id desc limit 3 offset 0;

\echo '== A13 검색(반도체) — 기사'
explain (analyze, buffers, timing off, summary on)
select id, title from article where released_at is not null and strpos(lower(title), lower('반도체')) > 0 order by published_at desc, id desc limit 20;
\echo '== A13 검색(반도체) — 사건'
explain (analyze, buffers, timing off, summary on)
select id, title, issue_id from event e where issue_id is not null and strpos(lower(title), lower('반도체')) > 0 and exists (select 1 from article_event public_link join article public_article on public_article.id = public_link.article_id where public_link.event_id = e.id and public_article.released_at is not null) order by occurred_at desc, id desc limit 20;
\echo '== A13 검색(반도체) — 이슈'
explain (analyze, buffers, timing off, summary on)
select id, title from issue i where strpos(lower(title), lower('반도체')) > 0 and exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) order by created_at desc, id desc limit 20;
\echo '== A13 검색(결과 없는 말) — 기사 · 가장 나쁜 경우'
explain (analyze, buffers, timing off, summary on)
select id, title from article where released_at is not null and strpos(lower(title), lower('뉴런측정없는말')) > 0 order by published_at desc, id desc limit 20;

\echo '== A6 사건 관련 기사 — 본문'
explain (analyze, buffers, timing off, summary on)
select a1_0.id,a1_0.body,c1_0.code,c1_0.name,c1_0.sort_order,a1_0.created_at,p1_0.code,p1_0.name,a1_0.published_at,a1_0.released_at,a1_0.reporter,a1_0.source,a1_0.source_categories,a1_0.source_tags,a1_0.title,a1_0.url from article a1_0 left join category c1_0 on c1_0.code=a1_0.category_code left join press p1_0 on p1_0.code=a1_0.press_code where a1_0.released_at is not null and exists(select ae1_0.article_id from article_event ae1_0 where ae1_0.article_id=a1_0.id and ae1_0.event_id=:event_id) order by a1_0.published_at,a1_0.id fetch first 5 rows only;
\echo '== A6 사건 관련 기사 — 개수'
explain (analyze, buffers, timing off, summary on)
select count(*) from article a1_0 where a1_0.released_at is not null and exists(select ae1_0.article_id from article_event ae1_0 where ae1_0.article_id=a1_0.id and ae1_0.event_id=:event_id);
