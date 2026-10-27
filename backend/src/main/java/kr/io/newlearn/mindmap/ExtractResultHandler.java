package kr.io.newlearn.mindmap;

import java.time.Instant;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisResultHandler;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.mindmap.dto.ExtractResult;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// W1 EXTRACT 결과를 마인드맵으로 저장한다 (Jira 56, docs/api-internal.md 5절)
// AnalysisJobService.receiveResult 가 작업 행을 잠근 트랜잭션 안에서 부른다. 기사 공개는 그쪽이 저장 뒤에 한다
// 기사 행은 잠그지 않는다 — 읽기만 한다(AnalysisResultHandler 의 잠금 순서)
@Component
class ExtractResultHandler implements AnalysisResultHandler {

    private static final Logger log = LoggerFactory.getLogger(ExtractResultHandler.class);

    private final ArticleMindmapRepository mindmaps;
    private final JsonMapper jsonMapper;

    ExtractResultHandler(ArticleMindmapRepository mindmaps, JsonMapper jsonMapper) {
        this.mindmaps = mindmaps;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public AnalysisStage stage() {
        return AnalysisStage.EXTRACT;
    }

    @Override
    public void save(AnalysisJob job, JobResultRequest request) {
        var model = storable(request.model(), "model");
        var promptVersion = storable(request.promptVersion(), "promptVersion");
        // 성공인데 result 가 없으면 receiveResult 가 problem() 으로 먼저 거절했다
        var extract = ExtractResult.read(request.result());
        var article = job.getArticle();
        var content = extract.mindmap().retainEvidence(new EvidenceChecker(article.getBody()));
        var dropped = extract.malformedEvidence() + extract.mindmap().evidenceCount() - content.evidenceCount();
        var json = jsonMapper.writeValueAsString(content);
        var generatedAt = request.finishedAtOr(Instant.now());

        mindmaps.findById(article.getId())
                .ifPresentOrElse(
                        mindmap -> mindmap.replaceWith(
                                extract.summary(),
                                json,
                                extract.primaryCoreIndex(),
                                extract.occurredAt(),
                                extract.schemaVersion(),
                                model,
                                promptVersion,
                                generatedAt),
                        () -> mindmaps.save(new ArticleMindmap(
                                article,
                                extract.summary(),
                                json,
                                extract.primaryCoreIndex(),
                                extract.occurredAt(),
                                extract.schemaVersion(),
                                model,
                                promptVersion,
                                generatedAt)));
        // 지운 근거 수는 근거 연결 정확도 평가에 쓴다 (MVP 개요 7장, PRD SM-2)
        log.info(
                "EXTRACT 저장 articleId={} jobId={} 근거 남김={} 지움={}",
                article.getId(),
                job.getId(),
                content.evidenceCount(),
                dropped);
    }

    // DB 칸이 not null 인 text 라 비거나 U+0000 이 있으면 저장에서 500 이 난다 — 워커 잘못으로 보고 받을 때 거절한다
    private static String storable(@Nullable String value, String field) {
        if (value == null || value.isBlank()) {
            throw new ResultSchemaInvalidException("EXTRACT 인데 봉투의 " + field + " 이 없다");
        }
        if (value.indexOf('\u0000') >= 0) {
            throw new ResultSchemaInvalidException("봉투의 " + field + " 에 U+0000 이 있다");
        }
        return value;
    }
}
