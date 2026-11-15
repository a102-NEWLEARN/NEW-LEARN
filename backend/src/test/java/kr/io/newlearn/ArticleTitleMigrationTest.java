package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import kr.io.newlearn.ingest.ArticleTitleCleaner;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

// V13 — 이미 들어온 제목의 HTML 조각을 글자로 되돌린다 (Jira S15P31A102-178, 제목은 시험용으로 지어냈다).
// 결과가 B2 의 ArticleTitleCleaner 와 같아야 한다 — 다르면 덤프 적재의 제목 대조가 멈춘다(infra/server/data-load.md 5절)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class ArticleTitleMigrationTest {
    private static final List<String> TITLES = List.of(
            "홍길동 quot;대표 나설 생각 있다quot;hellip;임꺽정",
            "AImiddot;드론 lsquo;인재rsquo; ldquo;키운다rdquo;",
            "하이힐rarr;샌들 2.8배 uarr; 취업ndash;정주",
            "건설 활성화 한계 lt;하gt;",
            "글로벌 Ramp;D 협력 · Mamp;A 시장",
            "quot;lt;특집gt;quot;",
            "R&D 협력 강화",
            "검사 result; 여름 camp; 시장 salt; 물가 5%; 표 밖 apos; nbsp;",
            "조각 없는 제목");

    @Autowired
    DataSource dataSource;

    @Test
    void v12ToV13RestoresTitlesLikeTheIngestApi() throws Exception {
        String schema = "title178_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                migrate(schema, "12");
                connection.setSchema(schema);
                var db = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                db.sql("insert into press(code, name) values ('p178', '가람일보')").update();
                for (int i = 0; i < TITLES.size(); i++) {
                    db.sql("""
                                    insert into article(id, source, url, press_code, title, body, published_at, created_at)
                                    values (:id, 'NEWSDATA', :url, 'p178', :title, 'quot;본문quot;', now(), now())
                                    """)
                            .param("id", i + 1)
                            .param("url", "https://example.com/title178/" + i)
                            .param("title", TITLES.get(i))
                            .update();
                }

                assertThat(migrate(schema, "13")).isEqualTo(1);

                assertThat(db.sql("select title from article order by id")
                                .query(String.class)
                                .list())
                        .containsExactlyElementsOf(
                                TITLES.stream().map(ArticleTitleCleaner::clean).toList())
                        .startsWith(
                                "홍길동 \"대표 나설 생각 있다\"…임꺽정",
                                "AI·드론 ‘인재’ “키운다”",
                                "하이힐→샌들 2.8배 ↑ 취업–정주",
                                "건설 활성화 한계 <하>",
                                "글로벌 R&D 협력 · M&A 시장",
                                "\"<특집>\"",
                                "R&D 협력 강화",
                                "검사 result; 여름 camp; 시장 salt; 물가 5%; 표 밖 apos; nbsp;",
                                "조각 없는 제목");
                // 본문은 건드리지 않는다 — 덤프 적재가 md5 로 견준다
                assertThat(db.sql("select count(*) from article where body = 'quot;본문quot;'")
                                .query(Integer.class)
                                .single())
                        .isEqualTo(TITLES.size());
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }

    // V16 — 제목 앞에 붙은 줄표 · 공백을 뗀다 (Jira S15P31A102-213). 결과가 ArticleTitleCleaner 와 같아야 한다.
    // 숫자 바로 앞의 「-」는 음수 부호라 두는 것까지 두 곳이 같아야 한다 — Java 는 lookahead, SQL 은 ARE 의 (?!…)
    @Test
    void v15ToV16StripsLeadingDashesLikeTheIngestApi() throws Exception {
        List<String> titles = List.of(
                "--코스피 또 폭락… AI·반도체 성장 제동 위기감",
                "- 단독 보도",
                "—코스피 급락",
                "[속보] 코스피 급락",
                "A-B 협력 발표",
                "코스피 하락-마감",
                "---",
                "-4% 급락하더니 돌연 ‘빨간불’…하이닉스", // 음수 부호 — 그대로 둔다 (기사 11556)
                "- 4% 상승"); // 줄표를 떼고 남은 앞 공백도 턴다
        String schema = "title213_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = dataSource.getConnection()) {
            try {
                migrate(schema, "15");
                connection.setSchema(schema);
                var db = JdbcClient.create(new SingleConnectionDataSource(connection, true));
                db.sql("insert into press(code, name) values ('p213', '나래일보')").update();
                for (int i = 0; i < titles.size(); i++) {
                    db.sql("""
                                    insert into article(id, source, url, press_code, title, body, published_at, created_at)
                                    values (:id, 'NEWSDATA', :url, 'p213', :title, '본문', now(), now())
                                    """)
                            .param("id", i + 1)
                            .param("url", "https://example.com/title213/" + i)
                            .param("title", titles.get(i))
                            .update();
                }

                assertThat(migrate(schema, "16")).isEqualTo(1);

                assertThat(db.sql("select title from article order by id")
                                .query(String.class)
                                .list())
                        .containsExactlyElementsOf(
                                titles.stream().map(ArticleTitleCleaner::clean).toList())
                        .containsExactly(
                                "코스피 또 폭락… AI·반도체 성장 제동 위기감",
                                "단독 보도",
                                "코스피 급락",
                                "[속보] 코스피 급락",
                                "A-B 협력 발표",
                                "코스피 하락-마감",
                                "---", // 줄표뿐이면 그대로 둔다
                                "-4% 급락하더니 돌연 ‘빨간불’…하이닉스",
                                "4% 상승");
            } finally {
                connection.setSchema("public");
                try (var statement = connection.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                }
            }
        }
    }

    private int migrate(String schema, String target) {
        return Flyway.configure()
                .dataSource(dataSource)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
                .migrationsExecuted;
    }
}
