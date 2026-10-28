package kr.io.newlearn.issue;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 복잡한 집계는 네이티브 SQL로 읽는다. 카테고리 조인 대신 EXISTS로 필터해 행이 늘어나지 않게 한다.
@Repository
public class IssueQueryRepository {
    // A2 목록과 A3 단건이 같은 계산과 행 매핑을 공유한다.
    private static final String AGGREGATE = """
            select i.id, i.title, i.summary, i.created_at,
                count(distinct e.id) as event_count, count(distinct a.id) as article_count,
                count(distinct a.press_code) as publisher_count,
                min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at
            from issue i
            left join event e on e.issue_id = i.id
            left join article_event ae on ae.event_id = e.id
            left join article a on a.id = ae.article_id and a.released_at is not null
            """;
    private static final String FILTER = """
            where (:category is null or exists (
                select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = :category))
            """;
    private final JdbcClient jdbc;

    public IssueQueryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Page<CardRow> findCards(String category, String sort, Pageable pageable) {
        long total = jdbc.sql("select count(*) from issue i " + FILTER)
                .param("category", category, Types.VARCHAR)
                .query(Long.class)
                .single();
        List<CardRow> rows = jdbc.sql(AGGREGATE + FILTER + """
                group by i.id
                order by case when :sort = 'createdAt' then i.created_at else max(e.occurred_at) end desc nulls last,
                    i.id desc
                limit :limit offset :offset
                """)
                .param("category", category, Types.VARCHAR)
                .param("sort", sort)
                .param("limit", pageable.getPageSize())
                .param("offset", pageable.getOffset())
                .query(IssueQueryRepository::mapCard)
                .list();
        return new PageImpl<>(rows, pageable, total);
    }

    public Optional<CardRow> findHeader(long issueId) {
        return jdbc.sql(AGGREGATE + " where i.id = :id group by i.id")
                .param("id", issueId)
                .query(IssueQueryRepository::mapCard)
                .optional();
    }

    public List<CardRow> findCardsByIds(List<Long> issueIds) {
        if (issueIds.isEmpty()) return List.of();
        return jdbc.sql(AGGREGATE + " where i.id in (:ids) group by i.id")
                .param("ids", issueIds)
                .query(IssueQueryRepository::mapCard)
                .list();
    }

    public List<EventCountRow> findEventCounts(List<Long> eventIds) {
        if (eventIds.isEmpty()) return List.of();
        return jdbc.sql("""
                select e.id, count(distinct a.id) as article_count,
                    count(distinct a.press_code) as publisher_count
                from event e
                left join article_event ae on ae.event_id = e.id
                left join article a on a.id = ae.article_id and a.released_at is not null
                where e.id in (:ids) group by e.id
                """)
                .param("ids", eventIds)
                .query((rs, n) ->
                        new EventCountRow(rs.getLong("id"), rs.getLong("article_count"), rs.getLong("publisher_count")))
                .list();
    }

    private static CardRow mapCard(ResultSet rs, int rowNum) throws SQLException {
        return new CardRow(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("summary"),
                rs.getLong("event_count"),
                rs.getLong("article_count"),
                rs.getLong("publisher_count"),
                nullableInstant(rs, "first_event_at"),
                nullableInstant(rs, "last_event_at"),
                instant(rs, "created_at"));
    }

    public List<CategoryRow> findCategories(List<Long> issueIds) {
        if (issueIds.isEmpty()) return List.of();
        return jdbc.sql("""
                select ic.issue_id, c.code, c.name from issue_category ic
                join category c on c.code = ic.category_code
                where ic.issue_id in (:ids) order by ic.issue_id, c.sort_order
                """)
                .param("ids", issueIds)
                .query((rs, n) -> new CategoryRow(rs.getLong("issue_id"), rs.getString("code"), rs.getString("name")))
                .list();
    }

    public List<EventRow> findLastEvents(List<Long> issueIds) {
        if (issueIds.isEmpty()) return List.of();
        return jdbc.sql("""
                select distinct on (issue_id) issue_id, id, title, label, occurred_at from event
                where issue_id in (:ids) order by issue_id, occurred_at desc, id desc
                """)
                .param("ids", issueIds)
                .query((rs, n) -> new EventRow(
                        rs.getLong("issue_id"),
                        rs.getLong("id"),
                        rs.getString("title"),
                        rs.getString("label"),
                        instant(rs, "occurred_at")))
                .list();
    }

    // JDBC 값은 null 표시가 없어 NullAway 가 늘 non-null 로 본다 — 비는 칸과 not null 칸을 나눠 읽는다
    // 비는 칸: 사건이 없는 이슈의 min · max(e.occurred_at)
    private static @Nullable Instant nullableInstant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime time = rs.getObject(column, OffsetDateTime.class);
        return time == null ? null : time.toInstant();
    }

    // not null 칸(issue.created_at · event.occurred_at)
    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }

    public record CardRow(
            long id,
            String title,
            @Nullable String summary,
            long eventCount,
            long articleCount,
            long publisherCount,
            @Nullable Instant firstEventAt,
            @Nullable Instant lastEventAt,
            Instant createdAt) {}

    public record CategoryRow(long issueId, String code, String name) {}

    public record EventRow(long issueId, long id, String title, String label, Instant occurredAt) {}

    public record EventCountRow(long eventId, long articleCount, long publisherCount) {}
}
