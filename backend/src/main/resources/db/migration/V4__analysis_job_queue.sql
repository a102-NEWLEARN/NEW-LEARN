-- 분석 작업 큐 (Jira 30, docs/api-internal.md 3 · 5절, docs/data-model.md 2절 analysis_job)
-- result       : MATCH_EVENT · ISSUE 판정 기록 { reason, model, promptVersion }. 35 · 40 이 쓴다
-- queued_at    : 이번 시도가 QUEUED 가 된 때 — 처음 만들 때와 다시 걸 때. 큐에 못 넣은 작업을 찾는 기준
-- published_at : 이번 시도를 큐(Redis Streams)에 넣은 때. 비어 있으면 아직 못 넣었다 — 스케줄러가 다시 넣는다
alter table analysis_job
    add column result       jsonb,
    add column queued_at    timestamptz not null default now(),
    add column published_at timestamptz;
