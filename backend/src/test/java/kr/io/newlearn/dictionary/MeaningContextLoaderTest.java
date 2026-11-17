package kr.io.newlearn.dictionary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.Optional;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.event.EventService;
import kr.io.newlearn.issue.IssueService;
import kr.io.newlearn.mindmap.ArticleMindmap;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class MeaningContextLoaderTest {
    static final String CONTENT = """
            {"title":null,"branches":[{"type":"CORE","items":[{"text":"잎 글","evidence":[]}]}]}""";

    ArticleRepository articles = mock(ArticleRepository.class);
    ArticleMindmapRepository mindmaps = mock(ArticleMindmapRepository.class);
    MeaningContextLoader loader = new MeaningContextLoader(
            articles,
            mindmaps,
            mock(IssueService.class),
            mock(EventService.class),
            JsonMapper.builder().build());

    void article(long id, String title) {
        var article = mock(Article.class);
        when(article.getTitle()).thenReturn(title);
        when(article.getBody()).thenReturn("본문");
        when(articles.findByIdAndReleasedAtIsNotNull(id)).thenReturn(Optional.of(article));
    }

    void mindmap(long id, String summary) {
        var row = mock(ArticleMindmap.class);
        when(row.getSummary()).thenReturn(summary);
        when(row.getContent()).thenReturn(CONTENT);
        when(mindmaps.findById(id)).thenReturn(Optional.of(row));
    }

    // 기사 화면 흐름지도 머리 줄은 AI 한 줄 요지(A8 summary)다 — 드래그한 말이 그 줄에 있어도 받는다 (Jira 202)
    @Test
    void articleScreenTextsIncludeTheAiSummaryShownOnTheFlowHeadline() {
        article(409, "기사 제목");
        mindmap(409, "한은이 양적긴축 속도를 늦춘다");

        assertThat(loader.load(MeaningTarget.ARTICLE, 409).screenTexts())
                .containsExactly("기사 제목", "한은이 양적긴축 속도를 늦춘다", "잎 글");
    }

    @Test
    void blankSummaryIsNotAScreenText() {
        article(410, "기사 제목");
        mindmap(410, "  ");

        assertThat(loader.load(MeaningTarget.ARTICLE, 410).screenTexts()).containsExactly("기사 제목", "잎 글");
    }
}
