package kr.io.newlearn.issue.dto;

import java.util.List;

public record TimelineResponse(long issueId, List<TimelineEvent> events) {}
