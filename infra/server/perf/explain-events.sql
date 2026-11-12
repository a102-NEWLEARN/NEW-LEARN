-- 사건 · 이슈 쪽 쿼리 실행 계획 — Jira S15P31A102-194 개선 전 · 후에 같은 파일을 돌린다. 돌리는 법은 README.md
-- explain.sql(11-11, 운영에서 받은 문장 15개)과 따로 둔다 — 그 표와 견줄 수 있게. 여기 A2 · A1 · A3 · A25 · A13 은 JdbcClient 문장 그대로이고,
-- A4 · A5 는 JPQL(EventRepository · ArticleEventRepository)과 같은 뜻의 SQL 이다(Hibernate 가 만든 문장이 아니라 계획 모양을 보려는 것). A6 는 explain.sql 의 앱 문장 그대로
-- A2 목록은 옛 SQL(AGGREGATE) · 새 SQL(LIST) 둘 다 둔다. 배포 뒤 앱이 보내는 것은 새 SQL — pg_stat_activity 로 확인
-- 사건 · 이슈 값은 데이터에서 고른다: issue = 공개 사건이 가장 많은 이슈, event = 공개 기사가 가장 많은 사건, ids = 최근 사건순 첫 쪽 이슈 다섯
\pset pager off
\set ON_ERROR_STOP on
select e.issue_id as issue from event e join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null
 where e.issue_id is not null group by e.issue_id order by count(distinct e.id) desc, e.issue_id limit 1 \gset
select ae.event_id as event from article_event ae join article a on a.id = ae.article_id and a.released_at is not null
 group by ae.event_id order by count(*) desc, ae.event_id limit 1 \gset
select occurred_at as occ from event where id = :event \gset
select string_agg(id::text, ',') as ids from (select i.id from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id
 join article a on a.id = ae.article_id and a.released_at is not null group by i.id order by max(e.occurred_at) desc nulls last, i.id desc limit 5) t \gset
select string_agg(id::text, ',') as evs from (select id from event where issue_id in (:ids)) t \gset
\echo 'event =' :event 'issue =' :issue 'ids =' :ids '— bench.py 인자는 이 순서: <이름표> <event> <issue>'

\echo '== A2 개수 (분야 없음)'
explain (analyze, buffers, timing off, summary on)
select count(*) from issue i where exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) and (null::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = null::text));
\echo '== A2 개수 (politics)'
explain (analyze, buffers, timing off, summary on)
select count(*) from issue i where exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) and ('politics'::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = 'politics'::text));

\echo '== A2 목록 옛 (분야 없음 · lastEventAt · 5)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where (null::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = null::text)) group by i.id order by case when 'lastEventAt' = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last, i.id desc limit 5 offset 0;
\echo '== A2 목록 새 (분야 없음 · lastEventAt · 5)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at from (select e.issue_id, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from event e join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where e.issue_id is not null and (null::text is null or exists (select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = null::text)) group by e.issue_id) c join issue i on i.id = c.issue_id order by case when 'lastEventAt' = 'createdAt' then i.created_at else c.last_event_at end desc nulls last, i.id desc limit 5 offset 0;
\echo '== A2 목록 옛 (분야 없음 · createdAt · 3)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where (null::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = null::text)) group by i.id order by case when 'createdAt' = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last, i.id desc limit 3 offset 0;
\echo '== A2 목록 새 (분야 없음 · createdAt · 3)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at from (select e.issue_id, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from event e join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where e.issue_id is not null and (null::text is null or exists (select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = null::text)) group by e.issue_id) c join issue i on i.id = c.issue_id order by case when 'createdAt' = 'createdAt' then i.created_at else c.last_event_at end desc nulls last, i.id desc limit 3 offset 0;
\echo '== A2 목록 옛 (politics · lastEventAt · 3)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where ('politics'::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = 'politics'::text)) group by i.id order by case when 'lastEventAt' = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last, i.id desc limit 3 offset 0;
\echo '== A2 목록 새 (politics · lastEventAt · 3)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at from (select e.issue_id, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from event e join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where e.issue_id is not null and ('politics'::text is null or exists (select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = 'politics'::text)) group by e.issue_id) c join issue i on i.id = c.issue_id order by case when 'lastEventAt' = 'createdAt' then i.created_at else c.last_event_at end desc nulls last, i.id desc limit 3 offset 0;
\echo '== A2 목록 옛 (economy · lastEventAt · 50)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where ('economy'::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = 'economy'::text)) group by i.id order by case when 'lastEventAt' = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last, i.id desc limit 50 offset 0;
\echo '== A2 목록 새 (economy · lastEventAt · 50)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at from (select e.issue_id, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from event e join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where e.issue_id is not null and ('economy'::text is null or exists (select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = 'economy'::text)) group by e.issue_id) c join issue i on i.id = c.issue_id order by case when 'lastEventAt' = 'createdAt' then i.created_at else c.last_event_at end desc nulls last, i.id desc limit 50 offset 0;

