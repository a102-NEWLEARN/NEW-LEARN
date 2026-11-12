package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// 기사 표만 넣은 행 · 죽은 행 1,000건마다 자동 VACUUM 이 돌고 회차마다 로그를 남긴다 (V15, Jira S15P31A102-194).
// 기본값이면 하루 넘게 VACUUM 이 안 돌아, 그사이 들어온 기사가 낀 페이지의 공개 기사를 인덱스만 읽기가 표를 다시 읽는다(Heap Fetches).
// 다른 시험이 임시 스키마에 article 을 만들어도 현재 스키마의 표만 보도록 regclass 로 찾는다
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class ArticleAutovacuumSettingTest {
    @Autowired
    JdbcClient jdbc;

    @Test
    void v15LowersArticleAutovacuumThresholdsAndLogsEachRun() {
        assertThat(jdbc.sql("select unnest(reloptions) from pg_class where oid = 'article'::regclass")
                        .query(String.class)
                        .list())
                .containsExactlyInAnyOrder(
                        "autovacuum_vacuum_insert_threshold=1000",
                        "autovacuum_vacuum_insert_scale_factor=0",
                        "autovacuum_vacuum_threshold=1000",
                        "autovacuum_vacuum_scale_factor=0",
                        "log_autovacuum_min_duration=0");
    }
}
