-- DB 통계 찍기 — 측정 앞뒤로 한 번씩 돌려 차이를 본다 (Jira S15P31A102-189). 돌리는 법은 README.md
-- 값은 DB 가 뜬 뒤 누적이다. 한 번 찍은 값만으로는 뜻이 없고, 두 번 사이의 차이가 그동안 일어난 일이다
\pset pager off
select now() as at;
\echo '== 표마다 통째 읽기 · 인덱스 읽기 (누적)'
select relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_live_tup
from pg_stat_user_tables
where relname in ('article', 'article_event', 'event', 'issue', 'issue_category')
order by relname;
\echo '== 표마다 디스크 블록 · 메모리 블록 (누적, 8KB)'
select relname, heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit
from pg_statio_user_tables
where relname in ('article', 'article_event', 'event', 'issue', 'issue_category')
order by relname;
-- 표를 읽는 쿼리(count 등)는 두지 않는다 — 두면 두 번 찍은 차이에 이 파일이 읽은 몫이 더해진다. 행 수는 explain.sql 첫머리
\echo '== 기사 표 · 인덱스 크기'
select pg_size_pretty(pg_table_size('article')) as table_size, relpages from pg_class where relname = 'article';
select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) as size, idx_scan
from pg_stat_user_indexes where relname = 'article' order by indexrelname;
\echo '== 사건 · 이슈 쪽 인덱스 읽기 (누적, Jira 194 — V15 뒤 article_event_event_id_idx · event_issue_id_idx 가 bench 동안 늘어야 앱이 쓰는 것)'
select relname, indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) as size, idx_scan, idx_tup_read
from pg_stat_user_indexes where relname in ('article_event', 'event', 'issue', 'issue_category') order by relname, indexrelname;
\echo '== VACUUM 상태 — 공개 기사 인덱스만 읽기가 표를 다시 보러 가는 몫(Heap Fetches)이 여기서 갈린다. relallvisible 은 마지막 VACUUM · ANALYZE 때 값'
select c.relname, c.relpages, c.relallvisible, s.n_live_tup, s.n_dead_tup, s.n_ins_since_vacuum, s.n_mod_since_analyze,
       s.last_vacuum, s.last_autovacuum, s.autovacuum_count, s.total_autovacuum_time, s.last_analyze, s.last_autoanalyze
from pg_class c join pg_stat_user_tables s on s.relid = c.oid
where c.relname in ('article', 'article_event', 'event') order by c.relname;
\echo '== 기사 표 자동 VACUUM 기준(V15 뒤 다섯) · 오래 열린 트랜잭션 — 있으면 VACUUM 이 돌아도 페이지를 다 보임으로 못 바꾼다'
select coalesce(array_to_string(reloptions, ', '), '(없음 — 기본값)') as article_reloptions from pg_class where oid = 'article'::regclass;
select pid, state, now() - xact_start as xact_age, backend_xmin from pg_stat_activity
where backend_xmin is not null and pid <> pg_backend_pid() order by xact_start nulls last limit 5;
