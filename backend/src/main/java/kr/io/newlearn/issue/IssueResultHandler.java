package kr.io.newlearn.issue;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisResultHandler;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.Judgment;
import kr.io.newlearn.analysis.ResultConflictException;
import kr.io.newlearn.analysis.ResultFields;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.event.EventRepository;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// W1 ISSUE 결과 — 새 사건을 고른 이슈에 붙이거나(ATTACH), 이슈 밖 사건들과 새 이슈를 만들거나(CREATE), 그대로 둔다(NONE)
// (Jira 40, docs/api-internal.md 5절). AnalysisJobService.receiveResult 가 작업 행을 잠근 트랜잭션 안에서 부른다.
// 잠금 순서는 작업 행 → 사건 행(UPDATE) → 이슈 행이다. 판정 W1 은 작업 행 → 사건 행 하나라 서로 기다릴 수는 있어도 교착은 없다.
// 그사이 사건이 다른 이슈에 들어갔거나 고른 이슈가 없어졌으면 ResultConflictException — 이 트랜잭션이 되돌아가고 409 다
@Component
class IssueResultHandler implements AnalysisResultHandler {

    private static final Logger log = LoggerFactory.getLogger(IssueResultHandler.class);

    private final IssueRepository issues;
    private final IssueCategoryRepository categories;
    private final EventRepository events;
    private final IssueCandidateFinder finder;
    private final JsonMapper jsonMapper;

    IssueResultHandler(
            IssueRepository issues,
            IssueCategoryRepository categories,
            EventRepository events,
            IssueCandidateFinder finder,
            JsonMapper jsonMapper) {
        this.issues = issues;
        this.categories = categories;
        this.events = events;
        this.finder = finder;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public AnalysisStage stage() {
        return AnalysisStage.ISSUE;
    }

    @Override
    public void save(AnalysisJob job, JobResultRequest request) {
        ResultFields.storableEnvelope(request.model(), "model");
        ResultFields.storableEnvelope(request.promptVersion(), "promptVersion");
        // 성공인데 result 가 없으면 receiveResult 가 problem() 으로 먼저 거절했다
        IssueResult result = IssueResult.read(request.result());
        long articleId = job.getArticle().getId();
        long eventId = finder.ownEvent(articleId)
                .orElseThrow(() -> new ResultConflictException("ISSUE 작업의 기사에 사건이 없다: " + articleId))
                .id();
        IssueCandidateFinder.Candidates sent = IssueCandidateFinder.read(jsonMapper, job.getCandidates());
        Instant now = Instant.now();
        // read 가 ATTACH 면 issueId · issueSummary 를, CREATE 면 eventIds · issueTitle · issueSummary 를 채운다
        @Nullable
        Long issueId = switch (result.decision()) {
            case ATTACH ->
                attach(
                        sent,
                        eventId,
                        Objects.requireNonNull(result.issueId()),
                        Objects.requireNonNull(result.issueSummary()),
                        now);
            case CREATE ->
                create(
                        sent,
                        eventId,
                        result.eventIds(),
                        Objects.requireNonNull(result.issueTitle()),
                        Objects.requireNonNull(result.issueSummary()),
                        now);
            case NONE -> null;
        };
        job.recordResult(
                jsonMapper.writeValueAsString(new Judgment(result.reason(), request.model(), request.promptVersion())));
        log.info(
                "ISSUE 저장 articleId={} jobId={} eventId={} decision={} issueId={}",
                articleId,
                job.getId(),
                eventId,
                result.decision(),
                issueId);
    }

    // 보낸 후보 안의 이슈여야 한다 — 후보 밖이면 엉뚱한 이슈를 지어냈거나 옛 메시지다. 이름은 그대로, 요약만 덮어쓴다
    private long attach(IssueCandidateFinder.Candidates sent, long eventId, long issueId, String summary, Instant now) {
        if (!sent.hasIssue(issueId)) {
            throw new ResultSchemaInvalidException("issueId 가 보낸 후보에 없다: " + issueId);
        }
        Issue issue =
                issues.findById(issueId).orElseThrow(() -> new ResultConflictException("고른 이슈가 그사이 없어졌다: " + issueId));
        assign(issueId, List.of(eventId), now);
        issue.rewriteSummary(summary);
        refreshCategory(issueId);
        return issueId;
    }

    // 이번 사건을 꼭 넣고, 나머지는 보낸 후보 사건 중에서. 사건 수(3개 이상) · 중복은 IssueResult.read 가 봤다
    private long create(
            IssueCandidateFinder.Candidates sent,
            long eventId,
            List<Long> eventIds,
            String title,
            String summary,
            Instant now) {
        if (!eventIds.contains(eventId)) {
            throw new ResultSchemaInvalidException("eventIds 에 이번 사건이 없다: " + eventId);
        }
        for (long chosen : eventIds) {
            if (chosen != eventId && !sent.hasEvent(chosen)) {
                throw new ResultSchemaInvalidException("eventIds 의 사건이 보낸 후보에 없다: " + chosen);
            }
        }
        Issue issue = issues.save(new Issue(title, summary));
        assign(issue.getId(), eventIds, now);
        refreshCategory(issue.getId());
        return issue.getId();
    }

    // 아직 이슈 밖인 사건만 넣는다. 하나라도 그사이 다른 이슈에 들어갔으면 충돌 — 이 트랜잭션이 되돌아가 새 이슈도 남지 않는다
    private void assign(long issueId, List<Long> eventIds, Instant now) {
        int changed = events.assignIssue(issueId, eventIds, now);
        if (changed != eventIds.size()) {
            throw new ResultConflictException("그사이 다른 이슈에 들어간 사건이 있다: " + eventIds);
        }
    }

    private void refreshCategory(long issueId) {
        categories.clear(issueId);
        categories.fillMostCommon(issueId);
    }
}
