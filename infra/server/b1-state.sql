-- 자동 투입(B1) 세기 — 오늘 건 수 · EXTRACT 대기 · 가장 오래 기다린 시간 (Jira S15P31A102-156)
-- 읽기 전용. AI 팀장 제안 쿼리(2026-11-10, 운영과 같은 PostgreSQL 18.6 · V1 ~ V13 임시 DB 에서 경계 12가지 확인)의 세는 부분이다.
-- backend B3(GET /internal/v1/articles/release-candidates)가 같은 식으로 센다 — 게이트 · 매일 확인 때 B3 값과 대조한다.
-- 회차 몫 식은 수집 스크립트 한 곳에만 둔다(계획 docs/plans/2026-11-10-ingest-15min-auto-b1.md). 여기에 다시 적지 않는다
-- psql 변수: cutoff — 덤프 마감 다음 날(예 2026-11-12). 돌리는 법은 infra/server/data-load.md 2절과 같다(서버 셸에서 -v cutoff=…)
\set ON_ERROR_STOP on

with p as (
    select statement_timestamp() as as_of,
           (:'cutoff'::date)::timestamp at time zone 'Asia/Seoul' as cutoff_at,
           date_trunc('day', statement_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as day_start
), today as (
    -- 오늘(KST) 처음 만들어진 EXTRACT 작업 = 오늘 건 B1. 재시도는 같은 행이라 다시 세지 않는다.
    -- 적재 작업은 created_at 이 마인드맵 생성 시각이라(classified-load.sql 8번) 11/12 에 만든 것이 섞일 수 있어
    -- 기사 발행 시각이 cutoff 이후인 것만 센다
    select count(*) as released_today
    from analysis_job j
    join article a on a.id = j.article_id
    cross join p
    where j.stage = 'EXTRACT'
      and j.created_at >= p.day_start
      and a.published_at >= p.cutoff_at
), wait as (
    -- EXTRACT 만. EMBED 는 워커를 꺼 둬서 늘 쌓이니 보지 않는다. 처리 중(W1 전)도 QUEUED 다
    select count(*) filter (where status = 'QUEUED')                          as queued,
           count(*) filter (where status = 'FAILED' and retry_at is not null) as retry_pending,
           min(queued_at) filter (where status = 'QUEUED')                    as oldest_queued_at
    from analysis_job
    where stage = 'EXTRACT'
)
select t.released_today,
       w.queued,
       w.retry_pending,
       round(coalesce(extract(epoch from p.as_of - w.oldest_queued_at), 0) / 60, 1) as oldest_wait_min
from p, today t, wait w;
