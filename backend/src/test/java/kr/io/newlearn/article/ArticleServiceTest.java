package kr.io.newlearn.article;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.event.ArticleEventRepository;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import org.junit.jupiter.api.Test;

class ArticleServiceTest {
    ArticleRepository articles = mock(ArticleRepository.class);
    CategoryRepository categories = mock(CategoryRepository.class);
    ArticleSummaryAssembler assembler = mock(ArticleSummaryAssembler.class);
    AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
    ArticleEventRepository links = mock(ArticleEventRepository.class);
    ArticleMindmapRepository mindmaps = mock(ArticleMindmapRepository.class);
    ArticleService service = new ArticleService(articles, categories, assembler, jobs, links, mindmaps);

    @Test
    void missingCategoriesStopBeforeArticleQueries() {
        for (String code : new String[] {"unknown", ""}) {
            assertThatThrownBy(() -> service.list(code, new PageQuery(null, null), null))
                    .isInstanceOf(NotFoundException.class);
        }
        verifyNoInteractions(articles, assembler, jobs, links);
    }

    @Test
    void missingOrUnreleasedArticleStopsBeforeRelations() {
        assertThatThrownBy(() -> service.get(4210, null)).isInstanceOf(NotFoundException.class);
        verifyNoInteractions(assembler, jobs, links, mindmaps);
    }
}
