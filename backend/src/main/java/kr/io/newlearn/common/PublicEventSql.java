package kr.io.newlearn.common;

// 공개 기사가 하나도 없는 사건 · 이슈는 화면 조회에서 없는 것으로 본다(docs/api.md 1절, Jira 179). 그 판정 조각을 여기 한 곳에 둔다.
// 바깥 쿼리의 별칭에 기대는 조각이다 — 사건은 e, 이슈는 i 로 부른다. @Query 에 이어 붙일 수 있게 컴파일 시점 상수로 둔다
public final class PublicEventSql {
    private PublicEventSql() {}

    public static final String EVENT_HAS_PUBLIC_ARTICLE = """
            exists (select 1 from article_event public_link
                join article public_article on public_article.id = public_link.article_id
                where public_link.event_id = e.id and public_article.released_at is not null)
            """;

    public static final String ISSUE_HAS_PUBLIC_ARTICLE = """
            exists (select 1 from event public_event
                join article_event public_link on public_link.event_id = public_event.id
                join article public_article on public_article.id = public_link.article_id
                where public_event.issue_id = i.id and public_article.released_at is not null)
            """;

    public static final String JPQL_EVENT_HAS_PUBLIC_ARTICLE = """
            exists (select 1 from ArticleEvent publicLink
                where publicLink.event = e and publicLink.article.releasedAt is not null)
            """;
}
