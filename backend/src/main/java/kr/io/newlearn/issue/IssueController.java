package kr.io.newlearn.issue;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.issue.dto.IssueCardResponse;
import kr.io.newlearn.issue.dto.IssueHeaderResponse;
import kr.io.newlearn.issue.dto.TimelineResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class IssueController {
    private final IssueService service;

    public IssueController(IssueService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/issues/{issueId}")
    public IssueHeaderResponse get(@PathVariable long issueId) {
        return service.get(issueId);
    }

    @GetMapping("/api/v1/issues/{issueId}/timeline")
    public TimelineResponse timeline(@PathVariable long issueId) {
        return service.timeline(issueId);
    }

    @GetMapping("/api/v1/issues")
    public PageResponse<IssueCardResponse> list(
            @RequestParam(required = false) String category,
            @RequestParam(required = false)
                    @Pattern(regexp = "lastEventAt|createdAt", message = "sort는 lastEventAt 또는 createdAt으로 보내 주세요")
                    String sort,
            @Valid PageQuery query) {
        return service.list(category, sort == null ? "lastEventAt" : sort, query);
    }
}
