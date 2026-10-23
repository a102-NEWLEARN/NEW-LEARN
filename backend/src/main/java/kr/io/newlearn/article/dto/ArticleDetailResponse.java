package kr.io.newlearn.article.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;

// JSON은 공통 기사 필드를 중첩하지 않고 A8 계약대로 최상위에 둔다.
public record ArticleDetailResponse(
        @JsonUnwrapped ArticleSummaryResponse article,
        String reporter,
        ArticleAnalysisStatus eventMatchStatus,
        EventRef event,
        IssueRef issue) {}
