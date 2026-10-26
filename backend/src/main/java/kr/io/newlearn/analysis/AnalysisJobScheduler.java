package kr.io.newlearn.analysis;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

// 1분마다 간격이 지난 실패를 다시 걸고, 큐에 못 넣은 작업을 넣는다 (Jira 30)
// 배포 중 Pod 둘이 같이 돌아도 조건부 갱신이라 한 번만 된다. 시험에서는 끄고(newlearn.analysis.scheduler.enabled=false)
// AnalysisJobService 의 메서드에 시각을 넘겨 부른다
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "newlearn.analysis.scheduler.enabled", havingValue = "true", matchIfMissing = true)
class AnalysisJobScheduler {

    private static final Logger log = LoggerFactory.getLogger(AnalysisJobScheduler.class);

    private final AnalysisJobService service;

    AnalysisJobScheduler(AnalysisJobService service) {
        this.service = service;
    }

    // 하나가 실패해도 다른 하나는 돈다
    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT1M")
    void tick() {
        Instant now = Instant.now();
        try {
            service.retryDue(now);
        } catch (RuntimeException e) {
            log.warn("실패 다시 걸기 차례를 건너뛴다", e);
        }
        try {
            service.publishUnpublished(now);
        } catch (RuntimeException e) {
            log.warn("못 넣은 작업 넣기 차례를 건너뛴다", e);
        }
    }
}
