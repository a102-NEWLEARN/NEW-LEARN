create table bookmark (
    member_id bigint not null references member(id) on delete cascade,
    article_id bigint not null references article(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (member_id, article_id)
);
