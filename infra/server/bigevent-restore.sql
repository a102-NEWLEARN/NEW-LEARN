-- 큰 사건에서 뗀 기사를 제자리로 되돌린다 (Jira S15P31A102-206, F06 동일 사건 기사 클러스터링)
-- psql 변수: run(되돌릴 실행 이름)
--
--   { echo 'begin;'; cat infra/server/bigevent-restore.sql; echo 'rollback;'; } \
--     | kubectl -n data exec -i postgres-0 -- psql -X -v ON_ERROR_STOP=1 \
--         -v run=<실행 이름> -U newlearn -d newlearn
--
-- 수가 맞으면 끝만 commit 으로 바꿔 한 번 더 돌린다.
-- 되돌린 뒤에는 그 실행 줄을 표에서 지운다(아래 마지막 문장) — 같은 이름을 다시 쓸 수 있다.
\set ON_ERROR_STOP on

select set_config('bigevent.run', :'run', true);

do $$
declare
    run_name text := current_setting('bigevent.run');
    n bigint;
begin
    select count(*) into n from fix_bigevent_detached f where f.run = run_name;
    if n = 0 then
        raise exception '실행 이름 % 으로 뗀 것이 없다', run_name;
    end if;
end
$$;

-- linked_at 을 뗄 때 값 그대로 되돌린다. 그사이 다시 붙었으면 건드리지 않는다
insert into article_event (article_id, event_id, linked_at)
select f.article_id, f.event_id, f.linked_at
from fix_bigevent_detached f
where f.run = current_setting('bigevent.run')
on conflict do nothing;

select count(*) as "되돌린 쌍"
from fix_bigevent_detached f
join article_event ae on ae.article_id = f.article_id and ae.event_id = f.event_id
where f.run = current_setting('bigevent.run');

delete from fix_bigevent_detached f where f.run = current_setting('bigevent.run');
