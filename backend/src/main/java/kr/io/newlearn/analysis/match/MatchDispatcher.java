package kr.io.newlearn.analysis.match;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.RequestedBy;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.event.CandidateEventFinder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

// 다음 판정 고르기 — 동일 사건 판정(MATCH_EVENT)을 거는 곳은 여기 한 군데다 (Jira 35, docs/api-internal.md 3절)
// 한 번에 하나씩, 고를 수 있는 기사 중 발행 시각이 가장 이른 것부터. 같은 사건 기사 둘이 동시에 판정되면 서로를 후보로 못 봐
// 사건이 둘로 갈라진다. 처리기 안에서 걸지 않고 커밋이 끝난 상태만 보고 고른다 — EXTRACT · EMBED 가 동시에 끝나도 한 번만 건다.
// AnalysisJobService 가 W1 을 처리한 뒤와 1분 스케줄러에서 부른다. 이 클래스는 서비스를 모른다(순환 없음)
@Component
public class MatchDispatcher {

    private static final Logger log = LoggerFactory.getLogger(MatchDispatcher.class);

    // 판정 고르기를 줄 세우는 트랜잭션 잠금(pg_advisory_xact_lock)의 키. 이 앱이 쓰는 advisory lock 은 이것 하나다
    static final long LOCK = 35L;

    // 판정이 이만큼 QUEUED 면 멈춘 것으로 보고 WARN. 건강한 판정은 워커 상한(15분) 안에 끝나고, 처리 중 워커가 죽어도
    // 다시 가져가기(20분) + 다른 워커의 처리(15분) 안에 끝난다 (api-internal.md 3절, Jira 130)
    static final Duration STUCK_AFTER = Duration.ofMinutes(40);

    private final JdbcClient jdbc;
    private final AnalysisJobRepository jobs;
    private final ArticleRepository articles;
    private final CandidateEventFinder finder;
    private final JsonMapper jsonMapper;

    MatchDispatcher(
            JdbcClient jdbc,
            AnalysisJobRepository jobs,
            ArticleRepository articles,
            CandidateEventFinder finder,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.articles = articles;
        this.finder = finder;
        this.jsonMapper = jsonMapper;
    }

    // 새로 만든 판정 작업(후보 포함). 진행 중인 판정이 있거나 고를 기사가 없으면 빈 값.
    // 트랜잭션 안에서 부른다 — 잠금이 커밋까지 간다. 큐에 넣는 일은 부른 쪽이 커밋 뒤에 한다
    public Optional<AnalysisJob> next() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("판정 고르기는 트랜잭션 안에서 불러야 한다");
        }
        // API Pod 둘이 같이 골라도 하나씩 고른다. 기사 · 작업 행을 FOR UPDATE 로 잠그지 않는다 — 작업을 넣을 때
        // 외래 키 검사가 기사 행에 KEY SHARE 를 잡을 뿐이라 W1 의 작업 행 잠금 · 기사 공개(UPDATE)와 서로 기다리지 않는다
        jdbc.sql("select 1 from pg_advisory_xact_lock(:key)")
                .param("key", LOCK)
                .query(Integer.class)
                .single();
        Optional<Long> inFlight = jobs.findMatchInFlight();
        if (inFlight.isPresent()) {
            logWaiting(inFlight.get());
            return Optional.empty();
        }
        return jobs.findNextMatchArticle().map(this::create);
    }

    // QUEUED 인 판정에 W1 이 끝내 안 오면(넣은 뒤 메시지를 잃음 · 워커가 W1 없이 ack) 판정 줄 전체가 멈춘다(api-internal.md 3절).
    // 찾을 수 있게 오래된 QUEUED 는 WARN 으로 남긴다 — W1 이 와야 풀리고, 메시지를 잃었으면 손으로 published_at 을 비운다
    private void logWaiting(long jobId) {
        Instant stuckBefore = Instant.now().minus(STUCK_AFTER);
        boolean stuck = jobs.findById(jobId)
                .filter(job -> job.isQueued() && job.getQueuedAt().isBefore(stuckBefore))
                .isPresent();
        if (stuck) {
            log.warn("판정 줄이 멈췄을 수 있다: 판정 작업 {} 이 {}분 넘게 QUEUED", jobId, STUCK_AFTER.toMinutes());
        } else {
            log.info("판정 고르기 기다림: 판정 작업 {}", jobId);
        }
    }

    // 후보는 지금 계산해 작업에 남긴다. 후보가 없어도 건다 — 새 사건의 이름 · 키워드 · 요약은 판정이 짓는다
    private AnalysisJob create(long articleId) {
        List<CandidateEventFinder.Candidate> candidates = finder.nearest(articleId);
        AnalysisJob job = jobs.save(new AnalysisJob(
                articles.getReferenceById(articleId),
                AnalysisStage.MATCH_EVENT,
                RequestedBy.BATCH,
                jsonMapper.writeValueAsString(candidates)));
        log.info("판정 걸기 articleId={} jobId={} 후보={}", articleId, job.getId(), candidates.size());
        return job;
    }
}
