package kr.io.newlearn.category;

import java.util.HashMap;
import java.util.Map;
import kr.io.newlearn.common.PublicEventSql;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CategoryQueryRepository {
    private final JdbcClient jdbc;

    public CategoryQueryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Long> issueCounts() {
        return counts("select ic.category_code, count(*) as total from issue_category ic"
                + " join issue i on i.id = ic.issue_id where " + PublicEventSql.ISSUE_HAS_PUBLIC_ARTICLE
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
        jdbc.sql(sql)
                .query((rs, row) -> {
                    counts.put(rs.getString("category_code"), rs.getLong("total"));
                    return rs.getString("category_code");
                })
                .list();
        return counts;
    }
}
