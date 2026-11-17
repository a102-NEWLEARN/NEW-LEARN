package kr.io.newlearn.article.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import io.swagger.v3.oas.annotations.media.Schema;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;
import org.jspecify.annotations.Nullable;

// JSON은 공통 기사 필드를 중첩하지 않고 A8 계약대로 최상위에 둔다.
public record ArticleDetailResponse(
        @JsonUnwrapped ArticleSummaryResponse article,
        @Nullable String reporter,
        // enum 을 mindmapStatus 와 같이 써서 문서에는 이 칸에 나오는 값만 적는다 (ArticleAnalysisStatus 주석)
        @Schema(allowableValues = {"NONE", "QUEUED", "SUCCEEDED", "FAILED", "NO_EVENT"})
        ArticleAnalysisStatus eventMatchStatus,

        @Nullable EventRef event,
        @Nullable IssueRef issue) {}
