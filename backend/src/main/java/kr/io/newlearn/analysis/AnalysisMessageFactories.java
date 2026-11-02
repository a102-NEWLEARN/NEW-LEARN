package kr.io.newlearn.analysis;

import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import kr.io.newlearn.analysis.queue.AnalysisMessageFactory;
import org.springframework.stereotype.Component;

// 단계 → 작업 메시지 공장(AnalysisResultHandlers 와 같은 모양). 한 단계에 공장이 둘이거나, 네 단계 중 하나라도 공장이 없으면
// 앱이 뜨지 않는다 — 걸어 둔 작업이 큐에 못 들어가고 멈추는 일을 뜰 때 막는다
@Component
public class AnalysisMessageFactories {

    private final Map<AnalysisStage, AnalysisMessageFactory> byStage = new EnumMap<>(AnalysisStage.class);

    public AnalysisMessageFactories(List<AnalysisMessageFactory> factories) {
        for (AnalysisMessageFactory factory : factories) {
            for (AnalysisStage stage : factory.stages()) {
                if (byStage.put(stage, factory) != null) {
                    throw new IllegalStateException("한 단계에 메시지를 만드는 곳이 둘이다: " + stage);
                }
            }
        }
        for (AnalysisStage stage : AnalysisStage.values()) {
            if (!byStage.containsKey(stage)) {
                throw new IllegalStateException("이 단계의 메시지를 만드는 곳이 없다: " + stage);
            }
        }
    }

    // 뜰 때 네 단계가 다 있는지 봤다
    public AnalysisMessageFactory forStage(AnalysisStage stage) {
        return Objects.requireNonNull(byStage.get(stage));
    }

    public Set<AnalysisStage> stages() {
        return Collections.unmodifiableSet(byStage.keySet());
    }
}
