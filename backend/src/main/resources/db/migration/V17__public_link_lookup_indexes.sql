-- 공개 기사 · 사건-기사 짝 인덱스 둘 (Jira S15P31A102-228)
--
-- 사건마다 「공개 기사가 M건 있나」를 보는 질의(common/PublicEventSql 의 문턱 조각 — A1 분야별 이슈 수 · A2 끝 넘은 쪽 전체 수 ·
-- A13 검색, 그리고 A3 이슈 머리 · A4 타임라인 · 사건별 기사 수)는 기사 한 건마다 두 번 표까지 다녀왔다.
--   ① article_event_event_id_idx(V15)로 연결 행을 찾고 표에서 article_id 를 읽는다 → 짝 인덱스 (event_id, article_id) 안에서 끝난다
--   ② article_pkey 로 기사 표(운영 18만 행 · 5만 6천 페이지)까지 가서 released_at 을 본다 → 공개 기사(3만 행)만 담은 (id) 인덱스 안에서 끝난다.
--      press_code 를 같이 담아 A3 머리 · 사건별 기사 수의 언론사 수도 표 없이 센다
-- 2026-11-17 운영 실행 계획: A2 전체 수 한 번에 사건 1,563번 · 기사 3,687번을 이렇게 찾았다.
--
-- 로컬 시험 DB(운영 11-17 07:24 덤프, 운영과 같은 메모리 설정, VACUUM 뒤, 한 연결 · jit off, 3회 중앙값):
--   A1 분야별 이슈 수 10.3 → 6.8 ms(버퍼 23,033 → 13,090) · A2 끝 넘은 쪽 전체 수 11.1 → 5.7 · A3 이슈 머리 3.3 → 1.2 · A4 타임라인 1.09 → 0.69.
--   A13 검색은 버퍼만 준다(이슈 칸 465 → 285 · 사건 칸 2,764 → 2,293, 시간은 그대로). A2 목록(창 함수로 세는 모양) · A7 기사 목록 ·
--   A1 분야별 기사 수는 그대로. 운영은 막 공개된 기사가 「모두 보임」 표시 전 페이지에 몰려
--   인덱스만 읽기가 표까지 다녀오는 몫(11-17 공개 기사 인덱스 8%)이 있어 효과가 이보다 작을 수 있다
-- 이름이 article_public_ 로 시작하지 않게 했다 — ArticlePublicIndexSchemaTest 가 그 이름을 V14 의 둘로 센다. 모양은 PublicLinkIndexSchemaTest
--
-- concurrently 를 쓰지 않는다 — V14 · V15 와 같은 트랜잭션 방식이다. 만드는 동안 두 표에 SHARE 잠금이라 읽기는 되고 쓰기(수집 · 공개 처리 ·
-- 사건 연결)만 기다린다. V14 는 운영 기사 표(약 5만 1천 페이지)에 인덱스 둘을 0.49초에 만들었다(SSOT.md 10절).
-- 열린 적재 · 분석 트랜잭션 뒤에서 오래 기다리지 않게 잠금은 5초만 기다린다(만드는 시간은 묶지 않는다).
-- 넘으면 이 판이 통째로 되돌아가 새 backend 만 못 뜨고 옛 것이 계속 받는다(maxUnavailable 0). 컨테이너가 다시 시작하며 다시 시도한다
-- 되돌리기: 사람이 하나씩 drop index concurrently if exists … — 그냥 drop 은 ACCESS EXCLUSIVE 라 화면 조회까지 막는다
-- (docs/plans/2026-11-17-public-link-indexes.md 「되돌리는 법」)
set local lock_timeout = '5s';

create index article_released_id_idx
    on article (id) include (press_code)
    where released_at is not null;

create index article_event_event_article_idx
    on article_event (event_id, article_id);
