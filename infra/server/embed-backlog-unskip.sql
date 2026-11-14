-- 건너뛴 EMBED 작업 되살리기 (Jira S15P31A102-207)
-- 한 트랜잭션 안에서 돌린다: begin; \i embed-backlog-unskip.sql commit;
--
-- `QUEUED` 로 되돌리고 큐에 넣었다는 표시를 지운다. 1분 뒤 백엔드 복구 스케줄러가 메시지를 다시 넣는다
-- (`AnalysisJobRecovery.publishUnpublished` — `QUEUED` 이고 `published_at` 이 빈 작업).
--
-- 🔴 되살리면 그 기사들이 발행이 이른 순서로 판정 줄 맨 앞에 선다. 새 기사는 그 뒤로 밀린다.
-- 판정이 시간당 약 240건이라 4,000건이면 하루가 넘는다.

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다';
    end if;
    if to_regclass('embed_load.skipped') is null then
        raise exception '건너뛴 기록(embed_load.skipped)이 없다 — 되살릴 것이 없다';
    end if;
end
$$;

update public.analysis_job j
set status        = 'QUEUED',
    error_code    = null,
    error_message = null,
    retry_at      = null,
    started_at    = null,
    finished_at   = null,
    published_at  = null
from embed_load.skipped s
where j.id = s.job_id and j.stage = 'EMBED' and j.error_code = 'BACKLOG_SKIPPED';

delete from embed_load.skipped;

select (select count(*) from public.analysis_job where stage = 'EMBED' and status = 'QUEUED') as "EMBED 대기",
       (select count(*) from embed_load.skipped)                                              as "남은 건너뛴 기록";
