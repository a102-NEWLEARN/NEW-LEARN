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
@Import(TestcontainersConfiguration.class)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookmarkSchemaTest {
    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcClient jdbc;

    @Test
    void freshDatabaseHasBookmarkCompositeKeyAndValidatedEntity() {
        assertThat(jdbc.sql("select success from flyway_schema_history where version='7' and script='V7__bookmark.sql'")
                        .query(Boolean.class)
                        .single())
                .isTrue();
        assertThat(jdbc.sql(
                                "select pg_get_constraintdef(oid) from pg_constraint where conrelid='bookmark'::regclass and contype='p'")
                        .query(String.class)
                        .single())
                .isEqualTo("PRIMARY KEY (member_id, article_id)");
    }

    @Test
    void v6UpgradePreservesDataAndCascadesOnlyTargetBookmarks() throws Exception {
        String schema = "bookmark63_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("6")
                        .load()
                        .migrate();
                connection.setSchema(schema);
                var db = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                ArticleApiFixtures.insertBeforeEventRole(db);
                // 확장은 public에 설치돼 있다. 시험 스키마로 전환한 연결에서도 타입을 정확히 찾는다.
                db.sql("""
                        insert into article_embedding(article_id,model,embedding)
                        values (4201,'bookmark-upgrade-fixture',cast('[' || repeat('0,',1023) || '1]' as public.vector))
                        """).update();
                var embeddingsBefore = db.sql("select to_jsonb(e)::text from article_embedding e order by article_id")
                        .query(String.class)
                        .list();
                db.sql(
                                "insert into member(id,login_id,password_hash,name,created_at) values (6301,'schema63a','fixture','독자',now()),(6302,'schema63b','fixture','다른독자',now())")
                        .update();
                var articleBefore = db.sql("select to_jsonb(a)::text from article a order by id")
                        .query(String.class)
                        .list();
                var mindmapBefore = db.sql("select to_jsonb(m)::text from article_mindmap m order by article_id")
                        .query(String.class)
                        .list();
                var membersBefore = db.sql("select to_jsonb(m)::text from member m order by id")
                        .query(String.class)
                        .list();
                // V7 까지만 올린다 — 뒤 마이그레이션(V8 ~)이 생겨도 이 시험은 V6 → V7 업그레이드만 본다
                var result = Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("7")
                        .load()
                        .migrate();
                assertThat(result.migrationsExecuted).isEqualTo(1);
                assertThat(db.sql("select to_jsonb(e)::text from article_embedding e order by article_id")
                                .query(String.class)
                                .list())
                        .isEqualTo(embeddingsBefore);
                assertThat(db.sql("select to_jsonb(a)::text from article a order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(articleBefore);
                assertThat(db.sql("select to_jsonb(m)::text from article_mindmap m order by article_id")
                                .query(String.class)
                                .list())
                        .isEqualTo(mindmapBefore);
                assertThat(db.sql("select to_jsonb(m)::text from member m order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(membersBefore);
                db.sql("insert into bookmark(member_id,article_id) values (6301,4203),(6302,4203),(6302,4204)")
                        .update();
                db.sql("delete from member where id=6301").update();
                assertThat(db.sql("select count(*) from bookmark")
                                .query(Long.class)
                                .single())
                        .isEqualTo(2);
                db.sql("delete from article where id=4203").update();
                assertThat(db.sql("select article_id from bookmark")
                                .query(Long.class)
                                .list())
                        .containsExactly(4204L);
                assertThat(db.sql("select count(*) from member where id=6302")
                                .query(Long.class)
                                .single())
                        .isEqualTo(1);
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }
}
