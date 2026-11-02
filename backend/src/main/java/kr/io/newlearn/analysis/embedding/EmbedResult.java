package kr.io.newlearn.analysis.embedding;

import static kr.io.newlearn.analysis.ResultFields.invalid;

import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

// W1 EMBED 결과(봉투의 result) — docs/api-internal.md 5절 (Jira 35)
// 고쳐 받을 칸이 없다 — 벡터가 하나라도 틀리면 비교 결과가 틀리므로 모양이 틀리면 거절한다(400, 한 번 다시 건다)
public record EmbedResult(String model, List<Double> vector) {

    // article_embedding.embedding 의 차원 — BGE-m3-ko (V6, 2026-10-23)
    public static final int DIMENSION = 1024;

    public static EmbedResult read(JsonNode result) {
        if (!result.isObject()) {
            throw invalid("result 가 객체가 아니다");
        }
        var model = result.path("model");
        if (!model.isString() || model.stringValue().isBlank()) {
            throw invalid("model 이 없다");
        }
        var dimension = result.path("dimension");
        if (!dimension.isInt() || dimension.intValue() != DIMENSION) {
            throw invalid("dimension 이 " + DIMENSION + " 이 아니다: " + dimension);
        }
        var vector = result.path("vector");
        if (!vector.isArray() || vector.size() != DIMENSION) {
            throw invalid("vector 길이가 " + DIMENSION + " 이 아니다");
        }
        var values = new ArrayList<Double>(DIMENSION);
        for (var value : vector.values()) {
            // 1e400 처럼 double 을 넘는 수는 무한대로 읽힌다. 3.5e38 처럼 double 로는 유한해도 pgvector 칸(float4)을 넘으면
            // DB 가 받지 않는다 — 둘 다 거절한다. float4 아래로 내려가는 작은 수(1e-50)는 pgvector 가 받는다
            if (!value.isNumber()
                    || !Double.isFinite(value.doubleValue())
                    || Math.abs(value.doubleValue()) > Float.MAX_VALUE) {
                throw invalid("vector 에 float4 로 담을 수 있는 숫자가 아닌 값이 있다: " + value);
            }
            values.add(value.doubleValue());
        }
        return new EmbedResult(model.stringValue(), List.copyOf(values));
    }
}
