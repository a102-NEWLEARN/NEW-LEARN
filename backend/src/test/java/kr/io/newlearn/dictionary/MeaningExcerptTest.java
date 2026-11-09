package kr.io.newlearn.dictionary;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// 모델에 주는 본문 — 고른 말 앞뒤 500자, 못 찾으면 앞 1,000자 (docs/api-screen.md A26)
class MeaningExcerptTest {

    @Test
    void windowAroundTheTermIgnoringSpaces() {
        String body = "가".repeat(600) + "가계 대출의 금리 인상 압력" + "나".repeat(600);

        String excerpt = MeaningService.excerpt(body, "금리인상");

        assertThat(excerpt).contains("금리 인상");
        assertThat(excerpt).startsWith("가").endsWith("나");
        assertThat(excerpt.length()).isEqualTo(500 + "금리 인상".length() + 500);
    }

    @Test
    void headWhenTheTermIsNotInTheBody() {
        String body = "다".repeat(1_500);

        assertThat(MeaningService.excerpt(body, "이자를")).hasSize(1_000);
        assertThat(MeaningService.excerpt("짧은 본문", "이자")).isEqualTo("짧은 본문");
    }

    @Test
    void regexCharactersInTheTermAreLiteral() {
        assertThat(MeaningService.excerpt("앞 C++ (언어) 뒤", "C++")).contains("C++");
    }
}
