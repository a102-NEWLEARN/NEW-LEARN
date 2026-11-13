-- 분야 라벨 적용 — 라벨 표의 값을 article 에 쓴다 (Jira S15P31A102-177, infra/server/category-labels.md)
-- 덤프 적재 트랜잭션 안에서도 이 파일을 부른다(data-load.md 6절). 그때 search_path 가 비어 있으니 스키마 이름을 모두 붙이고,
-- 트랜잭션 명령을 쓰지 않는다. 임시 표가 on commit drop 이라 트랜잭션 밖에서 부르면 다음 문장에서 멈춘다 — 그대로 둔다
-- 숨기기만 하고 공개하지는 않는다. 덤프 적재가 임시 공개에서 내린 기사를 되살리지 않으려는 것이다

-- 코드 → 분야. 이 대응은 여기 한 곳에만 둔다. hidden 은 화면에서 뺀다(T 스포츠 · C 문화/연예 · X 제목이 깨진 기사 · 잘못된 본문 기사)
create temp table label_code on commit drop as
select *
from (values
    ('P', 'politics', false),
    ('E', 'economy', false),
    ('S', 'society', false),
    ('W', 'world', false),
    ('I', 'it_science', false),
    ('T', null, true),
    ('C', null, true),
    ('X', null, true)
) as code (label, category_code, hidden);

do $$
declare
    unknown text;
begin
    select string_agg(distinct l.label, ', ') into unknown
    from category_label.article_label l
    left join pg_temp.label_code c on c.label = l.label
    where c.label is null;
    if unknown is not null then
        raise exception '모르는 라벨 코드: %', unknown;
    end if;
end
$$;

-- 값이 같은 기사는 건드리지 않는다. 두 번 돌려도 0건 변경이다
update public.article a
set category_code = c.category_code,
    released_at   = case when c.hidden then null else a.released_at end
from category_label.article_label l
join pg_temp.label_code c on c.label = l.label
where a.url = l.url
  and (a.category_code is distinct from c.category_code
       or (c.hidden and a.released_at is not null));

-- 이슈 분야 다시 계산 — IssueCategoryRepository.fillMostCommon 과 같은 식(기사가 가장 많은 분야, 같으면 sort_order, 분야 빈 기사는 뺌)
delete from public.issue_category;

insert into public.issue_category (issue_id, category_code)
select distinct on (counted.issue_id) counted.issue_id, counted.category_code
from (
    select e.issue_id, a.category_code, c.sort_order, count(*) as total
    from public.event e
    join public.article_event l on l.event_id = e.id
    join public.article a on a.id = l.article_id
    join public.category c on c.code = a.category_code
    where e.issue_id is not null
    group by e.issue_id, a.category_code, c.sort_order
) counted
order by counted.issue_id, counted.total desc, counted.sort_order, counted.category_code;

-- 이슈 분야 고정 (Jira S15P31A102-198, 2026-11-13) — 아래 이슈는 다수결 대신 이 분야로 둔다. Sonnet 조수가 이슈 제목 · 요약을 읽고
-- 다르게 본 이슈다(누가 정했나는 SSOT.md 9절, 절차는 category-labels.md 7절). 바꿀 때는 이 목록을 고치는 MR 로 한다
-- 번호와 제목이 둘 다 같을 때만 적용한다 — 다시 적재로 이슈 번호가 새로 매겨지면 엉뚱한 이슈에 붙지 않게 건너뛴다
-- 이 파일이 돌 때만 이긴다. ISSUE 결과 저장(IssueResultHandler → IssueCategoryRepository.fillMostCommon)은 그 이슈를 다수결로
-- 다시 채우고, 다음 apply 때 다시 고정된다. 코드는 위 label_code 와 같은 P · E · S · W · I (숨김 코드는 받지 않는다)
create temp table issue_pin on commit drop as
select *
from (values
    (5, '가상자산 과세 2년 유예 논의', 'E'),
    (9, '메가특구 노동시간 특례와 보상 논쟁', 'S'),
    (15, '김정은 방중과 단둥 이동', 'W'),
    (33, '제주교육청 조직개편안 부결 논란', 'P'),
    (47, '금융권 개인정보 유출과 대응', 'I'),
    (54, '진성준 의원 미국 비자 거부·발급 논란', 'W'),
    (61, '이태원 참사 추모와 국가 책임·재발 방지', 'S'),
    (74, '한미 안보협의 일정 연기와 동맹 이상설', 'W'),
    (80, '바이낸스 해킹과 북한 배후 공방', 'I'),
    (86, '장경태 의원 성추행 혐의 기소와 정치권 공방', 'P'),
    (95, '퇴직연금 사외적립 의무화와 반발', 'E'),
    (101, '미래에셋 해킹·고객정보 유출 대응', 'I'),
    (107, '순방단 개인정보 유출 조사', 'I'),
    (111, 'DMZ 지뢰 사건 안보리 서한 공방', 'W'),
    (126, '윤석열 선거법 항소심과 선거비용 반환 공방', 'S'),
    (130, '냉장·냉동시설 사이버 공격과 대응', 'I'),
    (131, '스페이스X 스타링크 이동통신 확대', 'I'),
    (137, '공공재개발 추진 방식 공방', 'E'),
    (138, '금융권 해킹 대응과 보안 점검', 'I'),
    (140, '윤석열 비상계엄 내란죄 항소심 공방', 'S'),
    (142, '히노호사의 텍사스 데이터센터 중단 공방', 'W'),
    (150, '초광역특구법 노동 특례 공방', 'S'),
    (158, '김성남 방중과 북중 교류 논의', 'W'),
    (162, '프라뱅 해킹과 금융권 보안 점검', 'I'),
    (168, '비거주 1주택자 종부세 공제 확대 공방', 'E'),
    (172, '청해부대 파견 연장·임무 확대 논의', 'W'),
    (176, '이재명 정부의 경찰 특별단속 성과 공개', 'S'),
    (185, '김장재료 수급 안정 대책과 공급 전망', 'E')
) as pin (issue_id, title, label);

