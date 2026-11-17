package kr.io.newlearn.dictionary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

// 뜻풀이 하나 (docs/api-screen.md A19). 사전의 표제어 하나에 뜻풀이가 여럿이면 항목도 여럿이다
// word 는 사전 표기 그대로다 — 띄어 써도 되는 자리의 ^ 도 남긴다(「구원^투수」)
public record DictionaryItem(
        String word,
        @Schema(types = {"string", "null"}) @Nullable String pos,
        String definition) {}
