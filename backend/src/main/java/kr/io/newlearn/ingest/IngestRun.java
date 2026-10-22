package kr.io.newlearn.ingest;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 수집 배치(CronJob)가 NewsData 를 한 번 부른 기록. 실행 한 번이 한 행이다 (data-model.md 2절)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IngestRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    private IngestSource source;

    private Instant startedAt;

    private Instant finishedAt;

    private Integer fetchedCount;

    private String nextCursor;

    @Enumerated(EnumType.STRING)
    private IngestRunStatus status;

    public IngestRun(IngestSource source, Instant startedAt) {
        this.source = source;
        this.startedAt = startedAt;
        this.status = IngestRunStatus.RUNNING;
    }
}
