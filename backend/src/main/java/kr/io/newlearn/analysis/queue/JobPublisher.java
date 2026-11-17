package kr.io.newlearn.analysis.queue;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisStreamCommands.StreamDeletionPolicy;
import org.springframework.data.redis.connection.RedisStreamCommands.TrimOptions;
import org.springframework.data.redis.connection.RedisStreamCommands.XAddOptions;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

// 작업 메시지를 스트림에 넣는다 — XADD <스트림> ACKED MAXLEN ~ N * payload <JSON> (docs/api-internal.md 3 · 4절, Jira 30)
// ack 해도 메시지는 스트림에 남는다(XACK 은 그룹의 처리 중 목록에서만 지운다). 그래서 넣을 때마다 길이를 자른다
// ACKED: 모든 그룹이 읽고 ack 한 메시지만 잘라 낸다 — 밀린 그룹이 아직 못 읽은 메시지는 남는다(Redis 8.2+, 우리는 8.10.2)
// ~ : 정확히 N 개가 아니라 내부 덩어리 단위로 자른다. 정확히 맞추는 것보다 훨씬 싸다
@Component
public class JobPublisher {

    private final StringRedisTemplate redis;
    private final long maxLength;

    public JobPublisher(
            StringRedisTemplate redis, @Value("${newlearn.analysis.queue.max-length:10000}") long maxLength) {
        this.redis = redis;
        this.maxLength = maxLength;
    }

    public RecordId publish(String stream, String payload) {
        TrimOptions trim =
                TrimOptions.maxLen(maxLength).approximate().deletionPolicy(StreamDeletionPolicy.removeAcknowledged());
        return redis.opsForStream().add(MapRecord.create(stream, Map.of("payload", payload)), XAddOptions.trim(trim));
    }
}
