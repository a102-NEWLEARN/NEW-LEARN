package kr.io.newlearn.issue;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import kr.io.newlearn.common.PublicEventSql;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 복잡한 집계는 네이티브 SQL로 읽는다. 카테고리 조인 대신 EXISTS로 필터해 행이 늘어나지 않게 한다.
@Repository
public class IssueQueryRepository {
    // A3 단건 · A25 관심 이슈가 쓰는 계산이다. A2 목록은 같은 수를 아래 LIST 모양으로 센다 — 행 매핑(mapCard)은 셋이 같다.
    // inner join 이라 공개 기사가 없는 사건은 수 · 기간에서 빠지고,
    // 공개 사건이 하나도 없는 이슈는 행이 나오지 않는다(PublicEventSql 과 같은 규칙, 수를 세야 해서 이 모양이다)
    private static final String AGGREGATE = """
            select i.id, i.title, i.summary, i.created_at,
                count(distinct e.id) as event_count, count(distinct a.id) as article_count,
                count(distinct a.press_code) as publisher_count,
                min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at
            from issue i
            join event e on e.issue_id = i.id
            join article_event ae on ae.event_id = e.id
            join article a on a.id = ae.article_id and a.released_at is not null
            """;
    // A2 목록만 따로 — 사건을 이슈별로 먼저 세고, issue 를 붙인 뒤 정렬 · 자르기를 바깥에서 한 번 한다(Jira 194).
    // AGGREGATE 처럼 issue 를 먼저 엮으면 집계 앞 정렬이 행마다 제목 · 요약을 달고 가서, 운영(1만 1천 행)에서 정렬 메모리를 넘겨 디스크를 썼다.
    // 수 · 기간 · 순서는 AGGREGATE 와 같다(운영 11-12 에 정렬 2 × 분야 6 × 크기 4 의 모든 쪽을 견줘 같음). 이슈 밖 사건(issue_id 가 빈)은
    // issue 와 붙지 않아 어차피 빠지지만 집계 일을 덜려고 미리 뺀다. 자른 뒤에 issue 를 붙이면 그 묶음이 칸을 먹는다(CategoryIssueQueryTest)
    private static final String LIST = """
            select i.id, i.title, i.summary, i.created_at,
                c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at
            from (
                select e.issue_id,
                    count(distinct e.id) as event_count, count(distinct a.id) as article_count,
                    count(distinct a.press_code) as publisher_count,
                    min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at
                from event e
                join article_event ae on ae.event_id = e.id
                join article a on a.id = ae.article_id and a.released_at is not null
                where e.issue_id is not null and (:category is null or exists (
                    select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = :category))
                group by e.issue_id
            ) c
            join issue i on i.id = c.issue_id
            order by case when :sort = 'createdAt' then i.created_at else c.last_event_at end desc nulls last,
                i.id desc
            limit :limit offset :offset
            """;
    private static final String CATEGORY_FILTER = """
            (:category is null or exists (
                select 1 from issue_category ic where ic.issue_id = i.id and ic.category_code = :category))
            """;
    private final JdbcClient jdbc;

    public IssueQueryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Page<CardRow> findCards(@Nullable String category, String sort, Pageable pageable) {
        long total = jdbc.sql("select count(*) from issue i where " + PublicEventSql.ISSUE_HAS_PUBLIC_ARTICLE + " and "
                        + CATEGORY_FILTER)
                .param("category", category, Types.VARCHAR)
                .query(Long.class)
                .single();
        List<CardRow> rows = jdbc.sql(LIST)
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
        if (issueIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(AGGREGATE + " where i.id in (:ids) group by i.id")
                .param("ids", issueIds)
                .query(IssueQueryRepository::mapCard)
                .list();
    }

    public List<EventCountRow> findEventCounts(List<Long> eventIds) {
        if (eventIds.isEmpty()) {
            return List.of();
        }
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
        if (issueIds.isEmpty()) {
            return List.of();
        }
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
        if (issueIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                select distinct on (issue_id) issue_id, id, title, label, occurred_at from event e
                where issue_id in (:ids) and
                """ + PublicEventSql.EVENT_HAS_PUBLIC_ARTICLE + """
                order by issue_id, occurred_at desc, id desc
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
    // 비는 칸: min · max(e.occurred_at). AGGREGATE · LIST 가 inner join 이라 지금은 비지 않지만 응답 타입이 null 을 허용해 그대로 읽는다
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
