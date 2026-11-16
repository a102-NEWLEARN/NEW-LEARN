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

    // 「보이는 사건이 N개 이상인 이슈」 — 이슈를 목록에 낼지 가린다(A2 · A1 · A13 이슈 칸, Jira S15P31A102-208).
    // 위의 ISSUE_HAS_PUBLIC_ARTICLE 과 다른 조각으로 둔 까닭: 그쪽은 A23 관심 이슈 저장이 쓴다. 같이 바꾸면
    // 살아 있는 이슈 페이지(A3)에서 별표를 눌렀을 때 404 가 된다. 이 문턱은 목록에서만 빼는 것이다.
    //
    // 🔴 offset 이 둘이고 자리가 다르다. 바깥 :publicEventSkip 은 「사건이 N개 있는가」, 안쪽 :publicArticleSkip 은
    // 「그 사건에 공개 기사가 M건 있는가」다. 바깥 것을 안쪽 exists 에 넣어도 문법은 맞고 뜻만 조용히 바뀐다
    // (「사건 N개」가 「어떤 사건의 기사 N건」이 된다). 경계 시험이 이걸 잡는다(MinPublicEventsApiIntegrationTest).
    public static final String ISSUE_HAS_ENOUGH_PUBLIC_EVENTS = """
            exists (select 1 from event public_event where public_event.issue_id = i.id
                and exists (select 1 from article_event public_link
                    join article public_article on public_article.id = public_link.article_id
                    where public_link.event_id = public_event.id and public_article.released_at is not null
                    offset :publicArticleSkip limit 1)
                offset :publicEventSkip limit 1)
            """;

    // 「보이는 메인 흐름 사건이 N개 이상인 이슈」 — 위 조각과 같은 자리(A2 · A1 · A13 이슈 칸)에 함께 붙인다(Jira S15P31A102-224).
    // 보이는 = 공개 기사가 문턱 이상인 사건이다 — A4 타임라인의 메인 레인과 같은 집합이다(역할이 REACTION 이 아니면 MAIN 레인).
    // 끔(:minMainEvents = 0)이면 참이다. :mainEventSkip 은 끔이어도 0 아래로 내려가지 않는다(PublicEventThreshold.mainEventSkip)
    public static final String ISSUE_HAS_ENOUGH_MAIN_EVENTS = """
            (:minMainEvents = 0 or exists (select 1 from event main_event
                where main_event.issue_id = i.id and main_event.role = 'MAIN'
                and exists (select 1 from article_event main_link
                    join article main_article on main_article.id = main_link.article_id
                    where main_link.event_id = main_event.id and main_article.released_at is not null
                    offset :publicArticleSkip limit 1)
                offset :mainEventSkip limit 1))
            """;

    public static final String JPQL_EVENT_HAS_PUBLIC_ARTICLE = """
            (select count(publicLink) from ArticleEvent publicLink
                where publicLink.event = e and publicLink.article.releasedAt is not null) >= :minPublicArticles
            """;
}
