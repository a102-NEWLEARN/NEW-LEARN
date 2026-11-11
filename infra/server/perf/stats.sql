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
