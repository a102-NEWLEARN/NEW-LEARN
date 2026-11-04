-- NewsData 원본 분류 → 5개 분야 대응 행 (Jira S15P31A102-170, docs/data-model.md category_mapping)
--
-- 행은 NewsData 분류 18개 전부다. 기사의 원본 값 가운데 표에 없는 것이 하나라도 있으면 그 기사의 대표 분야가 통째로 빈다
-- (ArticleIngestService.category()) — 그래서 주제가 아닌 값(top · breaking · other)과 수집 배치가 거르는 다섯도
-- 분야를 비운 행으로 둔다. 분야가 빈 행은 대표를 고를 때 건너뛴다
--
-- priority 는 원본 값이 여럿일 때 대표를 고르는 순서다(작을수록 먼저). 구체적인 것 먼저 —
-- 국제 1 · IT·과학 2 · 정치 3 · 경제 4 · 사회 5 (2026-11-04 사용자 결정). 분야마다 값이 달라 동점이 생기지 않는다
insert into category_mapping (source, source_value, category_code, priority)
values ('NEWSDATA', 'world', 'world', 1),
       ('NEWSDATA', 'technology', 'it_science', 2),
       ('NEWSDATA', 'science', 'it_science', 2),
       ('NEWSDATA', 'politics', 'politics', 3),
       ('NEWSDATA', 'business', 'economy', 4),
       ('NEWSDATA', 'crime', 'society', 5),
       ('NEWSDATA', 'environment', 'society', 5),
       ('NEWSDATA', 'health', 'society', 5),
       ('NEWSDATA', 'education', 'society', 5),
       ('NEWSDATA', 'domestic', 'society', 5),
       ('NEWSDATA', 'top', null, 99),
       ('NEWSDATA', 'breaking', null, 99),
       ('NEWSDATA', 'other', null, 99),
       ('NEWSDATA', 'sports', null, 99),
       ('NEWSDATA', 'entertainment', null, 99),
       ('NEWSDATA', 'lifestyle', null, 99),
       ('NEWSDATA', 'food', null, 99),
       ('NEWSDATA', 'tourism', null, 99)
on conflict (source, source_value) do nothing;

-- 이미 들어온 NewsData 기사의 대표 분야를 B2 와 같은 규칙으로 채운다 — 대응 행이 없던 동안 넣은 기사(2026-11-04 운영 약 8만 건)
-- · 대표가 이미 찬 기사(덤프 · 시험이 넣은 값)는 덮지 않는다
-- · 원본 값이 하나라도 표에 없으면 비워 둔다(B2 와 같음)
-- · 계산값이 빈 기사(top 처럼 주제가 아닌 값만 붙은 기사, 원본 분류가 없는 기사)는 쓰지 않는다
update article a
set category_code = pick.category_code
from (select x.id,
             (select m.category_code
              from unnest(x.source_categories) as u(val)
                       join category_mapping m on m.source = 'NEWSDATA' and m.source_value = u.val
                       join category c on c.code = m.category_code
              order by m.priority, c.sort_order
              limit 1) as category_code
      from article x
      where x.source = 'NEWSDATA'
        and x.category_code is null
        and not exists (select 1
                        from unnest(x.source_categories) as u(val)
                        where not exists (select 1
                                          from category_mapping m
                                          where m.source = 'NEWSDATA'
                                            and m.source_value = u.val))) as pick
where a.id = pick.id
  and pick.category_code is not null;