\echo '== A2 최근 사건 (findLastEvents, 이슈 다섯)'
explain (analyze, buffers, timing off, summary on)
select distinct on (issue_id) issue_id, id, title, label, occurred_at from event e where issue_id in (:ids) and exists (select 1 from article_event public_link join article public_article on public_article.id = public_link.article_id where public_link.event_id = e.id and public_article.released_at is not null) order by issue_id, occurred_at desc, id desc;
\echo '== A2 분야 (findCategories)'
explain (analyze, buffers, timing off, summary on)
select ic.issue_id, c.code, c.name from issue_category ic join category c on c.code = ic.category_code where ic.issue_id in (:ids) order by ic.issue_id, c.sort_order;
\echo '== A1 이슈 수'
explain (analyze, buffers, timing off, summary on)
select ic.category_code, count(*) as total from issue_category ic join issue i on i.id = ic.issue_id where exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) group by ic.category_code;
\echo '== A1 기사 수'
explain (analyze, buffers, timing off, summary on)
select category_code, count(*) as total from article where released_at is not null and category_code is not null group by category_code;

\echo '== A3 이슈 머리 (findHeader)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where i.id = :issue group by i.id;
\echo '== A25 관심 이슈 (findCardsByIds, 다섯)'
explain (analyze, buffers, timing off, summary on)
select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at from issue i join event e on e.issue_id = i.id join article_event ae on ae.event_id = e.id join article a on a.id = ae.article_id and a.released_at is not null where i.id in (:ids) group by i.id;
\echo '== A4 타임라인 사건 (findPublicByIssueId)'
explain (analyze, buffers, timing off, summary on)
select e.* from event e where e.issue_id = :issue and exists (select 1 from article_event l join article a on a.id = l.article_id where l.event_id = e.id and a.released_at is not null) order by e.occurred_at asc, e.id asc;
\echo '== A4 사건별 수 (findEventCounts)'
explain (analyze, buffers, timing off, summary on)
select e.id, count(distinct a.id) as article_count, count(distinct a.press_code) as publisher_count from event e left join article_event ae on ae.event_id = e.id left join article a on a.id = ae.article_id and a.released_at is not null where e.id in (select id from event where issue_id = :issue) group by e.id;
\echo '== A5 앞 사건 (findPrevious)'
explain (analyze, buffers, timing off, summary on)
select e.* from event e where e.issue_id = :issue and (e.occurred_at < :'occ' or (e.occurred_at = :'occ' and e.id < :event)) and exists (select 1 from article_event l join article a on a.id = l.article_id where l.event_id = e.id and a.released_at is not null) order by e.occurred_at desc, e.id desc limit 1;
\echo '== A5 공개 기사 수 (countReleasedArticles)'
explain (analyze, buffers, timing off, summary on)
select count(*) from article_event l join article a on a.id = l.article_id where l.event_id = :event and a.released_at is not null;
\echo '== A5 언론사 (findReleasedPublishers)'
explain (analyze, buffers, timing off, summary on)
select distinct p.* from article_event l join article a on a.id = l.article_id join press p on p.code = a.press_code where l.event_id = :event and a.released_at is not null order by p.code;
\echo '== A6 사건 관련 기사 개수'
explain (analyze, buffers, timing off, summary on)
select count(*) from article a1_0 where a1_0.released_at is not null and exists(select ae1_0.article_id from article_event ae1_0 where ae1_0.article_id=a1_0.id and ae1_0.event_id=:event);
\echo '== A6 사건 관련 기사 첫 쪽 (앱 문장 — explain.sql 과 같음)'
explain (analyze, buffers, timing off, summary on)
select a1_0.id,a1_0.body,c1_0.code,c1_0.name,c1_0.sort_order,a1_0.created_at,p1_0.code,p1_0.name,a1_0.published_at,a1_0.released_at,a1_0.reporter,a1_0.source,a1_0.source_categories,a1_0.source_tags,a1_0.title,a1_0.url from article a1_0 left join category c1_0 on c1_0.code=a1_0.category_code left join press p1_0 on p1_0.code=a1_0.press_code where a1_0.released_at is not null and exists(select ae1_0.article_id from article_event ae1_0 where ae1_0.article_id=a1_0.id and ae1_0.event_id=:event) order by a1_0.published_at,a1_0.id fetch first 5 rows only;
\echo '== A13 사건 (반도체)'
explain (analyze, buffers, timing off, summary on)
select id, title, issue_id from event e where issue_id is not null and strpos(lower(title), lower('반도체')) > 0 and exists (select 1 from article_event public_link join article public_article on public_article.id = public_link.article_id where public_link.event_id = e.id and public_article.released_at is not null) order by occurred_at desc, id desc limit 20;
\echo '== A13 이슈 (반도체)'
explain (analyze, buffers, timing off, summary on)
select id, title from issue i where strpos(lower(title), lower('반도체')) > 0 and exists (select 1 from event public_event join article_event public_link on public_link.event_id = public_event.id join article public_article on public_article.id = public_link.article_id where public_event.issue_id = i.id and public_article.released_at is not null) order by created_at desc, id desc limit 20;
\echo '== 분석 firstArticleIds (이슈 다섯의 사건)'
explain (analyze, buffers, timing off, summary on)
select distinct on (event_id) event_id, article_id from article_event where event_id in (:evs) order by event_id, linked_at, article_id;
