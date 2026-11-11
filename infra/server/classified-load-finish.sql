-- AI 기반 분석 SQLite 적재 ② — 라벨 적용(category-labels-apply.sql) 뒤에 부른다 (Jira S15P31A102-152)
-- 사건 없는 공개 기사 내리기 → 시퀀스 → 단언 → 되돌리기 기록 마무리 → load 스키마 지움. 같은 트랜잭션 안
-- pg_temp.label_code 는 라벨 적용 파일이 만든 임시 표다(on commit drop)

-- 10. 마인드맵 없는 공개 기사 내리기(2026-11-10 사용자 — 사건에 묶였어도 마인드맵이 없으면 숨긴다, SSOT.md 9절)
--     10/21 ~ 11/3 임시 공개분 중 마인드맵이 안 온 기사가 여기서 내려간다
insert into load_undo.unreleased (id, old_released_at)
select a.id, a.released_at
from public.article a
where a.released_at is not null
  and not exists (select 1 from public.article_mindmap m where m.article_id = a.id);

update public.article a
set released_at = null
from load_undo.unreleased u
where a.id = u.id;

-- 11. 사건 · 이슈 시퀀스 — 번호를 그대로 넣었으니 다음 번호가 겹치지 않게. 작업은 identity 기본값으로 넣어 그대로 둔다
select setval(pg_get_serial_sequence('public.event', 'id'), (select max(id) from public.event)) as 사건_시퀀스,
       setval(pg_get_serial_sequence('public.issue', 'id'), (select max(id) from public.issue)) as 이슈_시퀀스;

-- 12. 단언 — 하나라도 걸리면 통째로 되돌아간다. 기대값은 상수가 아니라 넣은 표로 센다
do $$
declare
    mapped        bigint := (select count(*) from public.article_mindmap);
    hidden_mapped bigint := (select count(*) from public.article_mindmap m
                             join public.article a on a.id = m.article_id
                             join category_label.article_label x on x.url = a.url
                             join pg_temp.label_code c on c.label = x.label
                             where c.hidden);
    released      bigint := (select count(*) from public.article where released_at is not null);
begin
    if released <> mapped - hidden_mapped then
        raise exception '공개 기사 % ≠ 마인드맵 기사 % − 숨김 라벨 %', released, mapped, hidden_mapped;
    end if;
    if exists (select 1 from public.article a
               where a.released_at is not null
                 and not exists (select 1 from public.article_mindmap m where m.article_id = a.id)) then
        raise exception '마인드맵 없는 공개 기사가 있다';
    end if;
    if exists (select 1 from public.article_event l
               join public.article a on a.id = l.article_id
               where not exists (select 1 from category_label.article_label x where x.url = a.url)) then
        raise exception '라벨 없는 사건 기사가 있다 — 라벨부터 넣는다(category-labels.md)';
    end if;
    if exists (select 1 from public.article_mindmap m where not exists (
                   select 1 from public.analysis_job j where j.article_id = m.article_id and j.stage = 'EXTRACT' and j.status = 'SUCCEEDED'))
       or exists (select 1 from public.article_event l where not exists (
                   select 1 from public.analysis_job j where j.article_id = l.article_id and j.stage = 'MATCH_EVENT' and j.status = 'SUCCEEDED'))
       or exists (select 1 from public.article_embedding e where not exists (
                   select 1 from public.analysis_job j where j.article_id = e.article_id and j.stage = 'EMBED' and j.status = 'SUCCEEDED')) then
        raise exception '결과 행에 맞는 SUCCEEDED 작업 행이 없다';
    end if;
    if exists (select 1 from public.analysis_job where status = 'QUEUED' or (status = 'FAILED' and retry_at is not null)) then
        raise exception '큐에 들어가거나 다시 걸릴 작업 행이 있다';
    end if;
    -- 판정 걸 기사 0 — AnalysisJobRepository.findNextMatchArticle 조건 그대로
    if exists (
        select 1 from public.article a
        join public.article_mindmap m on m.article_id = a.id and m.primary_core_index is not null
        join public.article_embedding e on e.article_id = a.id
        where exists (select 1 from public.analysis_job j where j.article_id = a.id and j.stage = 'EXTRACT' and j.status = 'SUCCEEDED')
          and exists (select 1 from public.analysis_job j where j.article_id = a.id and j.stage = 'EMBED' and j.status = 'SUCCEEDED')
          and not exists (select 1 from public.analysis_job j where j.article_id = a.id and j.stage = 'MATCH_EVENT')
          and not exists (select 1 from public.article_event l where l.article_id = a.id)) then
        raise exception '운영 스케줄러가 판정을 걸 기사가 있다';
    end if;
end
$$;

-- 13. 되돌리기 기록 마무리 — 적재 뒤 생긴 작업을 되돌리기가 알아보게 마지막 작업 번호를 남긴다
update load_undo.info set max_job_id = (select max(id) from public.analysis_job);

-- 알림: 분야가 빈 공개 기사, 넣은 수
select count(*) filter (where category_code is null) as 분야_빈_공개_기사,
       count(*)                                     as 공개_기사
from public.article
where released_at is not null;

select (select count(*) from public.issue)               as 이슈,
       (select count(*) from public.event)               as 사건,
       (select count(*) from public.article_event)       as 기사_사건,
       (select count(*) from public.article_mindmap)     as 마인드맵,
       (select count(*) from public.article_embedding)   as 임베딩,
       (select count(*) from public.analysis_job)        as 작업,
       (select count(*) from load_undo.new_article)      as 새_기사,
       (select count(*) from load_undo.released)         as 공개한_기사,
       (select count(*) from load_undo.unreleased)       as 내린_기사;

drop schema load cascade;
