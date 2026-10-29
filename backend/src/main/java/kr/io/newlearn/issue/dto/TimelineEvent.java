package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;
import kr.io.newlearn.event.EventRole;
import kr.io.newlearn.event.OccurredAtBasis;
import org.jspecify.annotations.Nullable;

// 레인은 사건 역할로 계산한다(api-screen.md A4, Jira 130). 사건 사이 관계는 반응 대상 사건 번호 하나만 둔다 —
// 대상이 같은 이슈의 사건일 때만 싣고 아니면 null 이다. 화면은 둘 다 보일 때 반응 점선을 그린다(Jira 134)
public record TimelineEvent(
        long id,
        String title,
        String label,
        Lane lane,
        @Nullable Long reactsToEventId,
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
