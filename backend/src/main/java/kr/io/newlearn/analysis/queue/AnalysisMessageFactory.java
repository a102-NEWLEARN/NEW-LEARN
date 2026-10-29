package kr.io.newlearn.analysis.queue;

import java.util.List;
import java.util.Set;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisStage;

// 단계별 작업 메시지(JSON)를 만든다 (docs/api-internal.md 4절). 처음 걸 때 · 다시 걸 때 · 못 넣은 작업을 다시 넣을 때 같이 쓴다
// EXTRACT · EMBED 는 ReleasedMessageFactory(Jira 30), MATCH_EVENT 는 MatchEventMessageFactory(Jira 35),
// ISSUE 는 IssueMessageFactory(Jira 40)
public interface AnalysisMessageFactory {

    Set<AnalysisStage> stages();

    // 같은 기사 · 같은 시도 번호의 작업들을 메시지 하나로
    String payload(List<AnalysisJob> jobs);

    // 실패한 작업을 다시 걸 때(attempt + 1, 트랜잭션 안) — true 면 바로 큐에 넣는다. 판정도 처음 후보 그대로 바로 넣는다.
    // ISSUE 는 후보를 비워 대기 작업으로 돌려보내고 false — 고르기가 다시 골라 그때 후보를 새로 계산한다 (Jira 40)
    default boolean requeueNow(AnalysisJob job) {
        return true;
    }
}
