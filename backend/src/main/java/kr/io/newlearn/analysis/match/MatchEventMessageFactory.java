package kr.io.newlearn.analysis.match;

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
import kr.io.newlearn.article.Article;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.event.CandidateEventFinder;
import kr.io.newlearn.event.Event;
import kr.io.newlearn.event.EventRepository;
import kr.io.newlearn.mindmap.ArticleMindmap;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import kr.io.newlearn.mindmap.MindmapContent;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// analysis.match_event 메시지 (Jira 35, docs/api-internal.md 4절). 후보는 작업의 candidates 칸에서 읽는다 —
// 다시 걸 때 · 못 넣은 작업을 다시 넣을 때도 처음 고른 후보 그대로 다시 만든다
@Component
class MatchEventMessageFactory implements AnalysisMessageFactory {

    // 후보 근거로 싣는 문장 수
    static final int EVIDENCE_LIMIT = 3;

    private final JsonMapper jsonMapper;
    private final ArticleMindmapRepository mindmaps;
    private final EventRepository events;
    private final CandidateEventFinder finder;

    MatchEventMessageFactory(
            JsonMapper jsonMapper,
            ArticleMindmapRepository mindmaps,
            EventRepository events,
            CandidateEventFinder finder) {
        this.jsonMapper = jsonMapper;
        this.mindmaps = mindmaps;
        this.events = events;
        this.finder = finder;
    }

    @Override
    public Set<AnalysisStage> stages() {
        return Set.of(AnalysisStage.MATCH_EVENT);
    }

    @Override
    public String payload(List<AnalysisJob> jobs) {
        if (jobs.size() != 1) {
            throw new IllegalArgumentException("판정 메시지에는 작업 하나만 싣는다");
        }
        AnalysisJob job = jobs.getFirst();
        Article article = job.getArticle();
        // 고르기(MatchDispatcher)가 마인드맵이 있는 기사만 고른다
        ArticleMindmap mindmap = mindmaps.findById(article.getId())
                .orElseThrow(() -> new IllegalStateException("판정할 기사에 마인드맵이 없다: " + article.getId()));
        MindmapContent content = read(mindmap);
        Extracted extracted = new Extracted(
                mindmap.getSummary(), ApiTime.toKst(mindmap.getOccurredAt()), content, primaryEvent(mindmap, content));
        ArticleInfo info = new ArticleInfo(
                article.getTitle(), article.getPress().getName(), ApiTime.toKst(article.getPublishedAt()));
        return jsonMapper.writeValueAsString(
                new MatchMessage(article.getId(), job.getId(), job.getAttempt(), info, extracted, candidates(job)));
    }

    // candidates 칸 순서(가까운 순서) 그대로. 사건이 없어졌으면 뺀다
    private List<CandidateEvent> candidates(AnalysisJob job) {
        List<CandidateEventFinder.Candidate> picked = CandidateEventFinder.read(jsonMapper, job.getCandidates());
        Map<Long, Event> byId =
                events
                        .findAllById(picked.stream()
                                .map(CandidateEventFinder.Candidate::eventId)
                                .toList())
                        .stream()
                        .collect(Collectors.toMap(Event::getId, Function.identity()));
        List<CandidateEvent> candidates = new ArrayList<>();
        for (CandidateEventFinder.Candidate candidate : picked) {
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
                    evidence(event.getId()),
                    candidate.similarity()));
        }
        return candidates;
    }

    // 사건을 만든 기사(가장 먼저 묶인 기사)의 대표 잎 근거 원문, 최대 3문장. 없으면 빈 목록
    private List<String> evidence(long eventId) {
        var first = finder.firstArticleId(eventId).flatMap(mindmaps::findById);
        if (first.isEmpty()) {
            return List.of();
        }
        MindmapContent.Item leaf = primaryEvent(first.get(), read(first.get()));
        if (leaf == null) {
            return List.of();
        }
        return leaf.evidence().stream()
                .limit(EVIDENCE_LIMIT)
                .map(MindmapContent.Evidence::text)
                .toList();
    }

    private static MindmapContent.@Nullable Item primaryEvent(ArticleMindmap mindmap, MindmapContent content) {
        Integer index = mindmap.getPrimaryCoreIndex();
        return index == null ? null : content.core(index);
    }

    private MindmapContent read(ArticleMindmap mindmap) {
        return jsonMapper.readValue(mindmap.getContent(), MindmapContent.class);
    }

    record MatchMessage(
            long articleId,
            long jobId,
            int attempt,
            ArticleInfo article,
            Extracted extracted,
            List<CandidateEvent> candidates) {}

    record ArticleInfo(String title, String publisher, OffsetDateTime publishedAt) {}

    // primaryEvent 는 잎 모양 그대로 { text, evidence[{ text, paragraphIndex, sentenceIndex }] }
    record Extracted(
            @Nullable String summary,
            @Nullable OffsetDateTime occurredAt,
            MindmapContent mindmap,
            MindmapContent.@Nullable Item primaryEvent) {}

    record CandidateEvent(
            long eventId,
            String title,
            String label,
            @Nullable String summary,
            OffsetDateTime occurredAt,
            List<String> evidence,
            double similarity) {}
}
