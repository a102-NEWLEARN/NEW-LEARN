package kr.io.newlearn.event;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.PageQuery;
import org.junit.jupiter.api.Test;

class EventServiceTest {
    @Test
    void missingEventStopsBeforeReadingArticlesOrSummaries() {
        var events = mock(EventRepository.class);
        var links = mock(ArticleEventRepository.class);
        var articles = mock(ArticleRepository.class);
        var summaries = mock(ArticleSummaryAssembler.class);
        var service = new EventService(events, links, articles, summaries);
        assertThatThrownBy(() -> service.get(49)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.articles(49, new PageQuery(0, 4))).isInstanceOf(NotFoundException.class);
        verifyNoInteractions(links, articles, summaries);
    }
}
