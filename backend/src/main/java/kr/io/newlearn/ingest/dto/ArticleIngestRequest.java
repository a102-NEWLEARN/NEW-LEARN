package kr.io.newlearn.ingest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import org.jspecify.annotations.Nullable;

// B2 기사 적재 요청 — 기사 하나 (docs/api-internal.md 2절, Jira 153). 지금은 NewsData 기사만 받는다
// message 는 errors[].reason 으로 배치 로그에 남는다. 길이 상한은 우리 제안이다(11-03 응답 최댓값: 제목 57자 · 링크 197자 · 본문 7,157자)
// U+0000 은 PostgreSQL 이 글자로 받지 못해 저장하면 500 이다 — 글자 칸 · 목록 항목마다 막는다(SignUpRequest.name 과 같은 방식)
// 발행 시각은 OffsetDateTime 이라 오프셋이 없으면 따로 보지 않아도 400 이다(docs/api.md 1절 「시간」)
public record ArticleIngestRequest(
        // 원문 링크는 A8 화면에 그대로 나간다. http · https 이고 호스트가 비지 않아야 한다. 경로는 보지 않는다 —
        // 퍼센트 인코딩 안 된 한글 경로가 실제로 온다. 받은 그대로 두고 정규화하지 않는다
        @NotBlank(message = "원문 링크가 없어요")
        @Size(max = 2048, message = "원문 링크는 2048자까지예요")
        @Pattern(regexp = "(?i)https?://[^/?#\\s]+([/?#].*)?", message = "원문 링크는 http · https 주소여야 해요")
        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "원문 링크에 쓸 수 없는 글자가 들어 있어요")
        String url,

        // NewsData source_id. 처음 보는 언론사면 이 값이 언론사 코드가 된다(data-model.md 2절 press)
        @NotBlank(message = "언론사 ID 가 없어요")
        @Size(max = 100, message = "언론사 ID 는 100자까지예요")
        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "언론사 ID 에 쓸 수 없는 글자가 들어 있어요")
        String pressSourceId,

        // NewsData source_name. 언론사를 처음 등록할 때만 쓴다 — 이미 있는 언론사의 이름은 바꾸지 않는다
        @NotBlank(message = "언론사 이름이 없어요")
        @Size(max = 100, message = "언론사 이름은 100자까지예요")
        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "언론사 이름에 쓸 수 없는 글자가 들어 있어요")
        String pressName,

        @NotBlank(message = "제목이 없어요")
        @Size(max = 300, message = "제목은 300자까지예요")
        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "제목에 쓸 수 없는 글자가 들어 있어요")
        String title,

        @Size(max = 200, message = "기자명은 200자까지예요")
        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "기자명에 쓸 수 없는 글자가 들어 있어요")
        @Nullable
        String reporter,

        // 본문이 없으면 분석할 것이 없다 — NewsData content 가 null 인 기사(11-03 50건 중 6건)는 배치도 미리 거른다
        @NotBlank(message = "본문이 없어요")
        @Size(max = 100_000, message = "본문은 10만 자까지예요")
        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "본문에 쓸 수 없는 글자가 들어 있어요")
        String body,

        @NotNull(message = "발행 시각이 없어요") OffsetDateTime publishedAt,

        @Size(max = 20, message = "원본 분류는 20개까지예요") @Nullable
        List<
                        @NotBlank(message = "원본 분류 값이 비었어요") @Size(max = 100, message = "원본 분류 값은 100자까지예요")
                        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "원본 분류 값에 쓸 수 없는 글자가 들어 있어요") String>
                sourceCategories,

        @Size(max = 20, message = "태그는 20개까지예요") @Nullable
        List<
                        @NotBlank(message = "태그가 비었어요") @Size(max = 100, message = "태그는 100자까지예요")
                        @Pattern(regexp = ArticleIngestRequest.NO_NUL, message = "태그에 쓸 수 없는 글자가 들어 있어요") String>
                sourceTags) {

    // U+0000 이 없는 글자 — 줄바꿈은 받는다
    static final String NO_NUL = "[^\\x00]*";

    // 기자명이 빈 값이면 없는 것으로 둔다
    public @Nullable String reporterOrNull() {
        return reporter == null || reporter.isBlank() ? null : reporter;
    }

    // 원본 분류가 없으면 빈 목록(article.source_categories 는 비울 수 없는 칸)
    public List<String> sourceCategoriesOrEmpty() {
        return sourceCategories == null ? List.of() : sourceCategories;
    }
}
