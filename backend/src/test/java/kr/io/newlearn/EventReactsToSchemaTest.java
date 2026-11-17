package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

// V10 — 사건 역할 기본값 MAIN 을 지우고 반응 대상 사건 번호 칸을 더한다 (Jira 134, docs/data-model.md event)
// 역할은 판정이 새 사건을 만들 때 반드시 정한다. 기본값이 남아 있으면 역할을 빠뜨린 사건이 조용히 메인 흐름에 들어간다
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class EventReactsToSchemaTest {
    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcClient jdbc;

    // 칸이 없으면 「결과 없음」 예외가 아니라 단언에서 갈리게 모두 목록으로 읽는다
    @Test
    void freshSchemaHasNoRoleDefaultAndATargetThatIsClearedWhenItsEventGoes() {
        assertThat(jdbc.sql(
                                "select count(*) from flyway_schema_history where version='10' and script='V10__event_role_no_default_reacts_to_event.sql' and success")
                        .query(Long.class)
                        .single())
                .isEqualTo(1);
        assertThat(jdbc.sql(
                                "select coalesce(column_default, 'none') from information_schema.columns where table_schema=current_schema() and table_name='event' and column_name='role'")
                        .query(String.class)
                        .list())
                .containsExactly("none");
        assertThat(jdbc.sql(
                                "select data_type || ' ' || is_nullable from information_schema.columns where table_schema=current_schema() and table_name='event' and column_name='reacts_to_event_id'")
                        .query(String.class)
                        .list())
                .containsExactly("bigint YES");
        assertThat(jdbc.sql(
                                "select confrelid::regclass::text || ' ' || confdeltype::text from pg_constraint where conrelid='event'::regclass and contype='f' and pg_get_constraintdef(oid) like '%(reacts_to_event_id)%'")
                        .query(String.class)
                        .list())
                .containsExactly("event n");
    }

    @Test
    void anEventWithoutARoleIsRejected() {
        Throwable noRole = catchThrowable(() -> jdbc.sql("""
                        insert into event(id,title,label,occurred_at,occurred_at_basis,created_at,updated_at)
                        values (13401,'역할 없는 사건','키워드',now(),'EXTRACTED',now(),now())
                        """).update());

        assertThat(noRole).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aDeletedTargetBecomesNull() {
        jdbc.sql("""
                insert into event(id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (13402,'대상 사건','키워드',now(),'EXTRACTED',now(),now(),'MAIN')
                """).update();
        assertThatCode(() -> jdbc.sql("""
                                insert into event(id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role,reacts_to_event_id)
                                values (13403,'반응 사건','키워드',now(),'EXTRACTED',now(),now(),'REACTION',13402)
                                """).update()).doesNotThrowAnyException();

        jdbc.sql("delete from event where id=13402").update();

        assertThat(jdbc.sql("select count(*) from event where id=13403 and reacts_to_event_id is null")
                        .query(Long.class)
                        .single())
                .isEqualTo(1);
    }

    // 이미 있는 사건은 그대로 남고(역할 포함) 새 칸만 null 로 붙는다
    @Test
    void v9ToV10KeepsExistingEvents() throws Exception {
        String schema = "event134_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("9")
                        .load()
                        .migrate();
                connection.setSchema(schema);
                var db = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                CategoryIssueFixtures.insert(db);
                db.sql("update event set role='REACTION',reacts_to='보존할 반응 대상' where id=4111")
                        .update();
                var events = db.sql("select to_jsonb(e)::text from event e order by id")
                        .query(String.class)
                        .list();

                // 판을 정하지 않으면 뒤의 마이그레이션(V11 ~)까지 같이 돌아 실행 수가 늘어난다
                var result = Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("10")
                        .load()
                        .migrate();

                assertThat(result.migrationsExecuted).isEqualTo(1);
                assertThat(db.sql("select (to_jsonb(e) - 'reacts_to_event_id')::text from event e order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(events);
                assertThat(db.sql(
                                        "select count(*) from event e where to_jsonb(e) -> 'reacts_to_event_id' = 'null'::jsonb")
                                .query(Long.class)
                                .single())
                        .isEqualTo(events.size());
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }
}
