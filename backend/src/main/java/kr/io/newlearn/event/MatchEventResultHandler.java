package kr.io.newlearn.event;

import java.time.Instant;
import java.util.Objects;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisResultHandler;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.Judgment;
import kr.io.newlearn.analysis.RequestedBy;
import kr.io.newlearn.analysis.ResultFields;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.mindmap.ArticleMindmap;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// W1 MATCH_EVENT 결과 — 기사를 고른 사건에 붙이거나, 새 사건을 만들어 붙인다 (Jira 35, docs/api-internal.md 5절)
// AnalysisJobService.receiveResult 가 작업 행을 잠근 트랜잭션 안에서 부른다. 판정은 한 번에 하나씩이라(MatchDispatcher)
// 판정끼리 같은 사건을 두고 다투지 않는다. 잠금 순서는 작업 행 → 사건 행이다 — 시점을 당길 때(pullOccurredAt) 사건 행을
// UPDATE 로 잠그고, 연결 · ISSUE 작업을 넣을 때 외래 키 검사가 기사 · 사건 행에 KEY SHARE 를 잡는다.
// 이슈 붙이기(IssueResultHandler, Jira 40)도 같은 순서로 사건 행을 고친다(AnalysisResultHandler 의 잠금 순서)
@Component
class MatchEventResultHandler implements AnalysisResultHandler {

    private static final Logger log = LoggerFactory.getLogger(MatchEventResultHandler.class);

    private final EventRepository events;
    private final ArticleEventRepository links;
    private final ArticleMindmapRepository mindmaps;
    private final AnalysisJobRepository jobs;
    private final JsonMapper jsonMapper;

    MatchEventResultHandler(
            EventRepository events,
            ArticleEventRepository links,
            ArticleMindmapRepository mindmaps,
            AnalysisJobRepository jobs,
            JsonMapper jsonMapper) {
        this.events = events;
        this.links = links;
        this.mindmaps = mindmaps;
        this.jobs = jobs;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public AnalysisStage stage() {
        return AnalysisStage.MATCH_EVENT;
    }

    @Override
    public void save(AnalysisJob job, JobResultRequest request) {
        ResultFields.storableEnvelope(request.model(), "model");
        ResultFields.storableEnvelope(request.promptVersion(), "promptVersion");
        // 성공인데 result 가 없으면 receiveResult 가 problem() 으로 먼저 거절했다
        var match = MatchEventResult.read(request.result());
        Article article = job.getArticle();
        // read 가 EXISTING 이면 eventId 를, NEW 면 newEvent 를 채운다
        Resolved resolved = switch (match.decision()) {
            case EXISTING -> new Resolved(attach(job, article, Objects.requireNonNull(match.eventId())), false);
            case NEW -> create(job, article, Objects.requireNonNull(match.newEvent()));
        };
        Event event = resolved.event();
        links.save(new ArticleEvent(article, event));
        if (resolved.born()) {
            // 새 사건만 이슈에 붙일지 묻는다(api-internal.md 3절). 큐에는 넣지 않는다 — 「걸 차례를 기다리는」 표시다.
            // ISSUE 도 한 번에 하나씩이라 고르기(IssueDispatcher, Jira 40)가 이 작업을 하나씩 골라 그때 후보를 계산해 넣는다
            jobs.save(new AnalysisJob(article, AnalysisStage.ISSUE, RequestedBy.BATCH, null));
        }
        job.recordResult(
                jsonMapper.writeValueAsString(new Judgment(match.reason(), request.model(), request.promptVersion())));
        log.info(
                "판정 저장 articleId={} jobId={} decision={} eventId={}",
                article.getId(),
                job.getId(),
                match.decision(),
                event.getId());
    }

    // 보낸 후보 안의 사건이어야 한다 — 후보 밖이면 판정이 엉뚱한 사건을 지어냈거나 옛 메시지다
    // 이름 · 키워드 · 요약은 처음 지은 그대로 둔다(api-internal.md 5절). 발생 시점만 더 이른 기사면 당긴다
    private Event attach(AnalysisJob job, Article article, long eventId) {
        if (!sent(job, eventId)) {
            throw new ResultSchemaInvalidException("eventId 가 보낸 후보에 없다: " + eventId);
        }
        events.pullOccurredAt(eventId, article.getPublishedAt(), OccurredAtBasis.FIRST_PUBLISHED, Instant.now());
        return events.getReferenceById(eventId);
    }

    // 새로 태어난 사건인지(born) — 태어났을 때만 이슈에 붙일지 묻는다
    private record Resolved(Event event, boolean born) {}

    // 발생 시점 = EXTRACT 가 뽑은 시점, 없으면 이 기사의 발행 시각(FIRST_PUBLISHED) (api-internal.md 5절)
    // 반응 대상 사건 번호도 보낸 후보 안이어야 한다. 선택 값이라 밖이면 400 대신 버리고 경고만 남긴다(Jira 134, AI 팀장 제안)
    private Resolved create(AnalysisJob job, Article article, MatchEventResult.NewEvent created) {
        @Nullable Long target = created.reactsToEventId();
        if (target != null && !sent(job, target)) {
            log.warn("반응 대상 사건 번호가 보낸 후보에 없어 null 로 받는다: 판정 작업 {} reactsToEventId={}", job.getId(), target);
            target = null;
        }
        @Nullable
        Instant extracted = mindmaps.findById(article.getId())
                .map(ArticleMindmap::getOccurredAt)
                .orElse(null);
        Instant occurredAt = extracted == null ? article.getPublishedAt() : extracted;
        OccurredAtBasis basis = extracted == null ? OccurredAtBasis.FIRST_PUBLISHED : OccurredAtBasis.EXTRACTED;
        // 같은 날 이름이 글자까지 같은 사건이 이미 있으면 새로 만들지 않고 거기 붙인다(Jira 211).
        // 후보가 기사 유사도 top-5 라 맞는 사건이 밀려나면 모델은 그 사건을 보지 못한 채 NEW 로만 답할 수 있다 —
        // 그 결과가 화면에서 점 둘로 보인다. 까닭과 「같은 날」을 보는 이유는 EventRepository.findSameDayTwin
        var twin = events.findSameDayTwin(created.title(), occurredAt);
        if (twin.isPresent()) {
            long twinId = twin.get().getId();
            log.warn(
                    "같은 날 이름이 같은 사건이 있어 새로 만들지 않고 붙인다: articleId={} jobId={} eventId={} title={}",
                    article.getId(),
                    job.getId(),
                    twinId,
                    created.title());
            // 붙이는 쪽과 같은 규칙으로 시점만 당긴다(EXISTING 과 같음). 이름 · 키워드 · 요약은 처음 지은 그대로 둔다
            events.pullOccurredAt(twinId, article.getPublishedAt(), OccurredAtBasis.FIRST_PUBLISHED, Instant.now());
            return new Resolved(events.getReferenceById(twinId), false);
        }
        return new Resolved(
                events.save(new Event(
                        created.title(),
                        created.label(),
                        created.summary(),
                        occurredAt,
                        basis,
                        created.role(),
                        created.reactsTo(),
                        target)),
                true);
    }

    private boolean sent(AnalysisJob job, long eventId) {
        return CandidateEventFinder.read(jsonMapper, job.getCandidates()).stream()
                .anyMatch(candidate -> candidate.eventId() == eventId);
    }
}
