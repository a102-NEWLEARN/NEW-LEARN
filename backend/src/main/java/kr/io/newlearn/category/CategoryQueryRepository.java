package kr.io.newlearn.category;

import java.util.HashMap;
import java.util.Map;
import kr.io.newlearn.common.PublicEventSql;
import kr.io.newlearn.common.PublicEventThreshold;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CategoryQueryRepository {
    private final JdbcClient jdbc;

    private final PublicEventThreshold threshold;

    public CategoryQueryRepository(JdbcClient jdbc, PublicEventThreshold threshold) {
        this.jdbc = jdbc;
        this.threshold = threshold;
    }

    public Map<String, Long> issueCounts() {
        return counts("select ic.category_code, count(*) as total from issue_category ic"
                + " join issue i on i.id = ic.issue_id where " + PublicEventSql.ISSUE_HAS_ENOUGH_PUBLIC_EVENTS
                + " group by ic.category_code");
    }

    public Map<String, Long> articleCounts() {
        return counts("""
                select category_code, count(*) as total from article
                where released_at is not null and category_code is not null group by category_code
                """);
    }

    private Map<String, Long> counts(String sql) {
        Map<String, Long> counts = new HashMap<>();
        // 조각을 안 쓰는 질의(기사 수)에는 이 값이 안 들어간다 — JdbcClient 는 SQL 에 있는 이름만 묶는다
        jdbc.sql(sql)
                .param("publicArticleSkip", threshold.skip())
                .param("publicEventSkip", threshold.eventSkip())
                .query((rs, row) -> {
                    counts.put(rs.getString("category_code"), rs.getLong("total"));
                    return rs.getString("category_code");
                })
                .list();
        return counts;
    }
}
