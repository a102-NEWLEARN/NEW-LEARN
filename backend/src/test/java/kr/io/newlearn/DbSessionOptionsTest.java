package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;

// DB_OPTIONS 로 backend 연결에만 PostgreSQL 세션 설정을 넘긴다 — 사이트 값은 backend.yaml 이 정하고 Jira S15P31A102-230 에서 "-c jit=off".
// 화면 쿼리는 수 ms 짜리라 실행마다 하는 JIT 컴파일이 더 비쌌다(운영 A13 검색 이슈 칸 14.2 → 0.9 ms). 왜 · 잰 값은 application.yaml 주석.
// 설정이 다른 시험용 앱이 하나 더 뜬다 — 끝나면 연결 4개를 돌려주게 @DirtiesContext(CI 는 모든 시험용 앱이 DB 하나를 같이 쓴다,
// src/test/resources/config/application.yaml)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = "DB_OPTIONS=-c jit=off")
@DirtiesContext
class DbSessionOptionsTest {
    @Autowired
    JdbcClient jdbc;

    @Test
    void dbOptionsReachTheSessionOfEveryAppConnection() {
        assertThat(jdbc.sql("select setting || ' ' || source from pg_settings where name = 'jit'")
                        .query(String.class)
                        .single())
                .isEqualTo("off client");
    }
}
