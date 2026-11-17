-- 라벨 없는 공개 기사 목록 JSONL — 분야 라벨을 만들 입력이다(infra/server/category-labels.md 3절)
-- 공개 기사만 읽는다. 공개 안 될 기사는 라벨이 필요 없다
-- COPY 가 아니라 select 로 뽑는다 — COPY 텍스트 형식은 JSON 안 역슬래시를 두 번 써 줄이 깨진다
\set ON_ERROR_STOP on
select json_build_object('url', a.url, 'title', a.title)
from article a
where a.source = 'NEWSDATA'
  and a.released_at is not null
  and not exists (select 1 from category_label.article_label l where l.url = a.url)
order by a.published_at, a.id;
-- 표준 오류로 줄 수를 찍는다 — kubectl exec 출력이 끊기면 이 줄이 안 나오거나 wc -l 과 다르다
\warn 뽑은 줄: :ROW_COUNT
