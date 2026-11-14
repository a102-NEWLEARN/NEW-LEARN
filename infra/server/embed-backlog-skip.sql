-- 밀린 EMBED 작업 건너뛰기 — 실시간 연결을 켤 때 (Jira S15P31A102-207)
-- 한 트랜잭션 안에서 돌린다: begin; \i embed-backlog-skip.sql commit;
--
-- 왜: 판정(MATCH_EVENT)은 **한 번에 한 건씩만** 돈다(같은 사건 기사 둘이 같이 판정되면 사건이 둘로 갈라진다,
-- `MatchDispatcher`). 운영 GMS 한 번이 가운데 14초라 시간당 240건 남짓인데 새 기사는 시간당 200건 들어온다.
-- 밀린 것을 먼저 집으면(발행이 이른 순서) 가장 새 기사가 가장 늦게 붙는다 — 그래서 켜는 시각까지 밀린 몫은 건너뛴다.
--
-- 무엇을: 지금 `QUEUED` 인 EMBED 작업을 `FAILED` · `error_code=BACKLOG_SKIPPED` 로 끝낸다. 벡터가 안 생기므로
-- 그 기사는 판정에도 걸리지 않는다(`AnalysisJobRepository.findNextMatchArticle` 이 EMBED 성공과 벡터 행을 본다).
-- 마인드맵과 공개는 그대로다 — 화면에서 기사는 보이고 사건 · 이슈에만 안 붙는다.
--
-- 이 뒤에 Redis `embed` 그룹을 스트림 끝으로 옮겨야 워커가 옛 메시지를 읽지 않는다(data-load.md 11절).

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(data-load.md 11절)';
    end if;
    if to_regnamespace('embed_load') is null then
        raise exception '벡터 적재 기록(embed_load)이 없다 — 벡터를 먼저 넣는다(data-load.md 10절)';
    end if;
end
$$;

create table if not exists embed_load.skipped (
    job_id     bigint primary key,
    article_id bigint      not null,
    queued_at  timestamptz not null,
    skipped_at timestamptz not null default now()
);

with picked as (
    select id, article_id, queued_at
    from public.analysis_job
    where stage = 'EMBED' and status = 'QUEUED'
),
saved as (
    insert into embed_load.skipped (job_id, article_id, queued_at)
    select id, article_id, queued_at from picked
    on conflict (job_id) do nothing
    returning job_id
)
update public.analysis_job j
set status        = 'FAILED',
    error_code    = 'BACKLOG_SKIPPED',
    error_message = '실시간 연결을 켤 때 밀려 있던 기사 — 사건에 붙이지 않는다 (Jira S15P31A102-207)',
    retry_at      = null,
    started_at    = coalesce(j.started_at, now()),
    finished_at   = now()
where j.id in (select job_id from saved);

do $$
declare
    left_over bigint;
    skipped   bigint;
begin
    select count(*) into left_over from public.analysis_job where stage = 'EMBED' and status = 'QUEUED';
    if left_over > 0 then
        raise exception '건너뛰지 못한 EMBED 대기가 % 건 남았다', left_over;
    end if;
    select count(*) into skipped from embed_load.skipped;
    raise notice '건너뛴 EMBED 작업 % 건', skipped;
end
$$;

select (select count(*) from embed_load.skipped)                                                as "건너뛴 작업",
       (select count(*) from public.analysis_job where stage = 'EMBED' and status = 'QUEUED')   as "남은 EMBED 대기",
       (select count(*) from public.analysis_job
         where stage = 'EMBED' and error_code = 'BACKLOG_SKIPPED')                              as "BACKLOG_SKIPPED",
       (select min(queued_at) from embed_load.skipped)                                          as "가장 오래 기다린 것",
       (select max(queued_at) from embed_load.skipped)                                          as "가장 늦게 들어온 것";
