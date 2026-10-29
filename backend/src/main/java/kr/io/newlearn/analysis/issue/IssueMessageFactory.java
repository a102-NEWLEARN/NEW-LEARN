package kr.io.newlearn.analysis.issue;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.queue.AnalysisMessageFactory;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.event.Event;
import kr.io.newlearn.event.EventRepository;
import kr.io.newlearn.issue.Issue;
import kr.io.newlearn.issue.IssueCandidateFinder;
import kr.io.newlearn.issue.IssueRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// analysis.issue 메시지 (Jira 40, docs/api-internal.md 4절). 후보는 작업의 candidates 칸에서 읽는다 — 못 넣은 작업을 다시 넣을 때도
// 고를 때 계산한 후보 그대로 만든다. 다시 걸 때(attempt + 1)는 후보를 비워 고르기(IssueDispatcher)에 돌려보낸다
@Component
class IssueMessageFactory implements AnalysisMessageFactory {

    private final JsonMapper jsonMapper;
    private final EventRepository events;
    private final IssueRepository issues;
    private final IssueCandidateFinder finder;

    IssueMessageFactory(
            JsonMapper jsonMapper, EventRepository events, IssueRepository issues, IssueCandidateFinder finder) {
        this.jsonMapper = jsonMapper;
        this.events = events;
        this.issues = issues;
        this.finder = finder;
    }

    @Override
    public Set<AnalysisStage> stages() {
        return Set.of(AnalysisStage.ISSUE);
    }

    @Override
    public String payload(List<AnalysisJob> jobs) {
        if (jobs.size() != 1) {
            throw new IllegalArgumentException("ISSUE 메시지에는 작업 하나만 싣는다");
        }
        AnalysisJob job = jobs.getFirst();
        long articleId = job.getArticle().getId();
        // 고르기가 사건이 있는 작업만 고른다
        long eventId = finder.ownEvent(articleId)
                .orElseThrow(() -> new IllegalStateException("ISSUE 작업의 기사에 사건이 없다: " + articleId))
                .id();
        Event own = events.findById(eventId).orElseThrow();
        IssueCandidateFinder.Candidates picked = IssueCandidateFinder.read(jsonMapper, job.getCandidates());
        return jsonMapper.writeValueAsString(new IssueMessage(
                articleId,
                job.getId(),
                job.getAttempt(),
                new EventInfo(
                        own.getId(),
                        own.getTitle(),
                        own.getLabel(),
                        own.getSummary(),
                        ApiTime.toKst(own.getOccurredAt())),
                candidateIssues(picked),
                candidateEvents(picked)));
    }

    // 다시 걸 때는 큐에 바로 넣지 않는다 — 후보를 비워 대기 작업으로 돌려보내면 고르기가 다시 골라(앞 작업은 모두 끝나 번호가
    // 가장 작다) 그때 후보를 새로 계산한다. 그사이 이슈가 생기고 사건이 묶여 처음 후보는 낡는다 (api-internal.md 4절)
    @Override
    public boolean requeueNow(AnalysisJob job) {
        job.clearCandidates();
        return false;
    }

    // candidates 칸 순서(가까운 순서) 그대로. 없어진 이슈는 뺀다. 이슈가 몇 개든 쿼리는 둘이다 — 이슈, 이슈마다 최근 사건
    private List<CandidateIssue> candidateIssues(IssueCandidateFinder.Candidates picked) {
        List<Long> ids = picked.issues().stream()
                .map(IssueCandidateFinder.CandidateIssue::issueId)
                .toList();
        Map<Long, Issue> byId =
                issues.findAllById(ids).stream().collect(Collectors.toMap(Issue::getId, Function.identity()));
        Map<Long, List<IssueCandidateFinder.RecentEvent>> recent = finder.recentEvents(ids);
        List<CandidateIssue> candidates = new ArrayList<>();
        for (IssueCandidateFinder.CandidateIssue candidate : picked.issues()) {
            Issue issue = byId.get(candidate.issueId());
            if (issue == null) {
                continue;
            }
            List<IssueEvent> recentEvents = recent.getOrDefault(issue.getId(), List.of()).stream()
                    .map(event -> new IssueEvent(event.title(), event.label(), ApiTime.toKst(event.occurredAt())))
                    .toList();
            candidates.add(new CandidateIssue(issue.getId(), issue.getTitle(), issue.getSummary(), recentEvents));
        }
        return candidates;
    }

    // candidates 칸 순서(가까운 순서) 그대로. 없어진 사건은 뺀다
    private List<CandidateEvent> candidateEvents(IssueCandidateFinder.Candidates picked) {
        List<Long> ids = picked.events().stream()
                .map(IssueCandidateFinder.CandidateEvent::eventId)
                .toList();
        Map<Long, Event> byId =
                events.findAllById(ids).stream().collect(Collectors.toMap(Event::getId, Function.identity()));
        List<CandidateEvent> candidates = new ArrayList<>();
        for (IssueCandidateFinder.CandidateEvent candidate : picked.events()) {
            Event event = byId.get(candidate.eventId());
            if (event == null) {
                continue;
            }
            candidates.add(new CandidateEvent(
                    event.getId(),
                    event.getTitle(),
                    event.getLabel(),
                    event.getSummary(),
                    ApiTime.toKst(event.getOccurredAt()),
                    candidate.similarity()));
        }
        return candidates;
    }

    record IssueMessage(
            long articleId,
            long jobId,
            int attempt,
            EventInfo event,
            List<CandidateIssue> candidateIssues,
            List<CandidateEvent> candidateEvents) {}

    // 이번에 새로 생긴 사건
    record EventInfo(
            long id, String title, String label, @Nullable String summary, OffsetDateTime occurredAt) {}

    // 붙일지도 모르는 이슈. events 는 최근 사건 5개를 발생 시점 순서로
    record CandidateIssue(
            long issueId, String title, @Nullable String summary, List<IssueEvent> events) {}

    record IssueEvent(String title, String label, OffsetDateTime occurredAt) {}

    // 새 이슈로 같이 묶을지도 모르는 이슈 밖 사건
    record CandidateEvent(
            long eventId,
            String title,
            String label,
            @Nullable String summary,
            OffsetDateTime occurredAt,
            double similarity) {}
}
