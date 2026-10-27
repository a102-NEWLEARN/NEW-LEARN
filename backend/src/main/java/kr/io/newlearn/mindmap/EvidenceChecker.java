package kr.io.newlearn.mindmap;

import java.util.Arrays;
import java.util.List;

// 근거(evidence) 문장이 기사 본문에 글자 그대로 있는지 본다 (docs/api-screen.md 3절, Jira 56)
// 문단 나누기는 워커(Python)와 같아야 한다 — 줄바꿈(\n)으로 나누고, 줄마다 앞뒤 공백을 지우고, 빈 줄을 뺀다
// 공백 · 따옴표를 맞춰 주지 않고 문장 번호(sentenceIndex)는 보지 않는다
final class EvidenceChecker {

    private final List<String> paragraphs;

    EvidenceChecker(String body) {
        this.paragraphs = Arrays.stream(body.split("\n"))
                .map(EvidenceChecker::strip)
                .filter(line -> !line.isEmpty())
                .toList();
    }

    List<String> paragraphs() {
        return paragraphs;
    }

    boolean matches(int paragraphIndex, String text) {
        // 빈 문자열은 어느 문단에나 「들어 있어서」 따로 막는다
        if (text.isBlank() || paragraphIndex < 0 || paragraphIndex >= paragraphs.size()) {
            return false;
        }
        return paragraphs.get(paragraphIndex).contains(text);
    }

    // Python str.strip() 과 같은 글자를 지운다. String.strip() 은 줄바꿈 없는 공백(U+00A0 · U+2007 · U+202F)과
    // U+0085 를 남겨서, 그 글자만 있는 줄이 문단으로 세어지면 뒤 문단 번호가 워커와 어긋난다(리뷰, 2026-10-27)
    private static String strip(String line) {
        int start = 0;
        int end = line.length();
        while (start < end && isPythonSpace(line.charAt(start))) {
            start++;
        }
        while (end > start && isPythonSpace(line.charAt(end - 1))) {
            end--;
        }
        return line.substring(start, end);
    }

    // Python str.isspace() 와 같은 판정 — 2026-10-27 Python 3.11 과 글자 21개로 대조했다 (EvidenceCheckerTest)
    private static boolean isPythonSpace(char c) {
        return Character.isWhitespace(c) || Character.isSpaceChar(c) || c == '\u0085';
    }
}
