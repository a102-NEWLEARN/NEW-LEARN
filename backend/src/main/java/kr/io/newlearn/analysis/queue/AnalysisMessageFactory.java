package kr.io.newlearn.analysis.queue;

import java.util.List;
import java.util.Set;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisStage;

// 단계별 작업 메시지(JSON)를 만든다 (docs/api-internal.md 4절). 처음 걸 때 · 다시 걸 때 · 못 넣은 작업을 다시 넣을 때 같이 쓴다
// EXTRACT · EMBED 는 ReleasedMessageFactory(Jira 30). MATCH_EVENT 는 Jira 35, ISSUE 는 Jira 40 이 후보를 붙여 만든다
public interface AnalysisMessageFactory {

    Set<AnalysisStage> stages();

    // 같은 기사 · 같은 시도 번호의 작업들을 메시지 하나로
    String payload(List<AnalysisJob> jobs);
}
