package kr.io.newlearn.analysis;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

// 단계 → 결과 처리기. 한 단계에 처리기가 둘이면 뜨지 않는다
@Component
public class AnalysisResultHandlers {

    private final Map<AnalysisStage, AnalysisResultHandler> byStage = new EnumMap<>(AnalysisStage.class);

    public AnalysisResultHandlers(List<AnalysisResultHandler> handlers) {
        for (AnalysisResultHandler handler : handlers) {
            if (byStage.put(handler.stage(), handler) != null) {
                throw new IllegalStateException("한 단계에 결과 처리기가 둘이다: " + handler.stage());
            }
        }
    }

    // 처리기가 없는 단계의 결과가 오면 500 — 그 시도는 INTERNAL 실패로 남고 한 번만 더 걸린다(AnalysisJobService).
    // 지금은 네 단계 모두 처리기가 있다
    public AnalysisResultHandler forStage(AnalysisStage stage) {
        AnalysisResultHandler handler = byStage.get(stage);
        if (handler == null) {
            throw new IllegalStateException("이 단계의 결과를 저장할 곳이 아직 없다: " + stage);
        }
        return handler;
    }
}
