-- 실시간 연결을 켜기 전으로 사건 · 이슈를 되돌린다 (Jira S15P31A102-207)
-- 한 트랜잭션 안에서 돌린다: begin; \i realtime-restore.sql commit;
--
-- 🔴 **먼저 세 플래그를 false 로 되돌리고 ai Pod 가 바뀐 뒤에** 돌린다. 워커가 도는 중에 지우면 다시 생긴다.
-- 기사 · 마인드맵 · 공개 여부는 건드리지 않는다 — 켠 뒤 들어온 기사는 화면에 그대로 남고 사건에만 안 붙는다.
-- 분석 작업 행(MATCH_EVENT · ISSUE)도 지우지 않는다. 지우면 그 기사가 다시 판정 줄에 선다.

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다';
    end if;
    if to_regnamespace('rt_before') is null then
        raise exception '스냅숏(rt_before)이 없다 — 되돌릴 기준이 없다';
    end if;
end
$$;

-- 1. 켠 뒤 생긴 기사-사건 연결을 지운다
delete from public.article_event l
where not exists (select 1 from rt_before.article_event b
                   where b.article_id = l.article_id and b.event_id = l.event_id);

-- 2. 켠 뒤 생긴 사건 · 이슈를 지운다 (순서: 분야 → 사건 → 이슈)
delete from public.issue_category c
where not exists (select 1 from rt_before.issue b where b.id = c.issue_id);

delete from public.event e
where not exists (select 1 from rt_before.event b where b.id = e.id);

delete from public.issue i
where not exists (select 1 from rt_before.issue b where b.id = i.id);

-- 3. 남은 사건 · 이슈를 켜기 전 값으로 (ATTACH 가 요약 · 시점 · 흐름을 바꿨다)
update public.issue i
set title = b.title, summary = b.summary, updated_at = b.updated_at
from rt_before.issue b
where i.id = b.id and (i.title is distinct from b.title or i.summary is distinct from b.summary);

update public.event e
set issue_id = b.issue_id, title = b.title, label = b.label, summary = b.summary,
    occurred_at = b.occurred_at, occurred_at_basis = b.occurred_at_basis,
    role = b.role, reacts_to = b.reacts_to, reacts_to_event_id = b.reacts_to_event_id,
    updated_at = b.updated_at
from rt_before.event b
where e.id = b.id;

-- 4. 이슈 분야를 켜기 전으로
delete from public.issue_category c
where not exists (select 1 from rt_before.issue_category b
                   where b.issue_id = c.issue_id and b.category_code = c.category_code);
insert into public.issue_category (issue_id, category_code)
select b.issue_id, b.category_code from rt_before.issue_category b
on conflict do nothing;

-- 5. 켜기 전과 같은지
do $$
declare
    diff bigint;
begin
    select count(*) into diff from (
        (select id, issue_id, occurred_at, occurred_at_basis from public.event
         except select id, issue_id, occurred_at, occurred_at_basis from rt_before.event)
        union all
        (select id, issue_id, occurred_at, occurred_at_basis from rt_before.event
         except select id, issue_id, occurred_at, occurred_at_basis from public.event)) t;
    if diff > 0 then
        raise exception '사건이 스냅숏과 % 줄 다르다', diff;
    end if;
    select count(*) into diff from (
        (select id, title, summary from public.issue except select id, title, summary from rt_before.issue)
        union all
        (select id, title, summary from rt_before.issue except select id, title, summary from public.issue)) t;
    if diff > 0 then
        raise exception '이슈가 스냅숏과 % 줄 다르다', diff;
    end if;
end
$$;

select (select count(*) from public.issue)         as "이슈",
       (select count(*) from public.event)         as "사건",
       (select count(*) from public.article_event) as "기사-사건",
       (select at from rt_before.taken_at)         as "스냅숏 뜬 때";
