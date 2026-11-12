-- 기사-사건 연결 · 사건 인덱스 둘 (Jira S15P31A102-194)
--
-- 사건 몇 개나 이슈 하나만 보는 쿼리도 연결 표(article_event, 운영 1만 2천 행)와 사건 표(825행)를 통째로 엮었다.
-- 두 표의 인덱스는 기본 키(article_id · id)뿐이라 event_id · issue_id 로 찾을 길이 없었다(V2)
--   첫째 event_id: 사건 몇 개의 기사를 찾을 때 — A5 사건 패널(앞뒤 사건 · 공개 기사 수 · 언론사), A6 사건 관련 기사,
--                  A4 사건별 수, A25 관심 이슈, 분석의 사건별 첫 기사
--   둘째 issue_id: 이슈 하나 · 몇 개의 사건을 찾을 때 — A3 이슈 머리, A4 타임라인, A2 이슈 목록의 최근 사건, A5 앞뒤 사건
-- 로컬 시험 DB 에서 표 통째 읽기가 없어진 것은 A5 앞 사건(256 → 33블록) · 공개 기사 수 · 언론사, A6, A4 사건별 수, 분석 첫 기사다.
-- A3 머리 · A4 타임라인 · 최근 사건 · A25 는 두 표 중 하나만 인덱스로 찾고 다른 하나는 그대로 통째로 읽어 1할 남짓 덜 읽는다.
-- 전체를 세는 쿼리(A2 개수 · A1 이슈 수)는 그대로다 — docs/plans/2026-11-12-issue-list-query.md 「구현하며 바뀐 것」.
-- 모양은 EventIssueIndexSchemaTest 가 지킨다
--
-- concurrently 를 쓰지 않는다 — 1만 행대라 순간이고 V1 ~ V14 와 같은 트랜잭션 방식이다. 그동안 읽기는 되고 사건 쓰기만 기다린다.
-- 적재 · 분석 트랜잭션이 표를 잡고 있으면 그 뒤로 사건 쓰기가 줄줄이 막히지 않게 잠금은 5초만 기다린다.
-- 넘으면 이 판이 통째로 되돌아가 새 backend 만 못 뜨고 옛 것이 계속 받는다(maxUnavailable 0). kubelet 이 새 파드를 다시 띄우며
-- 이 판을 다시 시도한다(실패 행이 남지 않아 repair 는 필요 없다)
-- 되돌리기: 인덱스만 지우면 원래대로다(같은 계획 「되돌리는 법」)
set local lock_timeout = '5s';

create index article_event_event_id_idx on article_event (event_id);

create index event_issue_id_idx on event (issue_id);
