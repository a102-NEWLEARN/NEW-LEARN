-- 기사 벡터 (Jira 35, docs/data-model.md article_embedding, docs/api-internal.md 5절 EMBED)
-- 같은 사건 후보를 고를 때 기사 벡터끼리 비교한다. BGE-m3-ko 라 1024차원(2026-10-23) — 차원을 고정해 DB 가 막는다
-- 처음엔 인덱스 없이 정확 검색(재현율 100%). 재서 느리면 HNSW 를 새 마이그레이션으로 건다
create table article_embedding (
    article_id bigint primary key references article (id),
    model      text         not null,
    embedding  vector(1024) not null,
    created_at timestamptz  not null default now()
);
