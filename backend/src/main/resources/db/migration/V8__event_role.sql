-- 사건의 역할과 반응 대상 한 줄 (Jira 130, docs/data-model.md event)
-- role 은 타임라인 레인을 정한다: MAIN 상황을 바꾸는 행위 → 메인 흐름, REACTION 다른 사건에 대한 반응 · 평가 · 여론 → 서브 흐름.
-- 기본값 MAIN 은 이 칸이 생기기 전 사건 몫이다. 새 사건은 판정(MATCH_EVENT)이 정한 값을 넣는다
alter table event
    add column role text not null default 'MAIN'
        constraint event_role_check check (role in ('MAIN', 'REACTION')),
    add column reacts_to text;
