-- AI 기반 분석 SQLite 적재 ① — 검사 → 시험 기사 지우기 → 넣기 → 사건 기사 공개 (Jira S15P31A102-152)
-- 순서 · 명령은 infra/server/data-load.md 9절 「AI 결과가 SQLite 로 올 때」. 이 파일 앞에 classified_to_load.py 가 만든 묶음이
-- 와서 load 스키마를 채우고, 뒤에 category-labels-apply.sql → classified-load-finish.sql 이 온다. 모두 한 트랜잭션(begin … commit)
-- 안에서 돈다 — 묶음 첫 줄과 이 파일 첫 문장이 트랜잭션 밖이면 바로 멈춘다(임시 표가 on commit drop 이라 밖에서는 못 돈다)
-- 표 이름에 스키마를 모두 붙인다. 하나라도 걸리면 예외로 통째로 되돌아간다

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(data-load.md 9절)';
    end if;
end
$$;

-- 0. 판 · 이전 적재 기록
do $$
begin
    if (select max(version::int) from public.flyway_schema_history where success and version is not null) <> 13 then
        raise exception '운영 판이 13 이 아니다 — 이 적재 SQL 은 V13 표 모양 기준이다';
    end if;
    if to_regnamespace('load_undo') is not null then
        raise exception '이전 적재 기록(load_undo)이 남아 있다 — 되돌리기(classified-undo.sql)부터';
    end if;
end
$$;

create schema load_undo;
create table load_undo.info (
    loaded_at     timestamptz not null,
    source_sha256 text        not null,
    max_job_id    bigint
);
create table load_undo.new_article (id bigint primary key);                                         -- 적재가 새로 넣은 기사
create table load_undo.released (id bigint primary key);                                            -- 적재가 공개한 기사(전에는 비어 있었다)
create table load_undo.unreleased (id bigint primary key, old_released_at timestamptz not null);    -- 적재가 내린 기사
insert into load_undo.info (loaded_at, source_sha256)
select now(), value from load.meta where key = 'source_sha256';

-- 1. 묶음이 다 왔는지 · 묶음 안 참조
do $$
declare
    listed record;  -- 아래 SQL 의 별칭(m · l · e)과 겹치지 않는 이름
    actual bigint;
begin
    for listed in select key, value::bigint as expected from load.meta
                  where key in ('issue', 'event', 'article_event', 'article_mindmap', 'article_src', 'article_embedding') loop
        if to_regclass('load.' || listed.key) is null then
            actual := 0;
        else
            execute format('select count(*) from load.%I', listed.key) into actual;
        end if;
        if actual <> listed.expected then
            raise exception '묶음 % 건수 % ≠ 목록 % — 묶음이 끊겼다', listed.key, actual, listed.expected;
        end if;
    end loop;
    if exists (select 1 from load.event where role not in ('MAIN', 'REACTION')
               or occurred_at_basis not in ('EXTRACTED', 'FIRST_PUBLISHED')) then
        raise exception '사건 역할 · 발생 시점 근거가 다르다';
    end if;
    if exists (select 1 from load.event e where e.issue_id is not null and not exists (select 1 from load.issue i where i.id = e.issue_id))
       or exists (select 1 from load.event e where e.reacts_to_event_id is not null
                  and not exists (select 1 from load.event t where t.id = e.reacts_to_event_id))
       or exists (select 1 from load.article_event l where not exists (select 1 from load.event e where e.id = l.event_id))
       or exists (select 1 from load.event e where not exists (select 1 from load.article_event l where l.event_id = e.id))
       or exists (select 1 from load.article_mindmap m where not exists (select 1 from load.article_event l where l.url = m.url))
       or exists (select 1 from load.article_event l where not exists (select 1 from load.article_src s where s.url = l.url)) then
        raise exception '묶음 안에 가리키는 곳이 없는 행이 있다';
    end if;
    if to_regclass('load.article_embedding') is not null then
        execute 'select count(*) from load.article_embedding e where not exists (select 1 from load.article_event l where l.url = e.url)'
            into actual;
        if actual > 0 then
            raise exception '사건에 묶이지 않은 기사의 임베딩 % 건', actual;
        end if;
    end if;
end
$$;

-- 2. 시험 기사 1 ~ 3(2026-11-02 시험 기사 SQL)과 딸린 행 — 북마크는 같이 지워지고 되돌릴 수 없다(백업에만)
create temp table test_article on commit drop as
select id, url
from public.article
where url in ('https://www.yonhapnewstv.co.kr/news/AKR20261026084006Xm4',
              'https://www.newsis.com/view/NISX20261026_0003840392',
              'https://www.mbn.co.kr/pages/news/newsView.php?category=mbn00009&news_seq_no=5226463');

