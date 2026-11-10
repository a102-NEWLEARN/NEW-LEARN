package kr.io.newlearn.ingest;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.ingest.dto.ReleaseCandidatesResponse;
import kr.io.newlearn.ingest.dto.ReleaseCandidatesResponse.Candidate;
import kr.io.newlearn.ingest.dto.ReleaseCandidatesResponse.Extract;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

// B3 자동 투입 판단 자료 — 오늘 건 수 · EXTRACT 상태 · 후보를 읽기만 한다 (docs/api-internal.md 2절, Jira 156)
// 몫 계산과 B1 걸기는 수집 배치가 한다(infra/k8s/services/ingest/news_ingest.py). 배치는 DB 에 직접 붙지 않아 여기서 센다
// 세는 법은 AI 팀장 쿼리(infra/server/b1-state.sql, 2026-11-10)와 같다 — 한쪽을 바꾸면 다른 쪽도
@Component
public class ReleaseCandidateQuery {

    // 오늘 건 수 · EXTRACT 상태 — 한 문장이라 같은 순간을 센다
    // 오늘 건 수: 오늘(KST) 처음 만들어진 EXTRACT 작업. 재시도는 같은 행이라 다시 세지 않는다.
    //   적재 작업은 created_at 이 마인드맵 생성 시각이라(classified-load.sql 8번) 11/12 에 만든 것이 섞일 수 있어
    //   기사 발행이 publishedFrom 이후인 것만 센다
    // 대기: QUEUED(처리 중 포함) + 다시 걸 예정인 FAILED(retry_at 있음). 가장 오래 기다림은 QUEUED 만
    // 최근 15분: 끝난 시각(W1 의 finishedAt)으로 성공 · 실패를 따로 — 실패도 finished_at 을 채운다
    private static final String STATE = """
            select
                (select count(*)
                 from analysis_job j
                 join article a on a.id = j.article_id
                 where j.stage = 'EXTRACT'
                   and j.created_at >= date_trunc('day', statement_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                   and a.published_at >= :from) as released_today,
                count(*) filter (where status = 'QUEUED') as queued,
                count(*) filter (where status = 'FAILED' and retry_at is not null) as retry_pending,
                min(queued_at) filter (where status = 'QUEUED') as oldest_queued_at,
                count(*) filter (where status = 'SUCCEEDED'
                                   and finished_at >= statement_timestamp() - interval '15 minutes') as succeeded_15m,
                count(*) filter (where status = 'FAILED'
                                   and finished_at >= statement_timestamp() - interval '15 minutes') as failed_15m
            from analysis_job
            where stage = 'EXTRACT'
            """;

    // 후보: 발행이 publishedFrom 이후 · 공개 전 · 작업 행 없음 · 사건 연결 없음 · 라벨 행 없음.
    // 라벨은 공개된 기사에 붙이고 숨긴 T · C 와 적재가 넣는 사건 기사는 작업 행이 있다 — 이 범위에 라벨 행이 있으면 손으로 넣은
    // X(잘못된 본문)뿐이라 코드를 보지 않고 행이 있으면 뺀다. 라벨 표는 인프라 SQL 이 만든다(infra/server/category-labels.md)
    // 넣은 시각 최신 순 — 그 회차가 방금 넣은 기사가 맨 앞, 그다음 지난 회차에 못 건 기사가 최근부터(AI 팀장 2026-11-10)
    private static final String CANDIDATES = """
            select a.id, a.published_at
            from article a
            where a.published_at >= :from
              and a.released_at is null
              and not exists (select 1 from analysis_job j where j.article_id = a.id)
              and not exists (select 1 from article_event l where l.article_id = a.id)
              and not exists (select 1 from category_label.article_label c where c.url = a.url)
            order by a.created_at desc, a.id desc
            limit :limit
            """;

    private final JdbcClient jdbc;

    ReleaseCandidateQuery(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // publishedFrom 은 KST 날짜 — 그날 0시(KST)부터
    @Transactional(readOnly = true)
    public ReleaseCandidatesResponse read(LocalDate publishedFrom, int limit) {
        // timestamptz 로 넘긴다 — pgjdbc 는 OffsetDateTime 을 오프셋째 보낸다
        OffsetDateTime from =
                publishedFrom.atStartOfDay(ApiTime.KST).toInstant().atOffset(ZoneOffset.UTC);
        State state = jdbc.sql(STATE)
                .param("from", from)
                .query(ReleaseCandidateQuery::state)
                .single();
        List<Candidate> candidates = jdbc.sql(CANDIDATES)
                .param("from", from)
                .param("limit", limit)
                .query((rs, row) -> new Candidate(rs.getLong("id"), ApiTime.toKst(instant(rs, "published_at"))))
                .list();
        return new ReleaseCandidatesResponse(state.releasedToday(), state.extract(), candidates);
    }

    private record State(long releasedToday, Extract extract) {}

    private static State state(ResultSet rs, int row) throws SQLException {
        Extract extract = new Extract(
                rs.getLong("queued"),
                rs.getLong("retry_pending"),
                ApiTime.toKst(nullableInstant(rs, "oldest_queued_at")),
                rs.getLong("succeeded_15m"),
                rs.getLong("failed_15m"));
        return new State(rs.getLong("released_today"), extract);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Instant value = nullableInstant(rs, column);
        if (value == null) {
            throw new IllegalStateException(column + " 이 비어 있다");
        }
        return value;
    }

    private static @Nullable Instant nullableInstant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
