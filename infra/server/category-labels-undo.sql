-- 분야 라벨 되돌리기 — 그 실행이 처음 넣은 기사를 옛 값으로 돌리고 라벨 행을 지운다 (Jira S15P31A102-177, infra/server/category-labels.md)
-- psql 변수: run. 트랜잭션은 부르는 쪽이 건다. 덤프 적재 뒤에는 data-load.md 7절을 먼저 한다 — 그 순서는 category-labels.md
update public.article a
set category_code = l.old_category_code,
    released_at   = l.old_released_at
from category_label.article_label l
where l.url = a.url
  and l.run = :'run';

delete from category_label.article_label
where run = :'run';

select count(*) as 남은_라벨 from category_label.article_label;
