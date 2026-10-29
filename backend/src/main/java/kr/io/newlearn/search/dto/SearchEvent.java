package kr.io.newlearn.search.dto;

// 사건 결과 — 누르면 그 이슈의 타임라인에서 이 사건을 고른다. 그래서 이슈에 묶인 사건만 나온다
public record SearchEvent(long id, String title, long issueId) {}
