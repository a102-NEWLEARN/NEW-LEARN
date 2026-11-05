-- 분야 라벨 다시 넣기 — 합치기 전에 옛 값을 남긴다 (Jira S15P31A102-183, infra/server/category-labels.md)
-- psql 변수: run(이번 실행 이름). 받기(load)와 합치기(merge) 사이에서 같은 트랜잭션으로 부른다 — 받은 임시 표를 읽는다
-- 이미 라벨 있는 기사는 합치기가 label 만 덮고 article_label 의 옛 값 · run 을 처음 그대로 둔다. 그래서 undo 로는 첫 실행 전으로만 돌아간다
-- 이 표가 이번 실행 직전 값을 갖는다. 되돌리는 SQL 은 category-labels.md 6절
create table if not exists category_label.relabel_before (
    run           text        not null,
    url           text        not null,
    old_label     text        not null,
    category_code text,
    released_at   timestamptz,
    saved_at      timestamptz not null default now(),
    primary key (run, url)
);

-- 실행 이름을 다시 쓰면 멈춘다. 같은 이름이면 되돌릴 때 앞 실행과 묶인다 — first 를 다시 쓰면 그 실행만 떼어 되돌릴 수 없다
select set_config('category_label.run', :'run', true);

do $$
declare
    this_run text := current_setting('category_label.run');
begin
    if exists (select 1 from category_label.article_label where run = this_run)
       or exists (select 1 from category_label.relabel_before where run = this_run) then
        raise exception '이미 쓴 실행 이름이다: %', this_run;
    end if;
end
$$;

insert into category_label.relabel_before (run, url, old_label, category_code, released_at)
select :'run', l.url, l.label, a.category_code, a.released_at
from pg_temp.incoming i
join category_label.article_label l on l.url = i.url
left join public.article a on a.url = i.url;

select count(*) as 옛_값_남김
from category_label.relabel_before
where run = :'run';
