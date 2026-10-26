package kr.io.newlearn.analysis.queue;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

// API 가 뜰 때 스트림 · consumer group 을 만든다 — XGROUP CREATE <스트림> <그룹> 0 MKSTREAM (Jira 30)
// 시작 위치를 0 으로 두어, 그룹이 생기기 전에 들어온 메시지도 워커가 읽는다. 워커는 그룹을 만들지 않는다
// 이미 있으면(BUSYGROUP) 그대로 둔다. Redis 에 못 붙으면 뜨지 않는다 — 로그인 세션도 같은 Redis 라 어차피 못 쓴다
@Component
public class StreamGroupsInitializer implements ApplicationRunner {

    private final StringRedisTemplate redis;

    public StreamGroupsInitializer(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public void run(ApplicationArguments args) {
        AnalysisStreams.GROUPS.forEach(this::createGroups);
    }

    public void createGroups(String stream, List<String> groups) {
        byte[] key = stream.getBytes(StandardCharsets.UTF_8);
        for (String group : groups) {
            try {
                redis.execute((RedisCallback<String>)
                        connection -> connection.streamCommands().xGroupCreate(key, group, ReadOffset.from("0"), true));
            } catch (DataAccessException e) {
                if (!String.valueOf(e.getMostSpecificCause().getMessage()).contains("BUSYGROUP")) {
                    throw e;
                }
            }
        }
    }
}
