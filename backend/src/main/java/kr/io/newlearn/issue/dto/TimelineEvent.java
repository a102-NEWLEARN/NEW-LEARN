package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;
import kr.io.newlearn.event.OccurredAtBasis;
import org.jspecify.annotations.Nullable;

// 레인 분류 기준이 정해지기 전에는 lane을 null로 반환한다. 관계 필드는 두지 않는다.
public record TimelineEvent(
        long id,
        String title,
        String label,
        @Nullable String lane,
        OffsetDateTime occurredAt,
        OccurredAtBasis occurredAtBasis,
        long articleCount,
        long publisherCount) {}
