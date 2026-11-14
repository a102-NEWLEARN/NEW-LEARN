-- 기사 벡터 적재 ① — 받는 표 만들기 (Jira S15P31A102-207)
-- 순서 · 명령은 infra/server/data-load.md 10절 「기사 벡터 채우기」. 이 파일 뒤에 COPY 토막들 →
-- embedding-load.sql 이 온다. COPY 는 토막마다 따로 돌아서(큰 파일 한 번에 보내면 끊긴다) 이 표는 임시 표가 아니다.
-- 되돌리기(embedding-undo.sql)가 이 표를 보고 지우므로 넣기가 끝나도 남겨 둔다

do $$
begin
    if transaction_timestamp() = statement_timestamp() then
        raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(data-load.md 10절)';
    end if;
    if to_regclass('embed_load.stage') is not null then
        raise exception '이전 적재 기록(embed_load.stage)이 남아 있다 — 되돌리기(embedding-undo.sql)부터';
    end if;
end
$$;

create schema if not exists embed_load;

create table embed_load.stage (
    article_id bigint primary key,
    model      text         not null,
    embedding  vector(1024) not null
);

create table embed_load.info (
    staged_at timestamptz not null default now(),
    loaded_at timestamptz
);
insert into embed_load.info (staged_at) values (now());
