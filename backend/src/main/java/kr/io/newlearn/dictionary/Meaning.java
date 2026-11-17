package kr.io.newlearn.dictionary;

import org.jspecify.annotations.Nullable;

// 문맥 뜻 하나 — 모델이 고른 말을 사전처럼 풀이한 것 (docs/api-screen.md A26)
// found 가 false 면 「뜻 단위가 아니거나 문맥으로도 모른다」이고 세 칸은 null 이다. 이 모양 그대로 Redis 에 하루 둔다
public record Meaning(
        boolean found,
        @Nullable String word,
        @Nullable String pos,
        @Nullable String definition) {

    public static final Meaning NONE = new Meaning(false, null, null, null);
}
