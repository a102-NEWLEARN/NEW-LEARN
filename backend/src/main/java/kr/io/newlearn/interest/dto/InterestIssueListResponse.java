package kr.io.newlearn.interest.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.issue.dto.IssueCardResponse;

public record InterestIssueListResponse(List<InterestIssueItem> items) {
    public record InterestIssueItem(@JsonUnwrapped IssueCardResponse card, OffsetDateTime interestedAt) {}
}
