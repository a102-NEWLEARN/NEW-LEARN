package kr.io.newlearn.category;

import kr.io.newlearn.category.dto.CategoryListResponse;
import kr.io.newlearn.category.dto.CategoryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CategoryService {
    private final CategoryRepository categories;
    private final CategoryQueryRepository queries;

    public CategoryService(CategoryRepository categories, CategoryQueryRepository queries) {
        this.categories = categories;
        this.queries = queries;
    }

    public CategoryListResponse list() {
        var issueCounts = queries.issueCounts();
        var articleCounts = queries.articleCounts();
        return new CategoryListResponse(categories.findAllByOrderBySortOrderAsc().stream()
                .map(c -> new CategoryResponse(
                        c.getCode(),
                        c.getName(),
                        issueCounts.getOrDefault(c.getCode(), 0L),
                        articleCounts.getOrDefault(c.getCode(), 0L)))
                .toList());
    }
}
