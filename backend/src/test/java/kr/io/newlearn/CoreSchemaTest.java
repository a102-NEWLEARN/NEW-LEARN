package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

// 빈 DB 에 Flyway 마이그레이션이 처음부터 돌아 data-model.md v1 의 실선 표 14개와 카테고리 5행이 생기는지 본다 (Jira 101)
// replace = NONE: 내장 DB 로 바꾸지 않고 로컬은 Testcontainers, CI 는 services 의 PostgreSQL 을 그대로 쓴다
@Import(TestcontainersConfiguration.class)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class CoreSchemaTest {

    @Autowired
    JdbcClient jdbc;

    @Autowired
    DataSource dataSource;

    @Test
    void articleDoesNotHaveSourceSummary() {
        List<String> columns = jdbc.sql("""
                        select column_name from information_schema.columns
                        where table_schema = 'public' and table_name = 'article'
                        """).query(String.class).list();

        assertThat(columns).contains("id", "title", "body").doesNotContain("source_summary");
    }

    @Test
    void v3MigrationIsApplied() {
        assertThat(jdbc.sql("select success from flyway_schema_history where version = '3'")
                        .query(Boolean.class)
                        .optional())
                .contains(true);
    }

    @Test
    void upgradingV2DropsOnlySourceSummaryAndPreservesStoredData() throws Exception {
        // 격리된 테스트 DB 안에 고유 스키마를 만들어 V2 데이터가 있는 상태에서 올린다
        String schema = "upgrade113_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("2")
                        .load()
                        .migrate();
                connection.setSchema(schema);
                JdbcClient upgrade = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                ArticleApiFixtures.insert(upgrade);
                assertThat(upgrade.sql("update article set source_summary = '삭제 대상 기존 값' where id = 4201")
                                .update())
                        .isEqualTo(1);
                List<String> articles = upgrade.sql("""
                                select (to_jsonb(a) - 'source_summary')::text from article a order by id
                                """).query(String.class).list();
                List<String> mindmaps = upgrade.sql("""
                                select to_jsonb(m)::text from article_mindmap m order by article_id
                                """).query(String.class).list();
                assertThat(articles).hasSize(11);
                assertThat(mindmaps).hasSize(6);

                var result = Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .load()
                        .migrate();

                assertThat(result.migrationsExecuted).isEqualTo(1);
                assertThat(upgrade.sql("""
                                        select column_name from information_schema.columns
                                        where table_schema = :schema and table_name = 'article'
                                        """)
                                .param("schema", schema)
                                .query(String.class)
                                .list())
                        .doesNotContain("source_summary");
                assertThat(upgrade.sql("select to_jsonb(a)::text from article a order by id")
                                .query(String.class)
                                .list())
                        .containsExactlyElementsOf(articles);
                assertThat(upgrade.sql("select to_jsonb(m)::text from article_mindmap m order by article_id")
                                .query(String.class)
                                .list())
                        .containsExactlyElementsOf(mindmaps);
                assertThat(upgrade.sql("select summary from article_mindmap where article_id = 4201")
                                .query(String.class)
                                .single())
                        .isEqualTo("우리 요약");
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }

    @Test
    void v2MigrationIsApplied() {
        boolean applied = jdbc.sql("select success from flyway_schema_history where version = '2'")
                .query(Boolean.class)
                .optional()
                .orElse(false);

        assertThat(applied).isTrue();
    }

    @Test
    void coreTablesExist() {
        List<String> tables = jdbc.sql("""
                        select table_name from information_schema.tables
                        where table_schema = 'public' and table_type = 'BASE TABLE'
                        """).query(String.class).list();

        assertThat(tables)
                .contains(
                        "category",
                        "category_mapping",
                        "press",
                        "press_mapping",
                        "article",
                        "ingest_run",
                        "issue",
                        "issue_category",
                        "event",
                        "article_event",
                        "analysis_job",
                        "article_mindmap",
                        "member",
                        "member_category");
    }

    // 코드 · 이름 · 탭 순서는 data-model.md 2절의 제안 값이다. FE 답(api.md 4절 FE 1번)으로 바뀌면 새 마이그레이션과 함께 고친다
    @Test
    void fiveCategoriesInTabOrder() {
        List<String> categories = jdbc.sql("select code, name from category order by sort_order")
                .query((rs, rowNum) -> rs.getString("code") + " " + rs.getString("name"))
                .list();

        assertThat(categories)
                .containsExactly("politics 정치", "economy 경제", "society 사회", "world 국제", "it_science IT·과학");
    }
}