select count(*) as 지울_시험_기사,
       (select count(*) from public.bookmark b where b.article_id in (select id from pg_temp.test_article)) as 같이_지워질_북마크
from pg_temp.test_article;

delete from public.analysis_job where article_id in (select id from pg_temp.test_article);
delete from public.article_mindmap where article_id in (select id from pg_temp.test_article);
delete from public.article_embedding where article_id in (select id from pg_temp.test_article);
delete from public.article_event where article_id in (select id from pg_temp.test_article);
delete from public.article where id in (select id from pg_temp.test_article);

-- 3. 운영 분석 표 일곱이 비었는지 — 덤프를 넣기 전 상태가 이것이다(data-load.md 1절 「B1 을 걸지 않는다」)
do $$
begin
    if exists (select 1 from public.article_mindmap) or exists (select 1 from public.article_embedding)
       or exists (select 1 from public.analysis_job) or exists (select 1 from public.event)
       or exists (select 1 from public.article_event) or exists (select 1 from public.issue)
       or exists (select 1 from public.issue_category) then
        raise exception '운영 분석 표가 비어 있지 않다 — 누가 B1 을 걸었거나 앞 적재가 남았다';
    end if;
end
$$;

-- 4. URL 로 운영 기사 맞추기
create temp table src_map on commit drop as
select s.*, a.id as article_id, a.published_at as ops_published_at, md5(a.body) as ops_body_md5
from load.article_src s
left join public.article a on a.url = s.url;

do $$
begin
    if exists (select 1 from pg_temp.src_map where article_id is not null
               and (ops_published_at <> published_at or ops_body_md5 <> body_md5)) then
        raise exception '운영과 맞춘 기사 중 발행 시각 · 본문이 다른 기사가 있다(근거 문단 번호가 어긋난다)';
    end if;
    if exists (select 1 from pg_temp.src_map where article_id is null and (body is null or md5(body) <> body_md5)) then
        raise exception '운영에 없는 기사의 본문이 묶음에 없거나 md5 가 다르다 — 운영 URL 목록이 낡았다(다시 적재 때는 적재가 넣은 기사를 뺀 목록)';
    end if;
    if exists (select 1 from pg_temp.src_map where article_id is null and btrim(body) = '') then
        raise exception '운영에 없는 기사의 본문이 비었다 — B2 는 이런 기사를 받지 않는다';
    end if;
    -- 제목 HTML 조각 — 운영 제목은 B2 · V13 이 고친 값이다. 새 기사가 조각을 달고 오면 멈춰서 고친다(낱말 중간은 안 봄)
    if exists (select 1 from pg_temp.src_map where article_id is null
               and title ~ '(^|[^A-Za-z])(quot|hellip|middot|lsquo|rsquo|ldquo|rdquo|rarr|uarr|ndash|lt|gt|amp);') then
        raise exception '운영에 없는 기사 제목에 HTML 조각이 있다';
    end if;
    -- 잘못된 본문 — 새 기사 본문이 운영에서 X(잘못된 본문)로 숨긴 다른 기사와 같은데 새 기사에 X 라벨이 없으면 멈춘다
    -- (2026-11-10 뉴스핌 20261106001304 가 실제로 이랬다. 그 기사도 X 로 라벨을 넣는다, category-labels.md 1절)
    if exists (select 1 from pg_temp.src_map s
               join public.article o on o.url <> s.url and md5(o.body) = s.body_md5
               join category_label.article_label lo on lo.url = o.url and lo.label = 'X'
               where s.article_id is null
                 and not exists (select 1 from category_label.article_label ls where ls.url = s.url and ls.label = 'X')) then
        raise exception '운영에 없는 기사 본문이 잘못된 본문(X) 기사와 같다 — 그 기사도 X 로 라벨을 넣는다';
    end if;
end
$$;

-- 알림: 운영의 다른 기사와 본문이 같은 새 기사(같은 기사를 URL 만 바꿔 다시 낸 것일 수 있다)
select s.url as 본문이_같은_새_기사, o.url as 운영_기사, o.released_at is not null as 운영_공개,
       (select label from category_label.article_label l where l.url = o.url) as 운영_라벨
from pg_temp.src_map s
join public.article o on o.url <> s.url and md5(o.body) = s.body_md5
where s.article_id is null;

select count(*) filter (where article_id is not null) as 운영과_맞춘_기사,
       count(*) filter (where article_id is null)     as 새로_넣을_기사
from pg_temp.src_map;

-- 5. 새 기사 — 언론사는 B2 처럼 대응 표로. 처음 보는 언론사는 source_id 를 코드로 등록
insert into public.press (code, name)
select distinct on (s.publisher_code) s.publisher_code, s.source_name
from pg_temp.src_map s
where s.article_id is null
  and not exists (select 1 from public.press_mapping m where m.source = 'NEWSDATA' and m.source_value = s.publisher_code)
