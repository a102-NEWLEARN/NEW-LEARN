package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;
import kr.io.newlearn.event.EventRole;
import kr.io.newlearn.event.OccurredAtBasis;

// 레인은 사건 역할로 계산한다(api-screen.md A4, Jira 130). 관계 필드는 두지 않는다.
public record TimelineEvent(
        long id,
        String title,
        String label,
        Lane lane,
        OffsetDateTime occurredAt,
        OccurredAtBasis occurredAtBasis,
        long articleCount,
        long publisherCount) {

    public enum Lane {
        MAIN,
        SUB;

        public static Lane of(EventRole role) {
            return role == EventRole.REACTION ? SUB : MAIN;
        }
    }
}
