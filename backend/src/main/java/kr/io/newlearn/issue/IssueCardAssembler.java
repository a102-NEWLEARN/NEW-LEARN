package kr.io.newlearn.issue;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueCardResponse;
import org.springframework.stereotype.Component;

// A2와 A25의 카드 필드와 집계를 한 경로에서 조립한다. 각 참조는 목록당 한 번만 읽는다.
@Component
public class IssueCardAssembler {
    private final IssueQueryRepository queries;

    public IssueCardAssembler(IssueQueryRepository queries) {
        this.queries = queries;
    }

    public List<IssueCardResponse> assemble(List<IssueQueryRepository.CardRow> rows, Set<Long> interested) {
        if (rows.isEmpty()) return List.of();
        var ids = rows.stream().map(IssueQueryRepository.CardRow::id).toList();
        Map<Long, List<CategoryRef>> refs = queries.findCategories(ids).stream()
                .collect(Collectors.groupingBy(
                        IssueQueryRepository.CategoryRow::issueId,
                        Collectors.mapping(c -> new CategoryRef(c.code(), c.name()), Collectors.toList())));
        Map<Long, EventRef> lastEvents = queries.findLastEvents(ids).stream()
                .collect(Collectors.toMap(
                        IssueQueryRepository.EventRow::issueId,
                        e -> new EventRef(e.id(), e.title(), e.label(), ApiTime.toKst(e.occurredAt()))));
        return rows.stream()
                .map(c -> new IssueCardResponse(
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
                        lastEvents.get(c.id()),
                        interested.contains(c.id())))
                .toList();
    }
}
