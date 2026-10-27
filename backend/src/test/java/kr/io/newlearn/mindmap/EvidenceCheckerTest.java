package kr.io.newlearn.mindmap;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// 근거 대조 규칙 — docs/api-screen.md 3절 「근거 하나의 모양」 (Jira 56)
class EvidenceCheckerTest {

    @Test
    void paragraphsSplitOnLineBreaksTrimAndDropBlankLines() {
        var checker = new EvidenceChecker("  첫 문단입니다.  \n\n   \n둘째 문단\r\n셋째 문단\n");

        assertThat(checker.paragraphs()).containsExactly("첫 문단입니다.", "둘째 문단", "셋째 문단");
    }

    // 워커(Python)의 str.strip() 과 같은 글자를 공백으로 본다 — 줄바꿈 없는 공백만 있는 줄도 빈 줄이다.
    // 기대값은 Python 으로 같은 본문을 나눈 결과다(2026-10-27). 폭 없는 공백(U+200B)은 Python 도 남긴다
    @Test
    void paragraphsTrimTheSameWhitespaceAsPythonStrip() {
        var checker = new EvidenceChecker("  첫 문단\n \n둘째 문단\n　\n\u0085\n 셋째 \n​\n");

        assertThat(checker.paragraphs()).containsExactly("첫 문단", "둘째 문단", "셋째", "​");
        assertThat(checker.matches(2, "셋째")).isTrue();
    }

    @Test
    void bodyWithoutLineBreaksIsOneParagraph() {
        var checker = new EvidenceChecker("NewsData 본문은 줄바꿈이 없다. 그래서 문단이 하나다.");

        assertThat(checker.paragraphs()).hasSize(1);
        assertThat(checker.matches(0, "그래서 문단이 하나다.")).isTrue();
    }

    @Test
    void textMustBeInThatParagraphCharacterForCharacter() {
        var checker = new EvidenceChecker("한빛반도체가 6일 \"착공식\"을 열었다.\n2028년 양산은 그대로다.");

        assertThat(checker.matches(0, "6일 \"착공식\"을 열었다")).isTrue();
        assertThat(checker.matches(1, "2028년 양산은 그대로다.")).isTrue();
        // 한 글자 다름 · 따옴표 모양 다름 · 띄어쓰기 다름은 맞춰 주지 않는다
        assertThat(checker.matches(0, "6일 \"착공식\"을 열었었다")).isFalse();
        assertThat(checker.matches(0, "6일 “착공식”을 열었다")).isFalse();
        assertThat(checker.matches(0, "6일  \"착공식\"을 열었다")).isFalse();
    }

    @Test
    void textInAnotherParagraphDoesNotMatch() {
        var checker = new EvidenceChecker("첫 문단\n둘째 문단");

        assertThat(checker.matches(0, "둘째 문단")).isFalse();
    }

    @Test
    void paragraphIndexOutOfRangeDoesNotMatch() {
        var checker = new EvidenceChecker("첫 문단\n둘째 문단");

        assertThat(checker.matches(2, "첫 문단")).isFalse();
        assertThat(checker.matches(-1, "첫 문단")).isFalse();
    }

    @Test
    void blankTextDoesNotMatch() {
        var checker = new EvidenceChecker("첫 문단");

        // 빈 문자열은 어느 문단에나 「들어 있어서」 따로 막는다
        assertThat(checker.matches(0, "")).isFalse();
        assertThat(checker.matches(0, "  ")).isFalse();
    }
}
