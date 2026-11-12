-- A2 이슈 목록 옛 SQL(AGGREGATE) 과 새 SQL(IssueQueryRepository.LIST) 이 모든 쪽에서 같은 행 · 같은 순서인지 — Jira S15P31A102-194 (읽기만)
-- 정렬 2 × (분야 없음 + 5개 분야) × 크기 3 · 5 · 20 · 50 의 0쪽 ~ 끝 너머 한 쪽. 행마다 순번을 붙여 양쪽 except all 이 비어야 하고,
-- 모든 쪽 행 수 합이 개수 SQL(total)과 같아야 한다
\set ON_ERROR_STOP on
do $$
declare
    old_sql constant text := $q$
        select i.id, i.title, i.summary, i.created_at, count(distinct e.id) as event_count, count(distinct a.id) as article_count,
            count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at
        from issue i
        join event e on e.issue_id = i.id
        join article_event ae on ae.event_id = e.id
        join article a on a.id = ae.article_id and a.released_at is not null
        where ($1::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = $1::text))
        group by i.id
        order by case when $2::text = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last, i.id desc
        limit $3 offset $4 $q$;
    new_sql constant text := $q$
        select i.id, i.title, i.summary, i.created_at, c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at
        from (
            select e.issue_id, count(distinct e.id) as event_count, count(distinct a.id) as article_count,
                count(distinct a.press_code) as publisher_count, min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at
            from event e
            join article_event ae on ae.event_id = e.id
            join article a on a.id = ae.article_id and a.released_at is not null
            where e.issue_id is not null
              and ($1::text is null or exists (select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = $1::text))
            group by e.issue_id
        ) c
        join issue i on i.id = c.issue_id
        order by case when $2::text = 'createdAt' then i.created_at else c.last_event_at end desc nulls last, i.id desc
        limit $3 offset $4 $q$;
    count_sql constant text := $q$
        select count(*) from issue i where exists (select 1 from event public_event
            join article_event public_link on public_link.event_id = public_event.id
            join article public_article on public_article.id = public_link.article_id
            where public_event.issue_id = i.id and public_article.released_at is not null)
          and ($1::text is null or exists (select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = $1::text)) $q$;
    s text; c text; sz int; pg int; total bigint; got bigint; d1 bigint; d2 bigint; rows_sum bigint;
    pages_checked int := 0; pages_bad int := 0; totals_bad int := 0; rows_all bigint := 0;
begin
    foreach s in array array['lastEventAt', 'createdAt'] loop
        foreach c in array array[null, 'politics', 'economy', 'society', 'world', 'it_science']::text[] loop
            execute count_sql into total using c;
            foreach sz in array array[3, 5, 20, 50] loop
                rows_sum := 0;
                for pg in 0 .. (total / sz) + 1 loop
                    execute format('select count(*) from ((select row_number() over () as rn, o.* from (%s) o) except all '
                                   '(select row_number() over () as rn, n.* from (%s) n)) x', old_sql, new_sql)
                        into d1 using c, s, sz, pg * sz;
                    execute format('select count(*) from ((select row_number() over () as rn, n.* from (%s) n) except all '
                                   '(select row_number() over () as rn, o.* from (%s) o)) x', new_sql, old_sql)
                        into d2 using c, s, sz, pg * sz;
                    execute format('select count(*) from (%s) n', new_sql) into got using c, s, sz, pg * sz;
                    rows_sum := rows_sum + got;
                    rows_all := rows_all + got;
                    pages_checked := pages_checked + 1;
                    if d1 <> 0 or d2 <> 0 then
                        pages_bad := pages_bad + 1;
                        raise notice '다름: sort=% category=% size=% page=% (옛에만 %, 새에만 %)', s, coalesce(c, '-'), sz, pg, d1, d2;
                    end if;
                end loop;
                if rows_sum <> total then
                    totals_bad := totals_bad + 1;
                    raise notice 'total 다름: sort=% category=% size=% 쪽 합 % ≠ total %', s, coalesce(c, '-'), sz, rows_sum, total;
                end if;
            end loop;
            raise notice 'sort=% category=% total=%', s, coalesce(c, '-'), total;
        end loop;
    end loop;
    raise notice '결과: 본 쪽 % · 다른 쪽 % · total 이 안 맞는 조합 % · 본 행 %', pages_checked, pages_bad, totals_bad, rows_all;
end $$;
