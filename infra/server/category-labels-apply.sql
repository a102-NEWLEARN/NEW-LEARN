-- 분야 라벨 적용 — 라벨 표의 값을 article 에 쓴다 (Jira S15P31A102-177, infra/server/category-labels.md)
-- 덤프 적재 트랜잭션 안에서도 이 파일을 부른다(data-load.md 6절). 그때 search_path 가 비어 있으니 스키마 이름을 모두 붙이고,
-- 트랜잭션 명령을 쓰지 않는다. 임시 표가 on commit drop 이라 트랜잭션 밖에서 부르면 다음 문장에서 멈춘다 — 그대로 둔다
-- 숨기기만 하고 공개하지는 않는다. 덤프 적재가 임시 공개에서 내린 기사를 되살리지 않으려는 것이다

-- 코드 → 분야. 이 대응은 여기 한 곳에만 둔다. hidden 은 화면에서 뺀다(T 스포츠 · C 문화/연예 · X 제목이 깨진 기사 · 잘못된 본문 기사)
create temp table label_code on commit drop as
select *
from (values
    ('P', 'politics', false),
    ('E', 'economy', false),
    ('S', 'society', false),
    ('W', 'world', false),
    ('I', 'it_science', false),
    ('T', null, true),
    ('C', null, true),
    ('X', null, true)
) as code (label, category_code, hidden);

do $$
declare
    unknown text;
begin
    select string_agg(distinct l.label, ', ') into unknown
    from category_label.article_label l
    left join pg_temp.label_code c on c.label = l.label
    where c.label is null;
    if unknown is not null then
        raise exception '모르는 라벨 코드: %', unknown;
    end if;
end
$$;

-- 값이 같은 기사는 건드리지 않는다. 두 번 돌려도 0건 변경이다
update public.article a
set category_code = c.category_code,
    released_at   = case when c.hidden then null else a.released_at end
from category_label.article_label l
join pg_temp.label_code c on c.label = l.label
where a.url = l.url
  and (a.category_code is distinct from c.category_code
       or (c.hidden and a.released_at is not null));

-- 이슈 분야 다시 계산 — IssueCategoryRepository.fillMostCommon 과 같은 식(기사가 가장 많은 분야, 같으면 sort_order, 분야 빈 기사는 뺌)
delete from public.issue_category;

insert into public.issue_category (issue_id, category_code)
select distinct on (counted.issue_id) counted.issue_id, counted.category_code
from (
    select e.issue_id, a.category_code, c.sort_order, count(*) as total
    from public.event e
    join public.article_event l on l.event_id = e.id
    join public.article a on a.id = l.article_id
    join public.category c on c.code = a.category_code
    where e.issue_id is not null
    group by e.issue_id, a.category_code, c.sort_order
) counted
order by counted.issue_id, counted.total desc, counted.sort_order, counted.category_code;

-- 라벨이 이겼는지 — 어기면 트랜잭션 전체가 되돌아간다
do $$
begin
    if exists (
        select 1
        from public.article a
        join category_label.article_label l on l.url = a.url
        join pg_temp.label_code c on c.label = l.label
        where c.hidden and a.released_at is not null
    ) then
        raise exception '숨겨야 할 기사가 공개되어 있다';
    end if;
end
$$;

-- 눈으로 대조할 수
select coalesce(category_code, '(없음)') as 공개_분야, count(*) as 기사
from public.article
where released_at is not null
group by 1
order by 2 desc;

select l.label as 라벨, count(*) as 라벨_수, count(a.id) as 맞춘_기사
from category_label.article_label l
left join public.article a on a.url = l.url
group by 1
order by 2 desc;

select count(*) filter (where a.released_at is not null) as 공개_합,
       (select count(*)
        from public.bookmark b
        join public.article x on x.id = b.article_id
        join category_label.article_label y on y.url = x.url
        join pg_temp.label_code z on z.label = y.label
        where z.hidden) as 숨겨진_북마크,
       (select count(*)
        from public.event e
        where exists (select 1 from public.article_event ae where ae.event_id = e.id)
          and not exists (
              select 1
              from public.article_event ae
              join public.article x on x.id = ae.article_id
              where ae.event_id = e.id and x.released_at is not null)) as 기사가_모두_숨겨진_사건
from public.article a;
