package kr.io.newlearn.analysis.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// W1 EMBED 결과 읽기 · 검사 — docs/api-internal.md 5절 「EMBED 결과」 (Jira 35)
class EmbedResultTest {

    static final JsonMapper JSON = JsonMapper.builder().build();

    static JsonNode json(String text) {
        return JSON.readTree(text);
    }

    // 길이 n 의 벡터 JSON — 값은 0.001 · i
    static String vector(int n) {
        return IntStream.range(0, n)
                .mapToObj(i -> String.valueOf(0.001 * i))
                .collect(Collectors.joining(",", "[", "]"));
    }

    static String result(String model, String dimension, String vector) {
        return """
                {"model": %s, "dimension": %s, "vector": %s}""".formatted(model, dimension, vector);
    }

    @Test
    void readsModelAndVector() {
        var read = EmbedResult.read(json(result("\"BGE-m3-ko\"", "1024", vector(1024))));

        assertThat(read.model()).isEqualTo("BGE-m3-ko");
        assertThat(read.vector()).hasSize(EmbedResult.DIMENSION);
        assertThat(read.vector().get(3)).isEqualTo(0.003);
    }

    static Stream<Arguments> rejected() {
        String ok = vector(1024);
        return Stream.of(
                Arguments.of("결과가 객체가 아님", "[]"),
                Arguments.of("모델 없음", """
                        {"dimension": 1024, "vector": %s}""".formatted(ok)),
                Arguments.of("모델이 공백뿐", result("\"  \"", "1024", ok)),
                Arguments.of("차원 없음", """
                        {"model": "BGE-m3-ko", "vector": %s}""".formatted(ok)),
                Arguments.of("차원이 글자", result("\"BGE-m3-ko\"", "\"1024\"", ok)),
                Arguments.of("차원이 1024 가 아님(시험 모델 384)", result("\"BGE-m3-ko\"", "384", vector(384))),
                Arguments.of("벡터 없음", """
                        {"model": "BGE-m3-ko", "dimension": 1024}"""),
                Arguments.of("벡터가 배열이 아님", result("\"BGE-m3-ko\"", "1024", "\"0.1,0.2\"")),
                Arguments.of("벡터 길이가 차원과 다름", result("\"BGE-m3-ko\"", "1024", vector(1023))),
                Arguments.of(
                        "벡터에 숫자가 아닌 값",
                        result("\"BGE-m3-ko\"", "1024", vector(1023).replace("]", ",\"0.5\"]"))),
                Arguments.of(
                        "벡터에 무한대(1e400)",
                        result("\"BGE-m3-ko\"", "1024", vector(1023).replace("]", ",1e400]"))),
                // double 로는 유한하지만 pgvector 칸(float4)에 못 담는다 — 그대로 두면 DB 에서 터져 500
                Arguments.of(
                        "벡터에 float4 를 넘는 값(3.5e38)",
                        result("\"BGE-m3-ko\"", "1024", vector(1023).replace("]", ",3.5e38]"))),
                Arguments.of(
                        "벡터에 float4 를 넘는 음수(-3.5e38)",
                        result("\"BGE-m3-ko\"", "1024", vector(1023).replace("]", ",-3.5e38]"))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejected")
    void rejectsWhatCannotBeStored(String why, String result) {
        assertThatThrownBy(() -> EmbedResult.read(json(result))).isInstanceOf(ResultSchemaInvalidException.class);
    }
}
