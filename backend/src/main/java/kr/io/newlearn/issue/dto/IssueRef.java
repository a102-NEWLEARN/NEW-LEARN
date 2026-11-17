package kr.io.newlearn.issue.dto;

import kr.io.newlearn.issue.Issue;

public record IssueRef(long id, String title) {

    public static IssueRef from(Issue issue) {
        return new IssueRef(issue.getId(), issue.getTitle());
    }
}
