-- 사건 · 이슈 묶기 정확도 평가 입력 JSONL — 이슈 · 사건 · 사건에 묶인 기사 (infra/server/eval/README.md 2절)
-- 읽기만 한다: 트랜잭션을 읽기 전용으로 열고 끝에 rollback
-- COPY 가 아니라 select 로 뽑는다 — COPY 텍스트 형식은 JSON 안 역슬래시를 두 번 써 줄이 깨진다(category-labels-export.sql 과 같음)
-- 한 줄이 JSON 하나다. kind 로 이슈 · 사건 · 기사를 가른다. 기사 글은 제목과 본문 앞부분(lead)만
\set ON_ERROR_STOP on
begin transaction read only;

select json_build_object(
           'kind', 'issue', 'id', i.id, 'title', i.title, 'summary', i.summary,
           'categories', (select coalesce(json_agg(ic.category_code order by ic.category_code), '[]'::json)
                          from issue_category ic
                          where ic.issue_id = i.id))
from issue i
order by i.id;
\warn 이슈: :ROW_COUNT

-- 공개 기사 수 · 언론사 수는 사건 쪽에 싣는다 — 기사마다 press_code 를 싣는 것보다 파일이 작다.
-- 화면에 보이는 몫만 채점하는 문턱(clustering_eval.py metrics --min-articles · --min-publishers)이 이 두 수를 쓴다.
select json_build_object(
           'kind', 'event', 'id', e.id, 'issue_id', e.issue_id, 'title', e.title, 'label', e.label,
           'summary', e.summary, 'occurred_at', e.occurred_at, 'role', e.role,
           'reacts_to_event_id', e.reacts_to_event_id,
           'released_articles', c.articles, 'released_presses', c.presses)
from event e
         left join lateral (select count(*) as articles, count(distinct a.press_code) as presses
                            from article_event ae
                                      join article a on a.id = ae.article_id
                            where ae.event_id = e.id
                              and a.released_at is not null) c on true
order by e.id;
\warn 사건: :ROW_COUNT

select json_build_object(
           'kind', 'article', 'id', a.id, 'url', a.url, 'event_id', ae.event_id, 'title', a.title,
           'lead', left(regexp_replace(left(a.body, 600), '\s+', ' ', 'g'), 240),
           'published_at', a.published_at, 'category', a.category_code,
           'released', a.released_at is not null)
from article_event ae
         join article a on a.id = ae.article_id
order by ae.event_id, a.published_at, a.id;
\warn 기사: :ROW_COUNT

rollback;
