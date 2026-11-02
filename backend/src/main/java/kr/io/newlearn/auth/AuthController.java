package kr.io.newlearn.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import kr.io.newlearn.auth.dto.LoginRequest;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.member.dto.MemberResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_MEMBER)
@RestController
public class AuthController {
    private final AuthService service;
    private final LoginSessions loginSessions;

    public AuthController(AuthService service, LoginSessions loginSessions) {
        this.service = service;
        this.loginSessions = loginSessions;
    }

    // A15 로그인 — 맞으면 회원 정보와 새 세션
    @Operation(
            summary = "[확정] A15 로그인",
            description =
                    "맞으면 회원 정보와 새 세션(SESSION 쿠키, 하루) · 새 CSRF 번호표를 줍니다. 같은 아이디로 5번 연속 틀리면 1분 동안 잠깁니다. 한꺼번에 보내도 비밀번호를 맞춰 보는 것은 5번까지입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — 아이디 · 비밀번호가 비었거나 너무 김(64자 · 128자 넘음)",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "401",
            description = "LOGIN_FAILED — 없는 아이디 · 틀린 비밀번호(어느 쪽인지 알려 주지 않음)",
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
            responseCode = "429",
            description = "TOO_MANY_REQUESTS — 5번 연속 틀려 1분 잠김. 비밀번호가 맞아도 1분 뒤에",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @PostMapping("/api/v1/auth/login")
    public MemberResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        MemberResponse member = service.login(request);
        loginSessions.open(member.toPrincipal(), httpRequest, httpResponse);
        return member;
    }

    // A16 로그아웃 — 로그인이 필요하다(SecurityConfig). 세션이 없으면 여기 오기 전에 401
    @Operation(summary = "[확정] A16 로그아웃", description = "세션을 끝내고 새 CSRF 번호표를 줍니다. 로그인이 필요합니다.")
    @ApiResponse(responseCode = "204", description = "로그아웃했다")
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 세션이 없거나 끝남",
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
    @PostMapping("/api/v1/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        loginSessions.close(httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }
}
