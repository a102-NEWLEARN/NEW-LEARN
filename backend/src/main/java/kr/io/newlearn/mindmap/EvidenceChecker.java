package kr.io.newlearn.mindmap;

import java.util.Arrays;
import java.util.List;

// 근거(evidence) 문장이 기사 본문에 글자 그대로 있는지 본다 (docs/api-screen.md 3절, Jira 56)
// 문단 나누기는 워커(Python)와 같아야 한다 — 줄바꿈(\n)으로 나누고, 줄마다 앞뒤 공백을 지우고, 빈 줄을 뺀다
// 공백 · 따옴표를 맞춰 주지 않고 문장 번호(sentenceIndex)는 보지 않는다
final class EvidenceChecker {

    private final List<String> paragraphs;

    EvidenceChecker(String body) {
        // \r\n 의 \r 은 strip() 이 지운다
        this.paragraphs = Arrays.stream(body.split("\n"))
                .map(String::strip)
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
}
