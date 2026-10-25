package kr.io.newlearn.common.web;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

// 응답의 시각을 한국 시간 +09:00 으로 바꾼다 (docs/api.md 1절 「시간」)
// 엔티티는 Instant(오프셋 없는 순간)로 두고, 응답 DTO 로 옮길 때 이걸 부른다. 예: ApiTime.toKst(article.getPublishedAt())
// Jackson 3 기본값이 OffsetDateTime 의 +09:00 을 그대로 쓰므로 따로 설정하지 않는다
public final class ApiTime {

    // 한국은 서머타임이 없어 늘 +09:00 이다
    public static final ZoneOffset KST = ZoneOffset.ofHours(9);

    private ApiTime() {}

    // 초 아래는 자른다. PostgreSQL 은 마이크로초까지 저장해서 그대로 내보내면 .123456 이 붙는다
    public static OffsetDateTime toKst(Instant instant) {
        if (instant == null) {
            return null;
        }
        return instant.truncatedTo(ChronoUnit.SECONDS).atOffset(KST);
    }
}
