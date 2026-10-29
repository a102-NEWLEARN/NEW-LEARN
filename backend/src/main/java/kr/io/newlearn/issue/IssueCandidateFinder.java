package kr.io.newlearn.issue;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import kr.io.newlearn.event.CandidateEventFinder;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

// ISSUE 단계의 후보 — 붙일지도 모르는 이슈와, 새 이슈로 같이 묶을지도 모르는 이슈 밖 사건 (Jira 40, docs/api-internal.md 4절)
// 이번 사건을 만든 기사 벡터와 사건에 묶인 기사 벡터의 코사인 거리(<=>)를 판정 후보(CandidateEventFinder)처럼 정확 검색으로 잰다.
// 사건은 그 사건 기사 중, 이슈는 그 이슈 사건들의 기사 중 가장 가까운 것으로 대표한다. 기사는 이번 사건이 생길 때까지 묶인 것만 —
// 판정 줄이 앞서 나가 나중에 붙인 기사까지 재면 판정이 얼마나 앞섰느냐에 따라 후보가 달라진다
@Repository
public class IssueCandidateFinder {

    // 시작값이다. 늘리면 프롬프트가 길어진다(GMS 비용)
    static final int ISSUE_LIMIT = 5;
    static final int EVENTS_PER_ISSUE = 5;
    static final int EVENT_LIMIT = 10;

    private final JdbcClient jdbc;

    public IssueCandidateFinder(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // analysis_job.candidates 에 이 모양 그대로 남긴다 — 결과가 후보 안인지 이것으로 본다
    public record Candidates(List<CandidateIssue> issues, List<CandidateEvent> events) {

        public boolean hasIssue(long issueId) {
            return issues.stream().anyMatch(candidate -> candidate.issueId() == issueId);
        }

        public boolean hasEvent(long eventId) {
            return events.stream().anyMatch(candidate -> candidate.eventId() == eventId);
        }
    }

    public record CandidateIssue(long issueId, double similarity) {}

    public record CandidateEvent(long eventId, double similarity) {}

    // ISSUE 작업의 사건 — 그 작업의 기사가 만든 사건, 지금 든 이슈(이슈 밖이면 null), 그 기사를 묶은 때(= 사건이 생긴 때)
    public record OwnEvent(long id, @Nullable Long issueId, Instant linkedAt) {}

    // 이슈의 최근 사건 하나 — 메시지의 candidateIssues[].events
    public record RecentEvent(long issueId, String title, String label, Instant occurredAt) {}

    // analysis_job.candidates 칸 읽기 — 메시지(IssueMessageFactory)와 결과(IssueResultHandler)가 같이 쓴다. 비면 아직 고르지 않았다
    public static Candidates read(JsonMapper jsonMapper, @Nullable String candidates) {
        return candidates == null
                ? new Candidates(List.of(), List.of())
                : jsonMapper.readValue(candidates, Candidates.class);
    }

    // 기사 하나는 사건 하나에만 속한다(article_event 기본 키). ISSUE 작업의 기사는 그 사건을 만든 기사다(판정 NEW)
    public Optional<OwnEvent> ownEvent(long articleId) {
        return jdbc.sql("""
                select e.id, e.issue_id, l.linked_at from article_event l
                join event e on e.id = l.event_id
                where l.article_id = :articleId
                """)
                .param("articleId", articleId)
                .query((rs, row) -> new OwnEvent(
                        rs.getLong("id"),
                        rs.getObject("issue_id", Long.class),
                        rs.getObject("linked_at", OffsetDateTime.class).toInstant()))
                .optional();
    }

    // 후보 이슈 가까운 순서로 최대 5개, 이슈 밖이고 이번 사건보다 먼저 생긴(번호가 작은) 사건 가까운 순서로 최대 10개.
    // 나중에 생긴 사건과 asOf(이번 사건이 생긴 때) 뒤에 묶인 기사를 빼는 까닭: ISSUE 는 사건이 생긴 순서로 하나씩 돌아
    // 「그때까지」만 봐야 다시 돌려도 결과가 같다(발행순 재실행, 2026-10-29 사용자). 벡터가 없으면 빈 목록
    public Candidates find(long articleId, long eventId, Instant asOf) {
        List<CandidateIssue> issues = jdbc.sql("""
                select e.issue_id, min(other.embedding <=> mine.embedding) as distance
                from event e
                join article_event l on l.event_id = e.id
                join article_embedding other on other.article_id = l.article_id
                cross join (select embedding from article_embedding where article_id = :articleId) mine
                where e.issue_id is not null and l.linked_at <= :asOf
                group by e.issue_id
                order by distance, e.issue_id
                limit :limit
                """)
                .param("articleId", articleId)
                .param("asOf", asOf.atOffset(ZoneOffset.UTC))
                .param("limit", ISSUE_LIMIT)
                .query((rs, row) -> new CandidateIssue(
                        rs.getLong("issue_id"), CandidateEventFinder.similarity(rs.getDouble("distance"))))
                .list();
        List<CandidateEvent> events = jdbc.sql("""
                select e.id, min(other.embedding <=> mine.embedding) as distance
                from event e
                join article_event l on l.event_id = e.id
                join article_embedding other on other.article_id = l.article_id
                cross join (select embedding from article_embedding where article_id = :articleId) mine
                where e.issue_id is null and e.id < :eventId and l.linked_at <= :asOf
                group by e.id
                order by distance, e.id
                limit :limit
                """)
                .param("articleId", articleId)
                .param("eventId", eventId)
                .param("asOf", asOf.atOffset(ZoneOffset.UTC))
                .param("limit", EVENT_LIMIT)
                .query((rs, row) ->
                        new CandidateEvent(rs.getLong("id"), CandidateEventFinder.similarity(rs.getDouble("distance"))))
                .list();
        return new Candidates(issues, events);
    }

    // 이슈마다 최근 사건 5개를 발생 시점 순서로(오래된 것부터). 사건이 많은 이슈도 프롬프트 길이가 일정하게. 이슈 여러 개를 쿼리 하나로
    public Map<Long, List<RecentEvent>> recentEvents(Collection<Long> issueIds) {
        if (issueIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("""
                select issue_id, title, label, occurred_at from (
                    select issue_id, title, label, occurred_at, id,
                           row_number() over (partition by issue_id order by occurred_at desc, id desc) as recent
                    from event where issue_id in (:issueIds)
                ) ranked
                where recent <= :limit
                order by issue_id, occurred_at, id
                """)
                .param("issueIds", issueIds)
                .param("limit", EVENTS_PER_ISSUE)
                .query((rs, row) -> new RecentEvent(
                        rs.getLong("issue_id"),
                        rs.getString("title"),
                        rs.getString("label"),
                        rs.getObject("occurred_at", OffsetDateTime.class).toInstant()))
                .list()
                .stream()
                .collect(Collectors.groupingBy(RecentEvent::issueId));
    }
}
