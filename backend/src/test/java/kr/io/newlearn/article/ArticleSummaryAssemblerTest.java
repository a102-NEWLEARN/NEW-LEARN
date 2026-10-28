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
    ArticleSummaryAssembler assembler =
            new ArticleSummaryAssembler(mindmaps, jobs, mock(kr.io.newlearn.bookmark.BookmarkRepository.class));

    static Stream<Arguments> summaries() {
        return Stream.of(
                Arguments.of("우리", "우리"),
                Arguments.of(null, null),
                Arguments.of("", null),
                Arguments.of(" \t\n ", null));
    }

    @ParameterizedTest
    @MethodSource("summaries")
    void summaryIsOursOnlyAndDoesNotChangeResultPresence(String own, String expected) {
        var article = article(1L);
        var result = mock(ArticleMindmapRepository.SummaryView.class);
        when(result.getArticleId()).thenReturn(1L);
        when(result.getSummary()).thenReturn(own);
        when(mindmaps.findSummariesByArticleIdIn(List.of(1L))).thenReturn(List.of(result));
        var summary = assembler.assemble(List.of(article), null).getFirst();
        assertThat(summary.summary()).isEqualTo(expected);
        assertThat(summary.mindmapStatus()).isEqualTo(ArticleAnalysisStatus.SUCCEEDED);
    }

    @Test
    void usesOneBulkLookupForMultipleArticlesAndNoQueriesForEmptyInput() {
        when(mindmaps.findSummariesByArticleIdIn(any())).thenReturn(List.of());
        when(jobs.findStatesByArticleIdInAndStage(any(), any())).thenReturn(List.of());
        assertThat(assembler.assemble(List.of(article(1L), article(2L)), null)).hasSize(2);
        verify(mindmaps).findSummariesByArticleIdIn(List.of(1L, 2L));
        verify(jobs).findStatesByArticleIdInAndStage(List.of(1L, 2L), AnalysisStage.EXTRACT);
        // 하나씩 — 둘을 같이 넘기면 서로 다른 제네릭 타입의 가변 인자 배열이 생겨 unchecked 경고가 난다
        clearInvocations(mindmaps);
        clearInvocations(jobs);
        assertThat(assembler.assemble(List.of(), null)).isEmpty();
        verifyNoInteractions(mindmaps, jobs);
    }

    // NOT_ANALYZABLE — 결과가 없고 EXTRACT 가 INPUT_NOT_ANALYZABLE 로 실패했을 때만. 결과가 있으면(다시 분석 실패) 그대로 SUCCEEDED
    static Stream<Arguments> mindmapStatuses() {
        return Stream.of(
                Arguments.of(
                        false, AnalysisJobStatus.FAILED, "INPUT_NOT_ANALYZABLE", ArticleAnalysisStatus.NOT_ANALYZABLE),
                Arguments.of(false, AnalysisJobStatus.FAILED, "LLM_TIMEOUT", ArticleAnalysisStatus.FAILED),
                Arguments.of(false, AnalysisJobStatus.QUEUED, "INPUT_NOT_ANALYZABLE", ArticleAnalysisStatus.QUEUED),
                Arguments.of(true, AnalysisJobStatus.FAILED, "INPUT_NOT_ANALYZABLE", ArticleAnalysisStatus.SUCCEEDED),
                Arguments.of(false, null, null, ArticleAnalysisStatus.NONE));
    }

    @ParameterizedTest
    @MethodSource("mindmapStatuses")
    void mindmapStatusComesFromResultThenExtractJob(
            boolean hasResult, AnalysisJobStatus extract, String errorCode, ArticleAnalysisStatus expected) {
        var article = article(1L);
        if (hasResult) {
            var result = mock(ArticleMindmapRepository.SummaryView.class);
            when(result.getArticleId()).thenReturn(1L);
            when(mindmaps.findSummariesByArticleIdIn(List.of(1L))).thenReturn(List.of(result));
        }
        if (extract != null) {
            var state = mock(AnalysisJobRepository.StateView.class);
            when(state.getArticleId()).thenReturn(1L);
            when(state.getStatus()).thenReturn(extract);
            when(state.getErrorCode()).thenReturn(errorCode);
            when(jobs.findStatesByArticleIdInAndStage(List.of(1L), AnalysisStage.EXTRACT))
                    .thenReturn(List.of(state));
        }
        assertThat(assembler.assemble(List.of(article), null).getFirst().mindmapStatus())
                .isEqualTo(expected);
    }

    private Article article(long id) {
        var article = mock(Article.class);
        var press = mock(Press.class);
        when(article.getId()).thenReturn(id);
        when(article.getPress()).thenReturn(press);
        when(article.getPublishedAt()).thenReturn(Instant.parse("2026-10-22T00:00:00Z"));
        return article;
    }
}
