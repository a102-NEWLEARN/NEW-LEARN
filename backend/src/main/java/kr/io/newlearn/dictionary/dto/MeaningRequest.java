package kr.io.newlearn.dictionary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

// A26 요청 (docs/api-screen.md A26). 칸이 빠져도 400 · errors[칸] 이유를 주려고 모두 null 을 받아 서비스가 검사한다
// 단어와 기사 글이 주소에 실려 접근 로그에 남지 않게 POST 본문으로 받는다
public record MeaningRequest(
        @Schema(description = "드래그한 말. 앞뒤 공백을 지우고 50자까지, 글자가 하나는 있어야 한다", example = "이자를") @Nullable
        String term,

        @Schema(description = "드래그한 말의 앞뒤 30자씩을 포함한 화면 글 조각. 120자까지, 그 대상의 글 안에 있어야 한다", example = "기준금리를 동결하며 이자를 올렸다")
        @Nullable
        String around,

        @Schema(
                description = "어느 화면의 글인가 — ARTICLE(기사 제목 · 마인드맵 잎) · ISSUE(이슈 제목 · 요약) · EVENT(사건 제목 · 이름 · 요약)",
                example = "ARTICLE")
        @Nullable
        String contextType,

        @Schema(description = "그 기사 · 이슈 · 사건의 ID", example = "409") @Nullable
        Long contextId) {}
