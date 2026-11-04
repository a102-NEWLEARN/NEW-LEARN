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

// V11 — NewsData 원본 분류를 5개 분야에 맞추는 대응 행을 넣고, 이미 들어온 기사의 대표 분야를 다시 계산한다
// (Jira S15P31A102-170, docs/data-model.md category_mapping). 대표는 B2 와 같은 규칙이어야 한다 —
// 원본 값이 모두 표에 있을 때 분야가 찬 행 중 priority 가 가장 작은 것(ArticleIngestService.category())
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class CategoryMappingMigrationTest {
    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcClient jdbc;

    // 새로 만든 DB(시험 컨텍스트)에는 V11 의 18행이 있다 — 분야 · priority 까지
    @Test
    void freshSchemaHasAllNewsDataCategories() {
        assertThat(jdbc.sql("""
                        select source_value || ':' || coalesce(category_code, '-') || ':' || priority
                        from category_mapping where source = 'NEWSDATA' order by source_value
                        """).query(String.class).list())
                .containsExactly(
                        "breaking:-:99",
                        "business:economy:4",
                        "crime:society:5",
                        "domestic:society:5",
                        "education:society:5",
                        "entertainment:-:99",
                        "environment:society:5",
                        "food:-:99",
                        "health:society:5",
                        "lifestyle:-:99",
                        "other:-:99",
                        "politics:politics:3",
                        "science:it_science:2",
                        "sports:-:99",
                        "technology:it_science:2",
                        "top:-:99",
                        "tourism:-:99",
                        "world:world:1");
    }

    // V10 까지 올린 DB 에 기사를 넣고 V11 로 올린다 — 운영처럼 기사가 먼저 있고 대응 행이 나중에 생기는 경우
    @Test
    void v10ToV11FillsRepresentativeCategoryOfExistingArticles() throws Exception {
        String schema = "category170_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("10")
                        .load()
                        .migrate();
                connection.setSchema(schema);
                var db = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                db.sql("insert into press(code, name) values ('p170', '가람일보')").update();
                insert(db, 1, "NEWSDATA", "{top,business,technology}", null); // 경제 · IT·과학 → 구체적인 IT·과학
                insert(db, 2, "NEWSDATA", "{crime,politics,top}", null); // 사회 · 정치 → 정치
                insert(db, 3, "NEWSDATA", "{world,politics}", null); // 국제가 가장 먼저
                insert(db, 4, "NEWSDATA", "{domestic}", null); // 국내 → 사회
                insert(db, 5, "NEWSDATA", "{top}", null); // 주제가 아닌 값만 → 빔
                insert(db, 6, "NEWSDATA", "{business,newcat}", null); // 표에 없는 값이 끼면 → 빔
                insert(db, 7, "NEWSDATA", "{}", null); // 원본 분류 없음 → 빔
                insert(db, 8, "NEWSDATA", "{business,business}", null); // 같은 값 두 번 → 경제
                insert(db, 9, "NEWSDATA", "{top,business}", "politics"); // 이미 찬 대표는 덮지 않는다
                insert(db, 10, "SSAFY_2025H1", "{business}", null); // NewsData 가 아닌 출처는 손대지 않는다
                insert(db, 11, "NEWSDATA", "{environment,business}", null); // 사회 · 경제 → 경제

                var result = Flyway.configure()
                        .dataSource(dataSource)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("11")
                        .load()
                        .migrate();

                assertThat(result.migrationsExecuted).isEqualTo(1);
                assertThat(db.sql("select id || ':' || coalesce(category_code, '-') from article order by id")
                                .query(String.class)
                                .list())
                        .isEqualTo(List.of(
                                "1:it_science",
                                "2:politics",
                                "3:world",
                                "4:society",
                                "5:-",
                                "6:-",
                                "7:-",
                                "8:economy",
                                "9:politics",
                                "10:-",
                                "11:economy"));
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }

    private static void insert(JdbcClient db, long id, String source, String categories, String categoryCode) {
        db.sql("""
                        insert into article(id, source, url, press_code, title, body, published_at, category_code,
                                            source_categories, created_at)
                        values (:id, :source, :url, 'p170', '제목', '본문', now(), :code, cast(:categories as text[]), now())
                        """)
                .param("id", id)
                .param("source", source)
                .param("url", "https://example.com/category170/" + id)
                .param("code", categoryCode)
                .param("categories", categories)
                .update();
    }
}
