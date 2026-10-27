package kr.io.newlearn.common.error;

import java.time.temporal.Temporal;
import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.MismatchedInputException;

// 컨트롤러에서 난 오류를 모두 같은 모양(ProblemDetail + code)으로 바꾼다 (docs/api.md 1 · 2절)
// 스프링이 이미 ProblemDetail 로 만들어 주는 오류(없는 주소 · 틀린 메서드 · 입력 오류 …)는 물려받은 처리를 쓰고,
// 마지막에 거치는 handleExceptionInternal 한 곳에서 code 를 붙인다
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    static final String INTERNAL_DETAIL = "서버에서 처리하지 못한 오류가 났다. 원인은 서버 로그에 있다";

    static final String WRONG_FORMAT = "형식이 맞지 않아요";
    static final String NUMBER_EXPECTED = "숫자로 보내 주세요";
    static final String CHOICE_EXPECTED = "정해진 값 중 하나로 보내 주세요";
    static final String REQUIRED = "꼭 보내야 하는 값이에요";
    static final String TIME_EXPECTED = "시각은 2026-10-06T09:30:00+09:00 처럼 오프셋까지 보내 주세요";

    // 서비스가 던진 ApiException · NotFoundException
    @ExceptionHandler(ApiException.class)
    @Nullable
    ResponseEntity<Object> handleApiException(ApiException ex, WebRequest request) {
        ProblemDetail body = ProblemDetails.of(ex.errorCode(), ex.getMessage());
        ProblemDetails.addErrors(body, ex.errors());
        return handleExceptionInternal(
                ex, body, new HttpHeaders(), ex.errorCode().status(), request);
    }

    // 위와 스프링이 아는 오류 말고 전부. 로그인 · 권한 오류는 Security 가 401 · 403 으로 바꾸게 다시 던진다
    @ExceptionHandler(Exception.class)
    @Nullable
    ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) throws Exception {
        if (ex instanceof AccessDeniedException || ex instanceof AuthenticationException) {
            throw ex;
        }
        ProblemDetail body = ProblemDetails.of(ErrorCode.INTERNAL_ERROR, INTERNAL_DETAIL);
        return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }

    // 본문 검사(@Valid @RequestBody). reason 은 검증 어노테이션의 message
    @Override
    protected @Nullable ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldErrorItem> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::toItem)
                .toList();
        return withErrors(super.handleMethodArgumentNotValid(ex, headers, status, request), errors);
    }

    // 파라미터에 바로 붙은 제약(@RequestParam @Max …)
    @Override
    protected @Nullable ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldErrorItem> errors = new ArrayList<>();
        for (ParameterValidationResult result : ex.getParameterValidationResults()) {
            if (result instanceof ParameterErrors parameterErrors) {
                parameterErrors.getFieldErrors().forEach(error -> errors.add(toItem(error)));
            } else {
                String name = result.getMethodParameter().getParameterName();
                result.getResolvableErrors()
                        .forEach(error -> errors.add(new FieldErrorItem(name, error.getDefaultMessage())));
            }
        }
        return withErrors(super.handleHandlerMethodValidationException(ex, headers, status, request), errors);
    }

    // 숫자 자리에 글자처럼 파라미터 타입이 틀림
    @Override
    protected @Nullable ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        FieldErrorItem error = new FieldErrorItem(ex.getPropertyName(), reasonForType(ex.getRequiredType()));
        return withErrors(super.handleTypeMismatch(ex, headers, status, request), List.of(error));
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleMissingServletRequestParameter(
            MissingServletRequestParameterException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        FieldErrorItem error = new FieldErrorItem(ex.getParameterName(), REQUIRED);
        return withErrors(super.handleMissingServletRequestParameter(ex, headers, status, request), List.of(error));
    }

    // 본문을 JSON 으로 못 읽음. 칸 타입이 틀렸으면 그 칸을 짚고, JSON 자체가 깨졌으면 errors 없이 보낸다
    @Override
    protected @Nullable ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldErrorItem> errors = List.of();
        if (ex.getCause() instanceof JacksonException cause && !cause.getPath().isEmpty()) {
            Class<?> targetType = cause instanceof MismatchedInputException mismatch ? mismatch.getTargetType() : null;
            errors = List.of(new FieldErrorItem(pathOf(cause), reasonForType(targetType)));
        }
        return withErrors(super.handleHttpMessageNotReadable(ex, headers, status, request), errors);
    }

    // 모든 오류가 마지막에 지나는 곳. 여기서 code 를 붙이고, 5xx 는 내부 사정이 새지 않게 detail 을 바꾼다
    @Override
    protected @Nullable ResponseEntity<Object> handleExceptionInternal(
            Exception ex, @Nullable Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            if (!ProblemDetails.hasCode(problem)) {
                problem.setProperty("code", ErrorCode.forStatus(statusCode).name());
            }
            if (statusCode.is5xxServerError() && !(ex instanceof ApiException)) {
                log.error("처리하지 못한 오류", ex);
                problem.setDetail(INTERNAL_DETAIL);
            }
        }
        return response;
    }

    private static @Nullable ResponseEntity<Object> withErrors(
            @Nullable ResponseEntity<Object> response, List<FieldErrorItem> errors) {
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            ProblemDetails.addErrors(problem, errors);
        }
        return response;
    }

    // 값을 만들지 못한 칸(타입이 틀림)은 어노테이션 message 가 없어 타입으로 문장을 고른다
    private static FieldErrorItem toItem(FieldError error) {
        if (error.isBindingFailure()) {
            TypeMismatchException mismatch =
                    error.contains(TypeMismatchException.class) ? error.unwrap(TypeMismatchException.class) : null;
            return new FieldErrorItem(
                    error.getField(), reasonForType(mismatch == null ? null : mismatch.getRequiredType()));
        }
        return new FieldErrorItem(error.getField(), error.getDefaultMessage());
    }

    private static String reasonForType(@Nullable Class<?> type) {
        if (type == null) {
            return WRONG_FORMAT;
        }
        if (Number.class.isAssignableFrom(type)
                || type == int.class
                || type == long.class
                || type == short.class
                || type == double.class) {
            return NUMBER_EXPECTED;
        }
        if (type.isEnum()) {
            return CHOICE_EXPECTED;
        }
        // 시각(OffsetDateTime 등)은 오프셋이 없으면 못 읽는다 (docs/api.md 1절 「시간」)
        if (Temporal.class.isAssignableFrom(type)) {
            return TIME_EXPECTED;
        }
        return WRONG_FORMAT;
    }

    // 본문 안의 위치를 loginId · items[0].name 처럼 적는다
    private static String pathOf(JacksonException ex) {
        StringBuilder path = new StringBuilder();
        for (JacksonException.Reference reference : ex.getPath()) {
            if (reference.getPropertyName() != null) {
                if (!path.isEmpty()) {
                    path.append('.');
                }
                path.append(reference.getPropertyName());
            } else {
                path.append('[').append(reference.getIndex()).append(']');
            }
        }
        return path.toString();
    }
}
