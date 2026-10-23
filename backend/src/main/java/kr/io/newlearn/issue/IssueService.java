package kr.io.newlearn.issue;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueCardResponse;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class IssueService {
    private final CategoryRepository categories;
    private final IssueQueryRepository queries;

    public IssueService(CategoryRepository categories, IssueQueryRepository queries) {
        this.categories = categories;
        this.queries = queries;
    }

    public PageResponse<IssueCardResponse> list(String category, String sort, PageQuery query) {
        if (category != null && !categories.existsById(category)) {
            throw new NotFoundException(ErrorCode.CATEGORY_NOT_FOUND, "카테고리를 찾을 수 없다: " + category);
        }
        var page = queries.findCards(category, sort, query.toPageable(Sort.unsorted()));
        if (page.isEmpty()) {
            return new PageResponse<>(
                    List.of(), page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
        }
        var ids = page.stream().map(IssueQueryRepository.CardRow::id).toList();
        Map<Long, List<CategoryRef>> refs = queries.findCategories(ids).stream()
                .collect(Collectors.groupingBy(
                        IssueQueryRepository.CategoryRow::issueId,
                        Collectors.mapping(c -> new CategoryRef(c.code(), c.name()), Collectors.toList())));
        Map<Long, EventRef> events = queries.findLastEvents(ids).stream()
                .collect(Collectors.toMap(
                        IssueQueryRepository.EventRow::issueId,
                        e -> new EventRef(e.id(), e.title(), e.label(), ApiTime.toKst(e.occurredAt()))));
        return PageResponse.from(page.map(c -> new IssueCardResponse(
                c.id(),
                c.title(),
                c.summary(),
                refs.getOrDefault(c.id(), List.of()),
                c.eventCount(),
                c.articleCount(),
                c.publisherCount(),
                ApiTime.toKst(c.firstEventAt()),
                ApiTime.toKst(c.lastEventAt()),
                ApiTime.toKst(c.createdAt()),
                events.get(c.id()))));
    }
}
