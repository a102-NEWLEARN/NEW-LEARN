package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.event.Event;

public record EventRef(long id, String title, String label, OffsetDateTime occurredAt) {

    public static EventRef from(Event event) {
        return new EventRef(event.getId(), event.getTitle(), event.getLabel(), ApiTime.toKst(event.getOccurredAt()));
    }
}
