-- 분야 라벨 받기 ② — 받은 줄을 확인하고 라벨 표에 합친다 (Jira S15P31A102-177, infra/server/category-labels.md)
-- psql 변수: expected(라벨 파일 줄 수), run(이번 실행 이름)
-- 줄 수를 단언하는 까닭: 스트림에서 cat 이 실패해도 COPY 0 으로 끝까지 가고 종료 0 이다
select set_config('category_label.expected', :'expected', true);

do $$
declare
    want bigint := current_setting('category_label.expected')::bigint;
    got  bigint;
    uniq bigint;
begin
    select count(*), count(distinct url) into got, uniq from pg_temp.incoming;
    if got <> want then
        raise exception '라벨 줄 수가 다르다: 받음 %, 기대 %', got, want;
    end if;
    if uniq <> got then
        raise exception '라벨 파일에 같은 URL 이 있다: 줄 %, URL %', got, uniq;
    end if;
end
$$;

insert into category_label.article_label (url, label, run, old_category_code, old_released_at)
select i.url, i.label, :'run', a.category_code, a.released_at
from pg_temp.incoming i
left join public.article a on a.url = i.url
on conflict (url) do update
    set label = excluded.label, labeled_at = now();
