package kr.io.newlearn.event;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

// 동일 사건 판정(MATCH_EVENT)의 후보 사건 (Jira 35, docs/api-internal.md 4절 analysis.match_event)
// 새 기사 벡터와 사건에 묶인 기사 벡터의 코사인 거리(<=>)를 인덱스 없이 정확 검색으로 잰다. 사건마다 가장 가까운 기사로 대표한다
@Repository
public class CandidateEventFinder {

    // 판정 메시지에 싣는 후보 사건 수 — 시작값이다. 늘리면 프롬프트가 길어진다(GMS 비용)
    static final int LIMIT = 5;

    private final JdbcClient jdbc;

    public CandidateEventFinder(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // analysis_job.candidates 에 이 모양 그대로 남긴다 — 다시 걸 때 같은 후보로 메시지를 다시 만든다
    public record Candidate(long eventId, double similarity) {}

    // analysis_job.candidates 칸 읽기 — 판정 메시지(MatchEventMessageFactory)와 판정 결과(후보 안인가)가 같이 쓴다
    public static List<Candidate> read(JsonMapper jsonMapper, @Nullable String candidates) {
        return candidates == null ? List.of() : List.of(jsonMapper.readValue(candidates, Candidate[].class));
    }

    // 가까운 순서로 최대 5개. 벡터가 없거나 묶인 기사가 없으면 빈 목록
    public List<Candidate> nearest(long articleId) {
        return jdbc.sql("""
                select l.event_id, min(other.embedding <=> mine.embedding) as distance
                from article_event l
                join article_embedding other on other.article_id = l.article_id
                cross join (select embedding from article_embedding where article_id = :articleId) mine
                group by l.event_id
                order by distance, l.event_id
                limit :limit
                """)
                .param("articleId", articleId)
                .param("limit", LIMIT)
                .query((rs, row) -> new Candidate(rs.getLong("event_id"), similarity(rs.getDouble("distance"))))
                .list();
    }

    // 사건마다 가장 먼저 묶인 기사(사건 → 기사) — 후보 근거를 이 기사의 대표 잎에서 꺼낸다. 사건 여러 개를 쿼리 하나로
    public Map<Long, Long> firstArticleIds(Collection<Long> eventIds) {
        if (eventIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("""
                select distinct on (event_id) event_id, article_id from article_event
                where event_id in (:eventIds)
                order by event_id, linked_at, article_id
                """)
                .param("eventIds", eventIds)
                .query((rs, row) -> Map.entry(rs.getLong("event_id"), rs.getLong("article_id")))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    // 1 − 코사인 거리를 0 ~ 1 로 자른다. 영벡터는 거리가 NaN 이라 0. ISSUE 후보(IssueCandidateFinder)도 같이 쓴다
    public static double similarity(double distance) {
        double similarity = 1 - distance;
        return Double.isNaN(similarity) ? 0 : Math.clamp(similarity, 0.0, 1.0);
    }
}
