package kr.io.newlearn.ingest.dto;

// B2 응답 — 넣었거나 이미 있던 기사의 id. created 가 false 면 같은 URL 의 기사가 이미 있었다(201 · 200 과 같은 뜻)
// 배치는 둘 다 이 id 로 B1 을 부르고, 이미 투입한 기사는 B1 의 409 로 건너뛴다 (docs/api-internal.md 2절, Jira 153)
public record ArticleIngestResponse(long articleId, boolean created) {}
