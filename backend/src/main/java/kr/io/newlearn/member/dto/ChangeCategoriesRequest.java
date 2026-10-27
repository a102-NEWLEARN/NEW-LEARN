package kr.io.newlearn.member.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

// A18은 보낸 목록으로 통째로 바꾼다. 중복은 서비스에서 합치므로 원본 배열 길이의 상한은 두지 않는다.
public record ChangeCategoriesRequest(
        @NotEmpty(message = "관심 분야를 1개 이상 골라 주세요") List<@NotBlank(message = "관심 분야 코드가 비었어요") String> categoryCodes) {}
