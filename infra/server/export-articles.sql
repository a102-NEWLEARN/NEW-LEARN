-- 운영 기사 목록 JSONL — AI 결과를 만드는 쪽에 넘긴다(infra/server/data-load.md 2절)
-- 한 줄이 기사 하나: id(운영 번호)를 뺀 나머지가 그대로 B2 기사 적재 요청 본문이다(docs/api-internal.md 2절)
-- 날짜는 발행 시각의 KST 날짜(psql -v from=YYYY-MM-DD -v to=YYYY-MM-DD, 둘 다 포함). 넣기만(공개 전) 수집 기사만
-- -v all=1 을 주면 공개 여부와 상관없이 그 날짜의 수집 기사 전부(AI 팀장 매일 검증용, 2026-11-10 Jira 156). 줄 모양은 같다
-- 돌리는 법(서버에서 돌리고 scp 로 받기)은 data-load.md 2절
-- COPY 가 아니라 select 로 뽑는다 — COPY 텍스트 형식은 JSON 안 역슬래시를 두 번 써 줄이 깨진다
\set ON_ERROR_STOP on
\if :{?all}
\else
\set all 0
\endif
select json_build_object(
    'id', a.id,
    'url', a.url,
    'pressSourceId', a.press_code,
    'pressName', p.name,
    'title', a.title,
    'reporter', a.reporter,
    'body', a.body,
    'publishedAt', to_char(a.published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'sourceCategories', a.source_categories,
    'sourceTags', a.source_tags)
from article a
join press p on p.code = a.press_code
where a.source = 'NEWSDATA'
  and (:'all' = '1' or a.released_at is null)
  and a.published_at >= (:'from'::date)::timestamp at time zone 'Asia/Seoul'
  and a.published_at < (:'to'::date + 1)::timestamp at time zone 'Asia/Seoul'
order by a.published_at, a.id;