order by s.publisher_code
on conflict (code) do nothing;

insert into public.press_mapping (source, source_value, press_code)
select distinct 'NEWSDATA', s.publisher_code, s.publisher_code
from pg_temp.src_map s
where s.article_id is null
on conflict (source, source_value) do nothing;

with inserted as (
    insert into public.article (source, url, press_code, title, body, published_at, category_code, source_categories, created_at)
    select 'NEWSDATA', s.url, m.press_code, s.title, s.body, s.published_at, s.category_code, s.source_categories, now()
    from pg_temp.src_map s
    join public.press_mapping m on m.source = 'NEWSDATA' and m.source_value = s.publisher_code
    where s.article_id is null
    returning id
)
insert into load_undo.new_article (id) select id from inserted;

update pg_temp.src_map s set article_id = a.id
from public.article a
where s.article_id is null and a.url = s.url;

do $$
begin
    if exists (select 1 from pg_temp.src_map where article_id is null) then
        raise exception '운영 번호를 못 받은 기사가 있다';
    end if;
end
$$;

-- 6. 이슈 · 사건 — 번호 그대로. 자기 참조(반응 대상)는 한 INSERT … SELECT 안이라 문장 끝에 검사된다
insert into public.issue (id, title, summary, created_at, updated_at)
select id, title, summary, created_at, updated_at from load.issue;

insert into public.event (id, issue_id, title, label, summary, occurred_at, occurred_at_basis, created_at, updated_at,
                          role, reacts_to, reacts_to_event_id)
select id, issue_id, title, label, summary, occurred_at, occurred_at_basis, created_at, updated_at,
       role, reacts_to, reacts_to_event_id
from load.event;

-- 7. 기사-사건 · 마인드맵 · 임베딩(있을 때만) — 기사 번호는 URL 로 바꾼 운영 번호
insert into public.article_event (article_id, event_id, linked_at)
select s.article_id, l.event_id, l.linked_at
from load.article_event l
join pg_temp.src_map s on s.url = l.url;

insert into public.article_mindmap (article_id, summary, content, occurred_at, schema_version, model, prompt_version,
                                    generated_at, primary_core_index)
select s.article_id, m.summary, m.content, m.occurred_at, m.schema_version, m.model, m.prompt_version,
       m.generated_at, m.primary_core_index
from load.article_mindmap m
join pg_temp.src_map s on s.url = m.url;

do $$
begin
    if to_regclass('load.article_embedding') is not null then
        execute 'insert into public.article_embedding (article_id, model, embedding, created_at)
                 select s.article_id, e.model, e.embedding, now()
                 from load.article_embedding e
                 join pg_temp.src_map s on s.url = e.url';
    end if;
end
$$;

-- 8. 작업 행 — 모두 SUCCEEDED · BATCH · 시도 1, 번호는 identity 기본값(지운 시험 작업 번호와 안 겹침)
--    published_at 을 채워 「큐에 못 넣은 작업」으로 읽히지 않게. 후보 · 결과는 비운다. ISSUE 는 만들지 않는다
insert into public.analysis_job (article_id, stage, status, requested_by, attempt, created_at, started_at, finished_at,
                                 queued_at, published_at)
select s.article_id, 'EXTRACT', 'SUCCEEDED', 'BATCH', 1,
       m.generated_at, m.generated_at, m.generated_at, m.generated_at, m.generated_at
from load.article_mindmap m
join pg_temp.src_map s on s.url = m.url;

insert into public.analysis_job (article_id, stage, status, requested_by, attempt, created_at, started_at, finished_at,
                                 queued_at, published_at)
select e.article_id, 'EMBED', 'SUCCEEDED', 'BATCH', 1, now(), now(), now(), now(), now()
from public.article_embedding e;

insert into public.analysis_job (article_id, stage, status, requested_by, attempt, created_at, started_at, finished_at,
                                 queued_at, published_at)
select s.article_id, 'MATCH_EVENT', 'SUCCEEDED', 'BATCH', 1,
       l.linked_at, l.linked_at, l.linked_at, l.linked_at, l.linked_at
from load.article_event l
join pg_temp.src_map s on s.url = l.url;

-- 9. 사건 기사 공개(2026-11-10 사용자 ① — 마인드맵이 없어도). 이미 공개된 기사는 그대로 둔다
--    공개 시각은 마인드맵 저장 시각, 마인드맵이 없으면 적재 시각
with released as (
    update public.article a
    set released_at = coalesce(m.generated_at, now())
    from pg_temp.src_map s
    left join load.article_mindmap m on m.url = s.url
    where a.id = s.article_id
      and a.released_at is null
    returning a.id
)
insert into load_undo.released (id) select id from released;
