package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// DB_OPTIONS 가 비면(로컬 · CI · 기본값) 빈 options 가 가도 연결이 열리고 세션 설정은 아무것도 안 바뀐다 (Jira S15P31A102-230).
// 값 대신 출처를 본다 — 시험 DB 이미지의 서버 기본값(jit 켬)에 묶이지 않게. 다른 @DataJpaTest 와 같은 조합이라 시험용 앱이 늘지 않는다
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class DbSessionDefaultOptionsTest {
    @Autowired
    JdbcClient jdbc;

    @Test
    void emptyDbOptionsLeaveTheServerDefault() {
        assertThat(jdbc.sql("select source from pg_settings where name = 'jit'")
                        .query(String.class)
                        .single())
                .isNotEqualTo("client");
    }
}
