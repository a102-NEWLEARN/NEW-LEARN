package kr.io.newlearn.dictionary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import kr.io.newlearn.dictionary.Meaning;
import org.jspecify.annotations.Nullable;

// A26 응답 (docs/api-screen.md A26) — 사전처럼 표제어 · 품사 · 뜻풀이 하나. query 는 다듬은 term 이다
// 뜻 단위가 아니거나 문맥으로도 모르면 세 칸이 null 이다(빼지 않고 null, docs/api.md 1절 「없는 값」)
public record MeaningResponse(
        String query,

        @Schema(
                types = {"string", "null"},
                description = "표제어 — 조사 · 어미를 뗀 기본형(「이자를」 → 「이자」)")
        @Nullable
        String word,

        @Schema(
                types = {"string", "null"},
                description = "품사(「명사」). 모르면 null")
        @Nullable
        String pos,

        @Schema(
                types = {"string", "null"},
                description = "그 글의 문맥에 맞는 뜻풀이 한 문장(AI 생성)")
        @Nullable
        String definition) {

    public static MeaningResponse of(String query, Meaning meaning) {
        return meaning.found()
                ? new MeaningResponse(query, meaning.word(), meaning.pos(), meaning.definition())
                : new MeaningResponse(query, null, null, null);
    }
}
