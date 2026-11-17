package kr.io.newlearn.analysis;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

// 1분마다 간격이 지난 실패를 다시 걸고, 큐에 못 넣은 작업을 넣고(Jira 30), 다음 판정(Jira 35) · 다음 ISSUE(Jira 40)를 고른다
// 배포 중 Pod 둘이 같이 돌아도 조건부 갱신이라 한 번만 된다. 시험에서는 끄고(newlearn.analysis.scheduler.enabled=false)
// AnalysisJobRecovery · AnalysisJobService 의 메서드에 시각을 넘겨 부른다
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "newlearn.analysis.scheduler.enabled", havingValue = "true", matchIfMissing = true)
class AnalysisJobScheduler {

    private static final Logger log = LoggerFactory.getLogger(AnalysisJobScheduler.class);

    private final AnalysisJobRecovery recovery;
    private final AnalysisJobService service;

    AnalysisJobScheduler(AnalysisJobRecovery recovery, AnalysisJobService service) {
        this.recovery = recovery;
        this.service = service;
    }

    // 하나가 실패해도 다른 하나는 돈다
    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT1M")
    void tick() {
        Instant now = Instant.now();
        runQuietly("실패 다시 걸기", () -> recovery.retryDue(now));
        runQuietly("못 넣은 작업 넣기", () -> recovery.publishUnpublished(now));
        runQuietly("판정 고르기", service::dispatchMatch);
        runQuietly("ISSUE 고르기", service::dispatchIssue);
    }

    private static void runQuietly(String work, Runnable task) {
        try {
            task.run();
        } catch (RuntimeException e) {
            log.warn("{} 차례를 건너뛴다", work, e);
        }
    }
}
