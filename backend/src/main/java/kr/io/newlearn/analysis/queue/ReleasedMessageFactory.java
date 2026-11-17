package kr.io.newlearn.analysis.queue;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.common.web.ApiTime;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// analysis.released 메시지 — 기사 본문을 통째로 넣어 워커가 DB · API 를 따로 읽지 않게 한다 (docs/api-internal.md 4절)
// 두 단계를 같이 실을 때는 둘 다 첫 시도다. 한 단계만 다시 돌릴 때는 그 단계 ID 만 싣고, 다른 그룹은 건너뛰고 ack 한다
@Component
class ReleasedMessageFactory implements AnalysisMessageFactory {

    private final JsonMapper jsonMapper;

    ReleasedMessageFactory(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public Set<AnalysisStage> stages() {
        return Set.of(AnalysisStage.EXTRACT, AnalysisStage.EMBED);
    }

    @Override
    public String payload(List<AnalysisJob> jobs) {
        AnalysisJob first = jobs.getFirst();
        Article article = first.getArticle();
        Map<String, Long> ids = new LinkedHashMap<>();
        for (AnalysisJob job : jobs) {
            if (job.getAttempt() != first.getAttempt()
                    || !job.getArticle().getId().equals(article.getId())) {
                throw new IllegalArgumentException("같은 기사 · 같은 시도의 작업만 한 메시지에 싣는다");
            }
            ids.put(job.getStage().name(), job.getId());
        }
        ArticleContent content = new ArticleContent(
                article.getTitle(),
                article.getPress().getName(),
                ApiTime.toKst(article.getPublishedAt()),
                article.getBody());
        return jsonMapper.writeValueAsString(new ReleasedMessage(article.getId(), ids, first.getAttempt(), content));
    }

    record ReleasedMessage(long articleId, Map<String, Long> jobs, int attempt, ArticleContent article) {}

    record ArticleContent(String title, String publisher, OffsetDateTime publishedAt, String body) {}
}
