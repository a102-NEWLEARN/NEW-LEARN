package kr.io.newlearn.search;

import java.util.List;
import kr.io.newlearn.common.PublicEventSql;
import kr.io.newlearn.common.PublicEventThreshold;
import kr.io.newlearn.issue.dto.IssueRef;
import kr.io.newlearn.search.dto.SearchArticle;
import kr.io.newlearn.search.dto.SearchEvent;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// A13 제목 검색 — 유형마다 SQL 하나. 기사는 공개 기사 인덱스(V14)를 최신순으로 훑으며 제목을 거른다. 검색용 인덱스(pg_trgm)는 없다 — 스펙 「가정」
// LIKE 대신 위치 찾기(strpos)라 검색어의 %, _, \ 도 그냥 글자다. LIKE '%'||q||'%' 에 그대로 넣으면 % 는 모든 제목,
// _ 는 아무 한 글자와 맞고, 끝의 \ 는 닫는 % 를 글자로 만들어 결과가 조용히 틀어진다(오류는 나지 않는다)
@Repository
class SearchQueryRepository {
    // 유형마다 이만큼만 준다. 몇 개를 보일지는 화면이 정한다(넘는 것은 개수로만)
    static final int LIMIT = 20;

    private final JdbcClient jdbc;
    private final PublicEventThreshold threshold;

    SearchQueryRepository(JdbcClient jdbc, PublicEventThreshold threshold) {
        this.jdbc = jdbc;
        this.threshold = threshold;
    }

    // 문턱을 넘는 사건이 있는 이슈만(docs/api.md 1절), 만든 때 최신순
    List<IssueRef> issues(String query) {
        return jdbc.sql("""
                        select id, title from issue i
                        where strpos(lower(title), lower(:q)) > 0 and
                        """ + PublicEventSql.ISSUE_HAS_PUBLIC_ARTICLE + """
                        order by created_at desc, id desc
                        limit :limit
                        """)
                .param("q", query)
                .param("publicArticleSkip", threshold.skip())
                .param("limit", LIMIT)
                .query((rs, n) -> new IssueRef(rs.getLong("id"), rs.getString("title")))
                .list();
    }

    // 이슈에 묶인 사건만(화면이 그 이슈로 옮겨 간다), 공개 기사가 있는 것만, 발생 시점 최신순
    List<SearchEvent> events(String query) {
        return jdbc.sql("""
                        select id, title, issue_id from event e
                        where issue_id is not null and strpos(lower(title), lower(:q)) > 0 and
                        """ + PublicEventSql.EVENT_HAS_PUBLIC_ARTICLE + """
                        order by occurred_at desc, id desc
                        limit :limit
                        """)
                .param("q", query)
                .param("publicArticleSkip", threshold.skip())
                .param("limit", LIMIT)
                .query((rs, n) -> new SearchEvent(rs.getLong("id"), rs.getString("title"), rs.getLong("issue_id")))
                .list();
    }

    // 공개된 기사만(docs/api.md 1절 「공개 전 기사」), 발행 시각 최신순
    List<SearchArticle> articles(String query) {
        return jdbc.sql("""
                        select id, title from article
                        where released_at is not null and strpos(lower(title), lower(:q)) > 0
                        order by published_at desc, id desc
                        limit :limit
                        """)
                .param("q", query)
                .param("publicArticleSkip", threshold.skip())
                .param("limit", LIMIT)
                .query((rs, n) -> new SearchArticle(rs.getLong("id"), rs.getString("title")))
                .list();
    }
}
