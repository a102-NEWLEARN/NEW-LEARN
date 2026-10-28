package kr.io.newlearn.bookmark;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.bookmark.dto.BookmarkListResponse;
import kr.io.newlearn.bookmark.dto.BookmarkStateResponse;
import kr.io.newlearn.common.security.MemberPrincipal;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@Tag(name = OpenApiConfig.TAG_MEMBER)
public class BookmarkController {
    private final BookmarkService service;

    public BookmarkController(BookmarkService service) {
        this.service = service;
    }

    @Operation(summary = "[확정] A20 담기", description = "본문 없이 요청합니다. 반복 요청도 200과 변경 후 상태를 반환합니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — articleId가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 필요",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN — CSRF 번호표가 없거나 틀림",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "404",
            description = "ARTICLE_NOT_FOUND — 없거나 공개 전 기사",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @PutMapping("/api/v1/members/me/bookmarks/{articleId}")
    public BookmarkStateResponse add(
            @AuthenticationPrincipal MemberPrincipal me,
            @Parameter(description = "기사 ID", example = "1") @PathVariable long articleId) {
        return service.add(me.id(), articleId);
    }

    @Operation(summary = "[확정] A21 빼기", description = "본문 없이 요청합니다. 반복 요청도 200과 변경 후 상태를 반환합니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — articleId가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 필요",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN — CSRF 번호표가 없거나 틀림",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @DeleteMapping("/api/v1/members/me/bookmarks/{articleId}")
    public BookmarkStateResponse remove(
            @AuthenticationPrincipal MemberPrincipal me,
            @Parameter(description = "기사 ID", example = "1") @PathVariable long articleId) {
        return service.remove(me.id(), articleId);
    }

    @Operation(summary = "[확정] A22 나의 뉴스함", description = "쪽 없이 전체 기사, 담은 시각·기사 ID 내림차순입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 필요",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/members/me/bookmarks")
    public BookmarkListResponse list(@AuthenticationPrincipal MemberPrincipal me) {
        return service.list(me.id());
    }
}
