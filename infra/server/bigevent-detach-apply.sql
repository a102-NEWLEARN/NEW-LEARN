-- 큰 사건에서 「그 사건이 아니다」로 판정된 기사 떼기 ② — 확인하고 기록하고 뗀다
-- (Jira S15P31A102-206, F06 동일 사건 기사 클러스터링)
--
-- 안 건드리는 것
--   analysis_job — 판정 작업 행은 그대로 둔다. 지우면 그 기사가 다시 판정 줄에 서서 같은 큰 사건에
--     또 붙는다(backend AnalysisJobRepository.findNextMatchArticle 이 stage 행 유무로 고른다.
--     infra/server/realtime-restore.sql 머리에도 같은 말이 있다)
--   event 행 · event.issue_id · event.occurred_at — 사건 자체는 남긴다
--   article.released_at · 북마크 · 관심 이슈 — 기사는 목록 · 마인드맵에 그대로 보인다
\set ON_ERROR_STOP on

-- 줄 수를 단언한다: 스트림에서 cat 이 실패해도 COPY 0 으로 끝까지 가고 종료 0 이다
do $$
declare
    want     bigint := current_setting('bigevent.expected')::bigint;
    run_name text   := current_setting('bigevent.run');
    got  bigint;
    uniq bigint;
    dup  bigint;
begin
    select count(*), count(distinct (event_id, article_id)) into got, uniq from pg_temp.detach_in;
    if got <> want then
        raise exception '쌍 줄 수가 다르다: 받음 %, 기대 %', got, want;
    end if;
    if uniq <> got then
        raise exception '쌍 목록에 같은 (사건, 기사) 가 있다: 줄 %, 쌍 %', got, uniq;
    end if;
    if exists (select 1 from pg_temp.detach_in where verdict = 'Y') then
        raise exception '쌍 목록에 Y(맞음) 가 섞였다 — 맞는 기사를 떼면 안 된다';
    end if;
    select count(*) into dup from fix_bigevent_detached f where f.run = run_name;
    if dup > 0 then
        raise exception '실행 이름 % 은 이미 썼다(% 행) — 새 이름을 쓴다', run_name, dup;
    end if;
end
$$;

-- 지금 실제로 붙어 있는 쌍만 뗀다. 목록에 있어도 이미 없으면 건너뛴다
select count(*) as "쌍 목록",
       count(*) filter (where ae.article_id is not null) as "지금 붙어 있음",
       count(*) filter (where ae.article_id is null)     as "이미 없음"
from pg_temp.detach_in d
left join article_event ae on ae.event_id = d.event_id and ae.article_id = d.article_id;

insert into fix_bigevent_detached (run, article_id, event_id, linked_at, verdict)
select current_setting('bigevent.run'), ae.article_id, ae.event_id, ae.linked_at, d.verdict
from pg_temp.detach_in d
join article_event ae on ae.event_id = d.event_id and ae.article_id = d.article_id;

delete from article_event ae
using pg_temp.detach_in d
where ae.event_id = d.event_id and ae.article_id = d.article_id;

-- 뗀 뒤 그 사건들이 어떻게 되나. 공개 기사 3건 미만이면 화면에서 사라진다
--  (QUERY_MIN_PUBLIC_ARTICLES, SSOT.md 9절)
select count(*)                                   as "손댄 사건",
       sum(pub)                                   as "남은 공개 기사",
       min(pub)                                   as "가장 작아진 사건",
       count(*) filter (where pub < 3)            as "3건 미만 — 화면에서 사라짐"
from (
    select e.id,
           count(*) filter (where a.released_at is not null) as pub
    from event e
    left join article_event ae on ae.event_id = e.id
    left join article a on a.id = ae.article_id
    where e.id in (select distinct event_id from pg_temp.detach_in)
    group by e.id
) t;

-- 뗀 기사가 다른 사건에도 붙어 있나(없으면 사건 없는 기사가 된다 — 목록 · 마인드맵에는 그대로)
select count(*) as "뗀 기사", count(*) filter (where ok) as "다른 사건에 남아 있음"
from (
    select distinct d.article_id,
           exists (select 1 from article_event ae where ae.article_id = d.article_id) as ok
    from pg_temp.detach_in d
) t;
