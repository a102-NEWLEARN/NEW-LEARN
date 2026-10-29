-- 사건 역할 기본값을 지우고 반응 대상 사건 번호 칸을 더한다 (Jira 134, docs/data-model.md event)
-- 기본값 MAIN 은 V8 전 사건 몫이었다. 새 사건은 판정(MATCH_EVENT)이 늘 역할을 정하므로, 빠뜨린 사건이 조용히 메인 흐름에 들어가지 않게 지운다.
-- reacts_to_event_id 는 REACTION 사건이 반응하는 사건 — 판정에 보낸 후보 안일 때만 채운다. 대상 사건이 지워지면 비운다
alter table event
    alter column role drop default,
    add column reacts_to_event_id bigint references event (id) on delete set null;
