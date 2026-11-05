-- 분야 라벨 받기 ① — 표를 만들고 라벨 파일을 임시 표로 받는다 (Jira S15P31A102-177, infra/server/category-labels.md)
-- 마지막 문장이 COPY 다. 스트림에서 이 파일 바로 뒤에 라벨 파일과 \. 줄이 온다. 그래서 합치기는 다음 파일에 있다
-- 라벨 파일: 줄마다 URL<탭>코드. 코드 대응은 category-labels-apply.sql 한 곳
create schema if not exists category_label;

-- run 은 그 URL 을 처음 넣은 실행, old_* 는 그때의 운영 값이다. 라벨을 다시 넣어도 바뀌지 않는다 — 되돌리기가 쓴다
create table if not exists category_label.article_label (
    url               text primary key,
    label             text        not null,
    run               text        not null,
    labeled_at        timestamptz not null default now(),
    old_category_code text,
    old_released_at   timestamptz
);

create temp table incoming (url text, label text) on commit drop;

copy pg_temp.incoming (url, label) from stdin;
