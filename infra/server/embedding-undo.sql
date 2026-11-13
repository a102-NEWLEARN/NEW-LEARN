-- 기사 벡터 적재 되돌리기 (Jira S15P31A102-207)
-- `embed_load.stage` 에 적힌 기사의 벡터만 지운다 — 켠 뒤 EMBED 워커가 만든 다른 기사의 벡터는 그대로 둔다.
-- 한 트랜잭션 안에서 돌린다: begin; \i embedding-undo.sql commit;
-- 🔴 벡터를 지우면 판정(MATCH_EVENT)이 후보 사건을 못 찾는다. 판정 · 이슈 워커를 먼저 끄고 지운다

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다';
    end if;
    if to_regclass('embed_load.stage') is null then
        raise exception '적재 기록(embed_load.stage)이 없다 — 되돌릴 것이 없다';
    end if;
end
$$;

delete from public.article_embedding e
using embed_load.stage s
where e.article_id = s.article_id;

drop schema embed_load cascade;

select count(*) as "남은 기사 벡터" from public.article_embedding;
