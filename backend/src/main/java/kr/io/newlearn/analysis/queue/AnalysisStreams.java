package kr.io.newlearn.analysis.queue;

import java.util.List;
import java.util.Map;
import kr.io.newlearn.analysis.AnalysisStage;

// 작업 큐의 스트림 · consumer group 이름. 큐를 발행 · 소비하는 이름은 여기 한 곳에 둔다 (SSOT.md 4절, docs/api-internal.md 3절)
public final class AnalysisStreams {

    public static final String RELEASED = "analysis.released";
    public static final String MATCH_EVENT = "analysis.match_event";
    public static final String ISSUE = "analysis.issue";

    // 스트림마다 읽는 그룹. 투입 메시지 하나를 extract · embed 가 각자 읽는다 — 본문을 한 번만 저장하려고
    static final Map<String, List<String>> GROUPS = Map.of(
            RELEASED, List.of("extract", "embed"),
            MATCH_EVENT, List.of("match_event"),
            ISSUE, List.of("issue"));

    private AnalysisStreams() {}

    public static String of(AnalysisStage stage) {
        return switch (stage) {
            case EXTRACT, EMBED -> RELEASED;
            case MATCH_EVENT -> MATCH_EVENT;
            case ISSUE -> ISSUE;
        };
    }
}
