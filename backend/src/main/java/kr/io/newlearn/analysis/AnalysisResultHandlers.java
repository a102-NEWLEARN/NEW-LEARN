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

    // 아직 처리기가 없는 단계의 결과가 오면 500. 투입(34)은 EXTRACT · EMBED 를 같이 걸어서, 34 가 35(EMBED 처리기)보다
    // 먼저 들어오면 EMBED 결과가 여기로 온다 — 그 시도는 INTERNAL 실패로 남고 한 번만 더 걸린다(AnalysisJobService)
    public AnalysisResultHandler forStage(AnalysisStage stage) {
        AnalysisResultHandler handler = byStage.get(stage);
        if (handler == null) {
            throw new IllegalStateException("이 단계의 결과를 저장할 곳이 아직 없다: " + stage);
        }
        return handler;
    }
}
