-- AI 기반 분석 SQLite 적재 되돌리기 (Jira S15P31A102-152, infra/server/data-load.md 「AI 결과가 SQLite 로 올 때」)
-- 한 트랜잭션(begin … commit) 안에서, 뒤에 category-labels-apply.sql 을 붙여 부른다 — 다시 공개한 기사 중 그 사이 숨김 라벨이
-- 붙은 기사를 다시 숨긴다. 「되돌리고 다시 적재」는 이 파일 뒤에 묶음 · classified-load.sql · 라벨 적용 · 마무리를 잇는다
-- (라벨 적용은 한 트랜잭션에 한 번). 지우기는 DELETE 로 한다 — 관심 이슈는 DELETE 일 때만 같이 지워지고, TRUNCATE 는 강한
-- 잠금으로 조회를 멈춘다. 시험 기사 1 ~ 3 과 그 북마크, 적재가 넣은 언론사 · 대응 행, 사건 · 이슈 시퀀스는 되돌리지 않는다
-- (언론사 행은 가리키는 기사가 없어도 화면에 안 보이고, 시퀀스는 다음 번호가 겹치지 않기만 하면 된다)

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(data-load.md 9절)';
    end if;
end
$$;

do $$
begin
    if to_regclass('load_undo.info') is null then
        raise exception '되돌릴 적재 기록(load_undo)이 없다';
    end if;
    if (select count(*) from load_undo.info where max_job_id is not null) <> 1
       or (select count(*) from load_undo.info) <> 1 then
        raise exception '적재 기록이 온전하지 않다(마무리 전에 멈춘 적재) — 백업과 대조하고 손으로 정리한다';
    end if;
    if exists (select 1 from public.analysis_job where id > (select max_job_id from load_undo.info)) then
        raise exception '적재 뒤 분석 작업이 생겼다 — data-load.md 7절 「B1 을 켠 뒤라면」을 먼저 본다';
    end if;
    if exists (select 1 from public.article a
               where a.released_at > (select loaded_at from load_undo.info)
                 and not exists (select 1 from load_undo.released r where r.id = a.id)) then
        raise exception '적재 뒤 따로 공개된 기사가 있다 — 되돌리기가 모르는 공개다. 먼저 그 기사를 본다';
    end if;
end
$$;

-- 같이 지워질 회원 행
select (select count(*) from public.bookmark b where b.article_id in (select id from load_undo.new_article)) as 지워질_북마크,
       (select count(*) from public.interest_issue)                                                         as 지워질_관심_이슈;

-- 적재 전 분석 표 일곱은 비어 있었다(classified-load.sql 3번 단언)
delete from public.analysis_job;
delete from public.article_embedding;
delete from public.article_mindmap;
delete from public.article_event;
delete from public.event;
delete from public.issue_category;
delete from public.issue;

delete from public.article where id in (select id from load_undo.new_article);

update public.article a
set released_at = null
from load_undo.released r
where a.id = r.id;

update public.article a
set released_at = u.old_released_at
from load_undo.unreleased u
where a.id = u.id;

select (select count(*) from load_undo.new_article) as 지운_새_기사,
       (select count(*) from load_undo.released)    as 다시_내린_기사,
       (select count(*) from load_undo.unreleased)  as 다시_공개한_기사,
       (select count(*) from public.article where released_at is not null) as 공개_기사;

drop schema load_undo cascade;