do $$
declare
    bad text;
    skipped int;
begin
    select string_agg(p.issue_id || ' ' || p.label, ', ') into bad
    from pg_temp.issue_pin p
    left join pg_temp.label_code c on c.label = p.label
    where c.label is null or c.hidden;
    if bad is not null then
        raise exception '이슈 고정에 모르는 코드나 숨김 코드: %', bad;
    end if;
    select string_agg(issue_id::text, ', ') into bad
    from (select issue_id from pg_temp.issue_pin group by issue_id having count(*) > 1) d;
    if bad is not null then
        raise exception '이슈 고정에 같은 번호가 두 번: %', bad;
    end if;
    select count(*) into skipped
    from pg_temp.issue_pin p
    left join public.issue i on i.id = p.issue_id and i.title = p.title
    where i.id is null;
    if skipped > 0 then
        raise notice '이슈 고정 % 줄은 번호 · 제목이 운영과 달라 건너뛴다', skipped;
    end if;
end
$$;

-- 고정 전에 찍는다 — 이 표가 안 나오면 서버 사본이 옛 파일이다
select p.issue_id as 고정_이슈, ic.category_code as 다수결, c.category_code as 고정, i.title is not distinct from p.title as 제목_같음
from pg_temp.issue_pin p
join pg_temp.label_code c on c.label = p.label
left join public.issue i on i.id = p.issue_id
left join public.issue_category ic on ic.issue_id = p.issue_id
order by p.issue_id;

delete from public.issue_category ic
using pg_temp.issue_pin p
join public.issue i on i.id = p.issue_id and i.title = p.title
where ic.issue_id = p.issue_id;

insert into public.issue_category (issue_id, category_code)
select p.issue_id, c.category_code
from pg_temp.issue_pin p
join public.issue i on i.id = p.issue_id and i.title = p.title
join pg_temp.label_code c on c.label = p.label;

-- 라벨이 이겼는지 — 어기면 트랜잭션 전체가 되돌아간다
do $$
begin
    if exists (
        select 1
        from public.article a
        join category_label.article_label l on l.url = a.url
        join pg_temp.label_code c on c.label = l.label
        where c.hidden and a.released_at is not null
    ) then
        raise exception '숨겨야 할 기사가 공개되어 있다';
    end if;
end
$$;

-- 눈으로 대조할 수
select coalesce(category_code, '(없음)') as 공개_분야, count(*) as 기사
from public.article
where released_at is not null
group by 1
order by 2 desc;

select l.label as 라벨, count(*) as 라벨_수, count(a.id) as 맞춘_기사
from category_label.article_label l
left join public.article a on a.url = l.url
group by 1
order by 2 desc;

select count(*) filter (where a.released_at is not null) as 공개_합,
       (select count(*)
        from public.bookmark b
        join public.article x on x.id = b.article_id
        join category_label.article_label y on y.url = x.url
        join pg_temp.label_code z on z.label = y.label
        where z.hidden) as 숨겨진_북마크,
       (select count(*)
        from public.event e
        where exists (select 1 from public.article_event ae where ae.event_id = e.id)
          and not exists (
              select 1
              from public.article_event ae
              join public.article x on x.id = ae.article_id
              where ae.event_id = e.id and x.released_at is not null)) as 기사가_모두_숨겨진_사건
from public.article a;

select ic.category_code as 이슈_분야, count(*) as 이슈
from public.issue_category ic
group by 1
order by 2 desc;
