package kr.io.newlearn.common.error;

import org.jspecify.annotations.Nullable;

// VALIDATION_FAILED 의 errors[] 한 칸 — 어느 칸이 왜 틀렸나. reason 은 화면에 그대로 보일 한국어 문장 (docs/api.md 2절)
public record FieldErrorItem(
        @Nullable String field, @Nullable String reason) {}
