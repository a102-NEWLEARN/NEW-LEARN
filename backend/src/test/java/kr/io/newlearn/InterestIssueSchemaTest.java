package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

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

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class InterestIssueSchemaTest {
    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcClient jdbc;

    @Test
    void freshSchemaHasV9CompositeKeyAndCascadeConstraints() {
        assertThat(jdbc.sql(
                                "select version from flyway_schema_history where success and version is not null order by installed_rank")
                        .query(String.class)
                        .list())
                .containsExactly(
                        "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17");
        assertThat(jdbc.sql(
                                "select count(*) from flyway_schema_history where version='9' and script='V9__interest_issue.sql' and success")
                        .query(Long.class)
                        .single())
                .isEqualTo(1);
        assertThat(jdbc.sql(
                                "select pg_get_constraintdef(oid) from pg_constraint where conrelid='interest_issue'::regclass and contype='p'")
                        .query(String.class)
                        .single())
                .isEqualTo("PRIMARY KEY (member_id, issue_id)");
        assertThat(jdbc.sql(
                                "select confdeltype::text from pg_constraint where conrelid='interest_issue'::regclass and contype='f'")
                        .query(String.class)
                        .list())
                .containsExactlyInAnyOrder("c", "c");
        assertThat(jdbc.sql(
                                "select count(*) from information_schema.columns where table_schema=current_schema() and table_name='interest_issue'")
                        .query(Long.class)
                        .single())
                .isEqualTo(3);
    }

    @Test
    void v7ToV9PreservesBookmarksAndExistingDataAndCascadesOnlyTheTarget() throws Exception {
        String schema = "interest64_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("7")
                        .load()
                        .migrate();
                connection.setSchema(schema);
                var db = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                CategoryIssueFixtures.insertBeforeEventRole(db);
                db.sql(
                                "insert into member(id,login_id,password_hash,name,created_at) values (6401,'schema64a','fixture','독자',now()),(6402,'schema64b','fixture','다른독자',now())")
                        .update();
                db.sql(
                                "insert into article_embedding(article_id,model,embedding) values (4101,'interest64',cast('['||repeat('0,',1023)||'1]' as public.vector))")
                        .update();
                db.sql(
                                "insert into article_mindmap(article_id,summary,content,schema_version,model,prompt_version,generated_at) values (4101,'보존할 요약','{}','v1','fixture','v1',now())")
                        .update();
                db.sql(
                                "insert into bookmark(member_id,article_id,created_at) values (6401,4101,'2020-01-01T00:00:00Z'),(6402,4101,'2021-01-01T00:00:00Z')")
                        .update();
                var bookmarks = db.sql("select to_jsonb(b)::text from bookmark b order by member_id,article_id")
                        .query(String.class)
                        .list();
                var issues = db.sql("select to_jsonb(i)::text from issue i order by id")
                        .query(String.class)
                        .list();
                var articles = db.sql("select to_jsonb(a)::text from article a order by id")
                        .query(String.class)
                        .list();
                var embeddings = db.sql("select to_jsonb(e)::text from article_embedding e order by article_id")
                        .query(String.class)
                        .list();
                var members = db.sql("select to_jsonb(m)::text from member m order by id")
                        .query(String.class)
                        .list();
                var mindmaps = db.sql("select to_jsonb(m)::text from article_mindmap m order by article_id")
                        .query(String.class)
                        .list();
                var eventRoleUpgrade = Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("8")
                        .load()
                        .migrate();
                assertThat(eventRoleUpgrade.migrationsExecuted).isEqualTo(1);
                assertThat(db.sql("select distinct role from event")
                                .query(String.class)
                                .list())
                        .containsExactly("MAIN");
                db.sql("update event set role='REACTION',reacts_to='보존할 반응 대상' where id=4111")
                        .update();
                var events = db.sql("select to_jsonb(e)::text from event e order by id")
                        .query(String.class)
                        .list();
                var result = Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("9")
                        .load()
                        .migrate();
                assertThat(result.migrationsExecuted).isEqualTo(1);
                assertThat(db.sql("select to_jsonb(e)::text from event e order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(events);
                assertThat(db.sql(
                                        "select version from flyway_schema_history where success and version is not null order by installed_rank")
                                .query(String.class)
                                .list())
                        .containsExactly("1", "2", "3", "4", "5", "6", "7", "8", "9");
                assertThat(db.sql("select to_jsonb(b)::text from bookmark b order by member_id,article_id")
                                .query(String.class)
                                .list())
                        .isEqualTo(bookmarks);
                assertThat(db.sql("select to_jsonb(i)::text from issue i order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(issues);
                assertThat(db.sql("select to_jsonb(a)::text from article a order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(articles);
                assertThat(db.sql("select to_jsonb(e)::text from article_embedding e order by article_id")
                                .query(String.class)
                                .list())
                        .isEqualTo(embeddings);
                assertThat(db.sql("select to_jsonb(m)::text from member m order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(members);
                assertThat(db.sql("select to_jsonb(m)::text from article_mindmap m order by article_id")
                                .query(String.class)
                                .list())
                        .isEqualTo(mindmaps);
                db.sql("insert into issue(id,title,created_at,updated_at) values (6400,'지울 이슈',now(),now())")
                        .update();
                db.sql("insert into interest_issue(member_id,issue_id) values (6401,6400),(6402,6400),(6402,4101)")
                        .update();
                db.sql("delete from member where id=6401").update();
                assertThat(db.sql("select count(*) from interest_issue")
                                .query(Long.class)
                                .single())
                        .isEqualTo(2);
                db.sql("delete from issue where id=6400").update();
                assertThat(db.sql("select issue_id from interest_issue")
                                .query(Long.class)
                                .list())
                        .containsExactly(4101L);
                assertThat(db.sql("select count(*) from member where id=6402")
                                .query(Long.class)
                                .single())
                        .isEqualTo(1);
                assertThat(db.sql("select member_id from bookmark")
                                .query(Long.class)
                                .list())
                        .containsExactly(6402L);
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }
}
