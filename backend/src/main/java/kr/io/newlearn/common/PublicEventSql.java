package kr.io.newlearn.common;

// 공개 기사가 모자란 사건 · 이슈는 화면 조회에서 없는 것으로 본다(docs/api.md 1절, Jira 179 · 206). 그 판정 조각을 여기 한 곳에 둔다.
// 바깥 쿼리의 별칭에 기대는 조각이다 — 사건은 e, 이슈는 i 로 부른다. @Query 에 이어 붙일 수 있게 컴파일 시점 상수로 둔다.
//
// 「몇 건 이상」은 PublicEventThreshold 가 정한다. SQL 은 :publicArticleSkip(= N − 1) 을 받아 N번째 행이 있는지만 보고 멈춘다 —
// 2026-11-14 운영 실행 계획 비교에서 이 모양이 가장 빨랐다(A2 개수 19.6 → 1.8 ms · A1 20.4 → 2.3 ms, 보고서 207-steps/explain-shape.md).
// offset 이 붙으면 PostgreSQL 이 세미조인 변환을 포기하지만, 공개 기사 2만 건을 해시로 훑는 대신 필요한 것만 찾아 첫 행에서 멈춰 더 빠르다.
// JPQL 은 offset 을 못 써서 세는 모양이다(한 이슈만 보는 A4 · A5 라 0.3 → 1.8 ms 로 충분하다).
public final class PublicEventSql {
    private PublicEventSql() {}

    public static final String EVENT_HAS_PUBLIC_ARTICLE = """
            exists (select 1 from article_event public_link
                join article public_article on public_article.id = public_link.article_id
                where public_link.event_id = e.id and public_article.released_at is not null
                offset :publicArticleSkip limit 1)
            """;

    public static final String ISSUE_HAS_PUBLIC_ARTICLE = """
            exists (select 1 from event public_event where public_event.issue_id = i.id
                and exists (select 1 from article_event public_link
                    join article public_article on public_article.id = public_link.article_id
                    where public_link.event_id = public_event.id and public_article.released_at is not null
                    offset :publicArticleSkip limit 1))
            """;

    public static final String JPQL_EVENT_HAS_PUBLIC_ARTICLE = """
            (select count(publicLink) from ArticleEvent publicLink
                where publicLink.event = e and publicLink.article.releasedAt is not null) >= :minPublicArticles
            """;
}
