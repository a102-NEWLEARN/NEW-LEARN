package kr.io.newlearn.member;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.net.URI;
import kr.io.newlearn.auth.LoginSessions;
import kr.io.newlearn.common.security.MemberPrincipal;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.member.dto.ChangeCategoriesRequest;
import kr.io.newlearn.member.dto.MemberResponse;
import kr.io.newlearn.member.dto.SignUpRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_MEMBER)
@RestController
public class MemberController {
    private final MemberService service;
    private final LoginSessions loginSessions;

    public MemberController(MemberService service, LoginSessions loginSessions) {
        this.service = service;
        this.loginSessions = loginSessions;
    }

    // A14 가입 — 만든 뒤 바로 로그인된 세션을 연다(가입 화면이 가입 뒤 바로 들어간다, docs/api-screen.md A14)
    @Operation(
            summary = "[확정] A14 가입",
            description =
                    "아이디(영문 소문자 · 숫자 · _ 4~20자) · 비밀번호(8~64자) · 이름(20자까지) · 관심 분야(1개 이상)로 가입하고 바로 로그인된 세션(SESSION 쿠키, 하루)을 엽니다.")
    @ApiResponse(
            responseCode = "201",
            description = "가입했다. Location: /api/v1/members/me",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MemberResponse.class)))
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — 규칙에 안 맞는 칸 · 없는 관심 분야. errors[] 에 칸과 화면에 보일 문장",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN — CSRF 번호표(X-XSRF-TOKEN)가 없거나 틀림",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "409",
            description = "LOGIN_ID_TAKEN — 이미 쓰는 아이디",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @PostMapping("/api/v1/members")
    public ResponseEntity<MemberResponse> signUp(
            @Valid @RequestBody SignUpRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        MemberResponse member = service.signUp(request);
        loginSessions.open(
                new MemberPrincipal(member.id(), member.loginId(), member.name()), httpRequest, httpResponse);
        return ResponseEntity.created(URI.create("/api/v1/members/me")).body(member);
    }

    @Operation(
            summary = "[확정] A17 내 정보",
            description = "로그인한 회원 정보와 현재 관심 분야를 카테고리 탭 순서로 줍니다. 손님의 401은 화면의 손님 판정에 씁니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 세션이 없거나 세션의 회원이 없음",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/members/me")
    public MemberResponse me(@Parameter(hidden = true) @AuthenticationPrincipal MemberPrincipal me) {
        return service.profile(me.id());
    }

    @Operation(
            summary = "[확정] A18 관심 분야 바꾸기",
            description = "본인의 관심 분야를 보낸 목록으로 통째로 바꾸고 회원 정보를 줍니다. 1개 이상 골라야 하며 중복은 합칩니다. 로그인·CSRF 규칙은 A14~A16과 같습니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — 관심 분야가 비었거나 없는 코드. errors[]에 칸과 한국어 문장",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 유효한 CSRF 번호표가 있으나 로그인 세션이 없거나 세션의 회원이 없음",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN — CSRF 번호표가 없거나 틀림. 세션도 없으면 이 검사가 먼저임",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @PutMapping("/api/v1/members/me/categories")
    public MemberResponse changeCategories(
            @Parameter(hidden = true) @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody ChangeCategoriesRequest request) {
        return service.changeCategories(me.id(), request);
    }
}
