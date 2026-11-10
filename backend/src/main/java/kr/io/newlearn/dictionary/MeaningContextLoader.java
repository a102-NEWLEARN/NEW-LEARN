package kr.io.newlearn.dictionary;

import java.util.ArrayList;
import java.util.List;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ReleasedArticles;
import kr.io.newlearn.event.EventService;
import kr.io.newlearn.issue.IssueService;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import kr.io.newlearn.mindmap.MindmapContent;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

// A26 문맥 읽기 — 드래그 대상이 되는 화면 글(screenTexts)과 모델에 줄 제목 · 문맥(background)을 DB 에서 읽는다 (Jira 187)
// 공개 규칙은 각 화면의 것을 그대로 쓴다 — 기사 ReleasedArticles(마인드맵이 없어도 제목은 통과), 이슈 · 사건은 A3 · A5 서비스.
// 짧은 읽기 트랜잭션만 연다. GMS 를 부르는 동안 DB 연결을 잡지 않게 서비스는 트랜잭션 밖에서 이것을 부른다
@Component
@Transactional(readOnly = true)
class MeaningContextLoader {

    // 기사의 화면 글 — 제목, 마인드맵 가운데 제목(content.title), 잎 글. 본문은 화면에 없어 문맥으로만 쓴다
    record Context(String title, List<String> screenTexts, String background) {}

    private final ArticleRepository articles;
    private final ArticleMindmapRepository mindmaps;
    private final IssueService issues;
    private final EventService events;
    private final JsonMapper jsonMapper;

    MeaningContextLoader(
            ArticleRepository articles,
            ArticleMindmapRepository mindmaps,
            IssueService issues,
            EventService events,
            JsonMapper jsonMapper) {
        this.articles = articles;
        this.mindmaps = mindmaps;
        this.issues = issues;
        this.events = events;
        this.jsonMapper = jsonMapper;
    }

    Context load(MeaningTarget target, long id) {
        return switch (target) {
            case ARTICLE -> article(id);
            case ISSUE -> {
                var issue = issues.get(id, null);
                yield new Context(issue.title(), texts(issue.title(), issue.summary()), orEmpty(issue.summary()));
            }
            case EVENT -> {
                var event = events.get(id);
                yield new Context(
                        event.title(), texts(event.title(), event.label(), event.summary()), orEmpty(event.summary()));
            }
        };
    }

    private Context article(long id) {
        var article = ReleasedArticles.get(articles, id);
        List<String> screen = new ArrayList<>(List.of(article.getTitle()));
        var mindmap = mindmaps.findById(id);
        MindmapContent content = mindmap.isPresent() ? read(mindmap.get().getContent()) : null;
        if (content != null) {
            if (content.title() != null) {
                screen.add(content.title());
            }
            // 잎 글이 빈 옛 행 · 손으로 넣은 행도 있다 — 그 잎만 빼고 제목은 고를 수 있게
            content.branches().stream()
                    .flatMap(b -> b.items().stream())
                    .map(MindmapContent.Item::text)
                    .filter(text -> text != null && !text.isBlank())
                    .forEach(screen::add);
        }
        return new Context(article.getTitle(), List.copyOf(screen), article.getBody());
    }

    // 옛 행 · 손으로 넣은 행이 모양이 달라도 제목은 고를 수 있게 잎만 비운다
    private @Nullable MindmapContent read(String content) {
        try {
            return jsonMapper.readValue(content, MindmapContent.class);
        } catch (JacksonException e) {
            return null;
        }
    }

    private static List<String> texts(@Nullable String... values) {
        List<String> out = new ArrayList<>();
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                out.add(v);
            }
        }
        return List.copyOf(out);
    }

    private static String orEmpty(@Nullable String value) {
        return value == null ? "" : value;
    }
}
