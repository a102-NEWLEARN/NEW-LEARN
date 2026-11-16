package kr.io.newlearn.issue;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import kr.io.newlearn.common.PublicEventSql;
import kr.io.newlearn.common.PublicEventThreshold;
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
    // 문턱을 넘는 사건이 하나도 없는 이슈는 행이 나오지 않는다(PublicEventSql 과 같은 규칙, 수를 세야 해서 이 모양이다)
    private static final String AGGREGATE = """
            select i.id, i.title, i.summary, i.created_at,
                count(distinct e.id) as event_count, count(distinct a.id) as article_count,
                count(distinct a.press_code) as publisher_count,
                min(e.occurred_at) as first_event_at, max(e.occurred_at) as last_event_at
            from issue i
            join event e on e.issue_id = i.id
            """ + " and " + PublicEventSql.EVENT_HAS_PUBLIC_ARTICLE + """
            join article_event ae on ae.event_id = e.id
            join article a on a.id = ae.article_id and a.released_at is not null
            """;
    // A2 목록만 따로 — 사건을 이슈별로 먼저 세고, issue 를 붙인 뒤 정렬 · 자르기를 바깥에서 한 번 한다(Jira 194).
    // AGGREGATE 처럼 issue 를 먼저 엮으면 집계 앞 정렬이 행마다 제목 · 요약을 달고 가서, 운영(1만 1천 행)에서 정렬 메모리를 넘겨 디스크를 썼다.
    // 수 · 기간 · 순서는 AGGREGATE 와 같다(운영 11-12 에 정렬 2 × 분야 6 × 크기 4 의 모든 쪽을 견줘 같음). 이슈 밖 사건(issue_id 가 빈)은
    // issue 와 붙지 않아 어차피 빠지지만 집계 일을 덜려고 미리 뺀다. 자른 뒤에 issue 를 붙이면 그 묶음이 칸을 먹는다(CategoryIssueQueryTest)
    //
    // 🔴 **사이트는 이 모양을 쓰지 않는다.** QUERY_MIN_PUBLIC_ARTICLES=3 이라 threshold.isOff() 가 늘 false 여서
    // 아래 LIST_WITH_THRESHOLD 로 간다(findCards 의 삼항). 이 상수를 지키는 CategoryIssueQueryTest 도 기본값 1 로 돌아
    // 여기만 검사한다 — **A2 를 고칠 때 여기만 고치면 시험은 전부 초록인데 사이트는 안 고쳐진다.** 둘을 같이 고친다.
    // 하나로 합치는 것은 Jira S15P31A102-210 (발표 뒤) — 문턱 1 이면 두 질의의 결과가 같다
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
                having count(distinct e.id) >= :minPublicEvents
                    and count(distinct e.id) filter (where e.role = 'MAIN') >= :minMainEvents
            ) c
            join issue i on i.id = c.issue_id
            order by case when :sort = 'createdAt' then i.created_at else c.last_event_at end desc nulls last,
                i.id desc
            limit :limit offset :offset
            """;
    // 문턱이 2 이상일 때 쓰는 모양. 사건마다 공개 기사를 창 함수로 한 번에 세고 걸러 낸다 —
    // 상관 서브쿼리 모양은 이 질의에서만 SubPlan 을 1,434번 돌리고 JIT 까지 켜져 2배 가까이 느렸다
    // (2026-11-14 운영 실행 계획: 지금 33.9 ms · 창 함수 42.3 ms · offset 모양 74.0 ms).
    // 문턱 1 이면 LIST 를 그대로 써서 지금과 같은 계획으로 돈다
    private static final String LIST_WITH_THRESHOLD = """
            select i.id, i.title, i.summary, i.created_at,
                c.event_count, c.article_count, c.publisher_count, c.first_event_at, c.last_event_at
            from (
                select x.issue_id,
                    count(distinct x.id) as event_count, count(distinct x.aid) as article_count,
                    count(distinct x.press_code) as publisher_count,
                    min(x.occurred_at) as first_event_at, max(x.occurred_at) as last_event_at
                from (
                    select e.id, e.issue_id, e.occurred_at, e.role, a.id as aid, a.press_code,
                        count(*) over (partition by e.id) as public_articles
                    from event e
                    join article_event ae on ae.event_id = e.id
                    join article a on a.id = ae.article_id and a.released_at is not null
                    where e.issue_id is not null and (:category is null or exists (
                        select 1 from issue_category ic where ic.issue_id = e.issue_id and ic.category_code = :category))
                ) x
                where x.public_articles >= :minPublicArticles
                group by x.issue_id
                having count(distinct x.id) >= :minPublicEvents
                    and count(distinct x.id) filter (where x.role = 'MAIN') >= :minMainEvents
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
    private final PublicEventThreshold threshold;

    public IssueQueryRepository(JdbcClient jdbc, PublicEventThreshold threshold) {
        this.jdbc = jdbc;
        this.threshold = threshold;
    }

    public Page<CardRow> findCards(@Nullable String category, String sort, Pageable pageable) {
        long total = jdbc.sql("select count(*) from issue i where " + PublicEventSql.ISSUE_HAS_ENOUGH_PUBLIC_EVENTS
                        + " and " + PublicEventSql.ISSUE_HAS_ENOUGH_MAIN_EVENTS + " and " + CATEGORY_FILTER)
                .param("category", category, Types.VARCHAR)
                .param("publicArticleSkip", threshold.skip())
                .param("publicEventSkip", threshold.eventSkip())
                .param("minMainEvents", threshold.minMainEvents())
                .param("mainEventSkip", threshold.mainEventSkip())
                .query(Long.class)
                .single();
        // 수를 세는 질의와 행을 가져오는 질의가 따로다 — 둘에 같은 문턱을 묶지 않으면 총수와 쪽이 어긋난다.
        // 사건 수 · 메인 흐름 문턱은 두 모양 모두 having 으로 거르므로 :minPublicEvents · :minMainEvents 를 늘 넣는다
        // (안 넣으면 첫 요청에서 깨진다). 메인 흐름은 count(distinct …) filter 라 끔(0)이면 늘 참이다
        List<CardRow> rows = jdbc.sql(threshold.isOff() ? LIST : LIST_WITH_THRESHOLD)
                .param("category", category, Types.VARCHAR)
                .param("minPublicArticles", threshold.minArticles())
                .param("minPublicEvents", threshold.minEvents())
                .param("minMainEvents", threshold.minMainEvents())
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
                .param("publicArticleSkip", threshold.skip())
                .query(IssueQueryRepository::mapCard)
                .optional();
    }

    public List<CardRow> findCardsByIds(List<Long> issueIds) {
        if (issueIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(AGGREGATE + " where i.id in (:ids) group by i.id")
                .param("ids", issueIds)
                .param("publicArticleSkip", threshold.skip())
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
                .param("publicArticleSkip", threshold.skip())
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
