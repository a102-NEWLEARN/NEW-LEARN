-- 실시간 연결을 켜기 전 스냅숏 (Jira S15P31A102-207)
-- 한 트랜잭션 안에서 돌린다: begin; \i realtime-snapshot.sql commit;
--
-- 왜: 이슈 워커가 ATTACH 하면 **기존 이슈의 요약을 새 사건까지 넣어 다시 쓴다**. 사건의 시점(`occurred_at`)과
-- 이슈 분야도 바뀐다. 백업만으로 되돌리려면 DB 통째로 돌려야 해서 켠 뒤 들어온 기사까지 사라진다.
-- 이 네 표만 떠 두면 사건 · 이슈 쪽만 켜기 전으로 돌릴 수 있다(`realtime-restore.sql`).

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(ai-worker.md 「실시간 연결 켜기」)';
    end if;
    if to_regnamespace('rt_before') is not null then
        raise exception '이전 스냅숏(rt_before)이 남아 있다 — 되돌리기를 끝내고 스키마를 지운 뒤에 다시 뜬다';
    end if;
end
$$;

create schema rt_before;

create table rt_before.taken_at as select now() as at;

create table rt_before.issue as
    select id, title, summary, created_at, updated_at from public.issue;

create table rt_before.event as
    select id, issue_id, title, label, summary, occurred_at, occurred_at_basis,
           role, reacts_to, reacts_to_event_id, created_at, updated_at
    from public.event;

create table rt_before.article_event as
    select article_id, event_id, linked_at from public.article_event;

create table rt_before.issue_category as
    select issue_id, category_code from public.issue_category;

alter table rt_before.issue add primary key (id);
alter table rt_before.event add primary key (id);
alter table rt_before.article_event add primary key (article_id, event_id);

select (select at from rt_before.taken_at)              as "뜬 때",
       (select count(*) from rt_before.issue)           as "이슈",
       (select count(*) from rt_before.event)           as "사건",
       (select count(*) from rt_before.article_event)   as "기사-사건",
       (select count(*) from rt_before.issue_category)  as "이슈 분야",
       (select max(id) from rt_before.issue)            as "이슈 마지막 번호",
       (select max(id) from rt_before.event)            as "사건 마지막 번호";
