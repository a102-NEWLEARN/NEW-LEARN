-- 기사 벡터 적재 ② — 검사 → `article_embedding` 에 넣기 (Jira S15P31A102-207)
-- 순서 · 명령은 infra/server/data-load.md 10절. 앞에 embedding-stage.sql 과 COPY 토막들이 온다.
-- 한 트랜잭션 안에서 돈다 — 하나라도 걸리면 예외로 통째로 되돌아간다

do $$
declare
    staged  bigint;
    linked  bigint;
    already bigint;
    missing bigint;
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(data-load.md 10절)';
    end if;

    -- 1. 받는 표가 사건에 묶인 기사와 1:1 인가 — 한쪽만 있으면 그 기사는 판정 후보에서 빠진다
    select count(*) into staged from embed_load.stage;
    select count(*) into linked from public.article_event;
    if staged <> linked then
        raise exception '받는 표 % 행 ≠ 사건에 묶인 기사 % 건', staged, linked;
    end if;
    select count(*) into missing
    from public.article_event ae
    where not exists (select 1 from embed_load.stage s where s.article_id = ae.article_id);
    if missing > 0 then
        raise exception '사건에 묶였는데 벡터가 없는 기사 % 건', missing;
    end if;

    -- 2. 없는 기사를 가리키지 않는가
    select count(*) into missing
    from embed_load.stage s
    where not exists (select 1 from public.article a where a.id = s.article_id);
    if missing > 0 then
        raise exception '운영에 없는 기사를 가리키는 줄 % 건', missing;
    end if;

    -- 3. 이미 벡터가 있는 기사를 덮지 않는가 — 운영 EMBED 워커가 만든 행을 덮으면 안 된다
    select count(*) into already
    from public.article_embedding e
    join embed_load.stage s on s.article_id = e.article_id;
    if already > 0 then
        raise exception '이미 벡터가 있는 기사 % 건 — 덮지 않는다', already;
    end if;

    -- 4. 모델 이름이 운영 EMBED 워커와 같은가(data-load.md 3절)
    if exists (select 1 from embed_load.stage where model <> 'dragonkue/BGE-m3-ko') then
        raise exception '모델 이름이 dragonkue/BGE-m3-ko 가 아닌 줄이 있다';
    end if;

    -- 5. 길이가 1 인 벡터인가 — 정규화한 벡터만 받는다(float32 오차 1e-3 까지)
    if exists (
        select 1 from embed_load.stage
        where abs(sqrt((embedding <#> embedding) * -1) - 1) > 1e-3
    ) then
        raise exception '길이가 1 이 아닌 벡터가 있다';
    end if;
end
$$;

insert into public.article_embedding (article_id, model, embedding)
select article_id, model, embedding from embed_load.stage;

update embed_load.info set loaded_at = now();

-- 6. 넣은 뒤 — 사건에 묶인 기사가 모두 벡터를 가진다
do $$
declare
    without_vector bigint;
begin
    select count(*) into without_vector
    from public.article_event ae
    where not exists (select 1 from public.article_embedding e where e.article_id = ae.article_id);
    if without_vector > 0 then
        raise exception '넣었는데 벡터 없는 사건 기사가 % 건 남았다', without_vector;
    end if;
end
$$;

select (select count(*) from public.article_embedding)          as "기사 벡터",
       (select count(*) from public.article_event)              as "사건에 묶인 기사",
       (select loaded_at from embed_load.info order by staged_at desc limit 1) as "넣은 때";
