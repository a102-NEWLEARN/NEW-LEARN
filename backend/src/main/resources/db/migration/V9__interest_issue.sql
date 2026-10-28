-- 관심 이슈(별표), Jira 64. 공유 환경은 V7 bookmark 뒤에 적용한다.
create table interest_issue (
    member_id bigint not null references member(id) on delete cascade,
    issue_id bigint not null references issue(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (member_id, issue_id)
);
