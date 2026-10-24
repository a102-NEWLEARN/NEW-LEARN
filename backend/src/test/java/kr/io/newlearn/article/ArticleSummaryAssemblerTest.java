package kr.io.newlearn.article;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;
import kr.io.newlearn.analysis.*;
import kr.io.newlearn.article.dto.*;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import kr.io.newlearn.press.Press;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class ArticleSummaryAssemblerTest {
    ArticleMindmapRepository mindmaps = mock(ArticleMindmapRepository.class);
    AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
    ArticleSummaryAssembler assembler = new ArticleSummaryAssembler(mindmaps, jobs);

    static Stream<Arguments> summaries() {
        return Stream.of(
                Arguments.of("우리", "원본", "우리", SummarySource.NEWLEARN),
                Arguments.of(null, "원본", "원본", SummarySource.NEWSDATA),
                Arguments.of("", "원본", "원본", SummarySource.NEWSDATA),
                Arguments.of(" \t\n ", "원본", "원본", SummarySource.NEWSDATA),
                Arguments.of(null, "", null, null),
                Arguments.of("  ", " \n ", null, null));
    }

    @ParameterizedTest
    @MethodSource("summaries")
    void summaryFallbackDoesNotChangeResultPresence(
            String own, String source, String expected, SummarySource expectedSource) {
        var article = article(1L, source);
        var result = mock(ArticleMindmapRepository.SummaryView.class);
        when(result.getArticleId()).thenReturn(1L);
        when(result.getSummary()).thenReturn(own);
        when(mindmaps.findSummariesByArticleIdIn(List.of(1L))).thenReturn(List.of(result));
        var summary = assembler.assemble(List.of(article)).getFirst();
        assertThat(summary.summary()).isEqualTo(expected);
        assertThat(summary.summarySource()).isEqualTo(expectedSource);
        assertThat(summary.mindmapStatus()).isEqualTo(ArticleAnalysisStatus.SUCCEEDED);
    }

    @Test
    void usesOneBulkLookupForMultipleArticlesAndNoQueriesForEmptyInput() {
        when(mindmaps.findSummariesByArticleIdIn(any())).thenReturn(List.of());
        when(jobs.findStatesByArticleIdInAndStage(any(), any())).thenReturn(List.of());
        assertThat(assembler.assemble(List.of(article(1L, null), article(2L, null))))
                .hasSize(2);
        verify(mindmaps).findSummariesByArticleIdIn(List.of(1L, 2L));
        verify(jobs).findStatesByArticleIdInAndStage(List.of(1L, 2L), AnalysisStage.EXTRACT);
        clearInvocations(mindmaps, jobs);
        assertThat(assembler.assemble(List.of())).isEmpty();
        verifyNoInteractions(mindmaps, jobs);
    }

    private Article article(long id, String source) {
        var article = mock(Article.class);
        var press = mock(Press.class);
        when(article.getId()).thenReturn(id);
        when(article.getPress()).thenReturn(press);
        when(article.getPublishedAt()).thenReturn(Instant.parse("2026-10-22T00:00:00Z"));
        when(article.getSourceSummary()).thenReturn(source);
        return article;
    }
}
