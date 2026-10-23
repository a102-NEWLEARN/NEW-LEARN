package kr.io.newlearn.category;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CategoryServiceTest {
    @Test
    void missingAggregatesBecomeZeros() {
        var categories = mock(CategoryRepository.class);
        var queries = mock(CategoryQueryRepository.class);
        var category = mock(Category.class);
        when(category.getCode()).thenReturn("politics");
        when(category.getName()).thenReturn("정치");
        when(categories.findAllByOrderBySortOrderAsc()).thenReturn(List.of(category));
        when(queries.issueCounts()).thenReturn(Map.of());
        when(queries.articleCounts()).thenReturn(Map.of());
        var response = new CategoryService(categories, queries).list().items().getFirst();
        assertThat(response.code()).isEqualTo("politics");
        assertThat(response.issueCount()).isZero();
        assertThat(response.articleCount()).isZero();
        verify(queries).issueCounts();
        verify(queries).articleCounts();
    }
}
