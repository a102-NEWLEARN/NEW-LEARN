package kr.io.newlearn.dictionary;

import java.util.Arrays;
import java.util.Optional;

// 드래그한 글이 어느 화면의 것인가 (docs/api-screen.md A26)
enum MeaningTarget {
    ARTICLE,
    ISSUE,
    EVENT;

    static Optional<MeaningTarget> parse(String raw) {
        return Arrays.stream(values()).filter(t -> t.name().equals(raw)).findFirst();
    }
}
