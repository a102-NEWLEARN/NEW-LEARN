package kr.io.newlearn.member;

import io.swagger.v3.oas.annotations.Operation;
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
import kr.io.newlearn.member.dto.MemberResponse;
import kr.io.newlearn.member.dto.SignUpRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
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
                    "아이디(영문 소문자 · 숫자 · _ 4~20자) · 비밀번호(8~64자) · 이름 · 관심 분야(1개 이상)로 가입하고 바로 로그인된 세션(SESSION 쿠키, 하루)을 엽니다.")
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
}
