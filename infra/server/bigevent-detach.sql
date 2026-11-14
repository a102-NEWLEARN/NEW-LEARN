-- 큰 사건에서 「그 사건이 아니다」로 판정된 기사 떼기 ① — 표를 만들고 쌍 목록을 받는다
-- (Jira S15P31A102-206, F06 동일 사건 기사 클러스터링. 쓰는 법은 infra/server/bigevent-detach.md)
-- psql 변수: expected(쌍 목록 줄 수), run(이번 실행 이름)
--
-- 마지막 문장이 COPY 다 — 이 파일 뒤에 쌍 목록과 `\.` 을 이어 붙이고,
-- 그다음 bigevent-detach-apply.sql 을 붙인다 (category-labels-load.sql 과 같은 모양).
\set ON_ERROR_STOP on

select set_config('bigevent.expected', :'expected', true);
select set_config('bigevent.run', :'run', true);

-- 되돌리기 표. 실행 이름으로 묶는다. linked_at 까지 남겨야 제자리로 돌릴 수 있다
create table if not exists fix_bigevent_detached (
    run         text        not null,
    article_id  bigint      not null,
    event_id    bigint      not null,
    linked_at   timestamptz,
    verdict     text        not null,
    detached_at timestamptz not null default now(),
    primary key (run, article_id, event_id)
);

create temp table detach_in (
    event_id   bigint not null,
    article_id bigint not null,
    verdict    text   not null
) on commit drop;

copy detach_in (event_id, article_id, verdict) from stdin;
