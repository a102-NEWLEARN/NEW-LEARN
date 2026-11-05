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
    -- 실행 이름을 다시 쓰면 여기서 멈춘다. 덮으면 이미 바뀐 값이 옛 값이 된다
    primary key (run, url)
);

insert into category_label.relabel_before (run, url, old_label, category_code, released_at)
select :'run', l.url, l.label, a.category_code, a.released_at
from pg_temp.incoming i
join category_label.article_label l on l.url = i.url
left join public.article a on a.url = i.url;

select count(*) as 옛_값_남김
from category_label.relabel_before
where run = :'run';
