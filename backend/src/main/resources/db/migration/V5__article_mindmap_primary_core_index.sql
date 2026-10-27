-- 기사의 대표 사건 (Jira 56, docs/data-model.md article_mindmap, docs/api-internal.md 5절 EXTRACT)
-- primary_core_index : content 의 CORE 가지 잎 중 몇 번째인가(0부터). 비어 있으면 특정 사건이 없는 기사라
--                      동일 사건 판정을 걸지 않고 A8 eventMatchStatus 는 NO_EVENT 다
alter table article_mindmap
    add column primary_core_index int check (primary_core_index >= 0);
