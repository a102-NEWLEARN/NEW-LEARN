package kr.io.newlearn.event;

// 사건의 역할 — 주체가 아니라 행위의 역할로 나눈다. 타임라인 레인을 정한다 (Jira 130, docs/data-model.md event)
public enum EventRole {
    // 상황을 바꾸는 행위(발생 · 결정 · 발표 · 결과 · 공식 조치) → 메인 흐름
    MAIN,
    // 다른 사건에 대한 반응 · 평가 · 여론(논평 · 성명 · 여론조사 발표 등) → 서브 흐름
    REACTION
}
