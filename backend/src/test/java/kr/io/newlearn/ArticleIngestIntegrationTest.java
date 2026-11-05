package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// B2 기사 적재 (Jira 153, docs/api-internal.md 2절, docs/specs/F01-article-ingest-api.md). 실제 PostgreSQL 로 본다
// 출입증 값은 ArticleReleaseIntegrationTest 와 같게 둔다 — 설정이 같아야 Spring 이 시험용 앱을 다시 써서 CI 의 DB 연결이 늘지 않는다
// 만든 행은 끝날 때 지운다. 시험 자료는 모두 ingest153 으로 시작한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=worker-key-for-release-test",
            "newlearn.internal.batch-key=" + ArticleReleaseIntegrationTest.BATCH_KEY
        })
class ArticleIngestIntegrationTest {

    static final String BATCH_KEY = ArticleReleaseIntegrationTest.BATCH_KEY;
    static final String URL = "https://fixture.invalid/ingest153/";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JsonMapper jsonMapper;

    @Autowired
    DataSource dataSource;

    @AfterEach
    void cleanUp() {
        // 언론사 코드로도 지운다 — 막아야 할 URL(javascript: 등)이 잘못 저장되면 URL 로는 안 잡혀 언론사 지우기가 외래 키에 걸린다
        jdbc.sql(
                        "delete from article where url like 'https://fixture.invalid/ingest153/%' or press_code like 'ingest153%'")
                .update();
        jdbc.sql("delete from press_mapping where source_value like 'ingest153%'")
                .update();
        jdbc.sql("delete from press where code like 'ingest153%'").update();
        jdbc.sql("delete from category_mapping where source_value like 'ingest153-%'")
                .update();
    }

    // AC-1 새 기사는 201 과 id. 받은 칸 그대로 넣고 공개 시각은 비운다 — 투입(B1)하고 분석이 끝나야 화면에 보인다
    @Test
    void newArticleIsStoredHiddenAndReturns201() throws Exception {
        long id = created(b2(body(URL + "new"), BATCH_KEY));

        Map<String, Object> row = jdbc.sql("""
                select source, url, press_code, title, reporter, body, category_code, released_at, created_at,
                       published_at = '2026-11-03T08:15:46+09:00'::timestamptz as same_instant,
                       array_to_string(source_categories, '|') as categories,
                       array_to_string(source_tags, '|') as tags
                from article where id = :id
                """).param("id", id).query().singleRow();
        assertThat(row)
                .containsEntry("source", "NEWSDATA")
                .containsEntry("url", URL + "new")
                .containsEntry("press_code", "ingest153_news1")
                .containsEntry("title", "적재 시험 기사")
                .containsEntry("reporter", "홍길동 기자")
                .containsEntry("body", "본문 첫 문장. 둘째 문장.")
                .containsEntry("categories", "ingest153-top|ingest153-business")
                .containsEntry("tags", "economy|corporate news")
                .containsEntry("released_at", null)
                .containsEntry("same_instant", true); // AC-4 같은 순간 — UTC 23:15:46 은 한국 시간 다음 날 08:15:46
        assertThat(row.get("category_code")).isNull(); // 대응 행이 없으면 비운다
        assertThat(row.get("created_at")).isNotNull();
        mvc.perform(get("/api/v1/articles/{id}", id)).andExpect(status().isNotFound());
    }

    // AC-1 선택 칸 — 기자명이 빈 값이면 null, 원본 분류가 없으면 빈 목록, 태그가 없으면 null
    @Test
    void optionalFieldsFallBack() throws Exception {
        Map<String, Object> body = body(URL + "optional");
        body.put("reporter", "   ");
        body.remove("sourceCategories");
        body.remove("sourceTags");

        long id = created(b2(body, BATCH_KEY));

        Map<String, Object> row = jdbc.sql("""
                select reporter, cardinality(source_categories) as categories, source_tags is null as no_tags
                from article where id = :id
                """).param("id", id).query().singleRow();
        assertThat(row)
                .containsEntry("reporter", null)
                .containsEntry("categories", 0)
                .containsEntry("no_tags", true);
    }

    // AC-2 같은 URL 은 200 과 같은 id. 두 번째 요청의 칸 값 · 처음 보는 언론사로 아무것도 바뀌지 않는다
    @Test
    void sameUrlReturnsTheSameArticleAndChangesNothing() throws Exception {
        long id = created(b2(body(URL + "same"), BATCH_KEY));
        Map<String, Object> again = body(URL + "same");
        again.put("title", "다른 제목");
        again.put("pressSourceId", "ingest153_other");
        again.put("pressName", "다른신문");

        JsonNode second = json(b2(again, BATCH_KEY).andExpect(status().isOk()));

        assertThat(second.get("articleId").asLong()).isEqualTo(id);
        assertThat(second.get("created").asBoolean()).isFalse();
        assertThat(count("select count(*) from article where url = :v", URL + "same"))
                .isEqualTo(1);
        assertThat(jdbc.sql("select title from article where id = :id")
                        .param("id", id)
                        .query(String.class)
                        .single())
                .isEqualTo("적재 시험 기사");
        assertThat(count("select count(*) from press where code = :v", "ingest153_other"))
                .isZero();
    }

    // AC-2 같은 URL 을 다른 연결이 넣는 중이면 요청은 유일 키에서 기다린다. 그쪽이 커밋하면 저장이 유일 키에 걸리고,
    // 트랜잭션 밖에서 다시 찾아 그 기사의 id 를 200 으로 준다. 미리 찾기는 커밋 전 행을 못 봐 이 길을 지난다
    // 연결 3개를 쓴다(막는 연결 1 + 막힌 요청 1 + 대기 확인 1) — 시험 설정의 연결 상한 4 안
    @Test
    void sameUrlInFlightWaitsOnUniqueKeyThenReturnsThatArticle() throws Exception {
        jdbc.sql("insert into press values ('ingest153_race', '먼저신문')").update();
        String url = URL + "race";
        Map<String, Object> request = body(url);
        request.put("pressSourceId", "ingest153_race_late");
        request.put("pressName", "나중신문");
        try (var blocker = dataSource.getConnection();
                ExecutorService worker = Executors.newSingleThreadExecutor()) {
            blocker.setAutoCommit(false);
            int pid;
            try (var statement = blocker.createStatement();
                    var result = statement.executeQuery("select pg_backend_pid()")) {
                result.next();
                pid = result.getInt(1);
            }
            long blockerId;
            try (var statement = blocker.prepareStatement("""
                    insert into article(source, url, press_code, title, body, published_at, created_at)
                    values ('NEWSDATA', ?, 'ingest153_race', '먼저 넣은 기사', '본문', now(), now()) returning id
                    """)) {
                statement.setString(1, url);
                try (var result = statement.executeQuery()) {
                    result.next();
                    blockerId = result.getLong(1);
                }
            }
            try {
                Future<String> response = worker.submit(() -> b2(request, BATCH_KEY)
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString());
                List<String> blocked = List.of();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                while (System.nanoTime() < deadline) {
                    blocked =
                            jdbc.sql("""
                                    select query from pg_stat_activity
                                    where :pid = any(pg_blocking_pids(pid)) and datname = current_database()
                                    """).param("pid", pid).query(String.class).list();
                    if (blocked.size() == 1) {
                        break;
                    }
                    Thread.sleep(20);
                }
                assertThat(blocked)
                        .singleElement()
                        .satisfies(
                                sql -> assertThat(sql.toLowerCase(Locale.ROOT)).contains("insert into article"));
                assertThat(response.isDone()).isFalse();

                blocker.commit();

                JsonNode json = jsonMapper.readTree(response.get(30, TimeUnit.SECONDS));
                assertThat(json.get("articleId").asLong()).isEqualTo(blockerId);
                assertThat(json.get("created").asBoolean()).isFalse();
            } finally {
                blocker.rollback();
            }
        }
        assertThat(count("select count(*) from article where url = :v", url)).isEqualTo(1);
        // 요청이 등록하려던 언론사도 그 트랜잭션과 같이 되돌아간다
        assertThat(count("select count(*) from press where code = :v", "ingest153_race_late"))
                .isZero();
    }

    // AC-3 처음 보는 언론사는 언론사(code = source_id, 이름 = source_name)와 대응 행을 같이 만든다.
    // 같은 source_id 의 두 번째 기사는 새로 만들지 않고, 이름이 다르게 와도 처음 이름이 남는다
    @Test
    void unknownPressIsRegisteredOnce() throws Exception {
        Map<String, Object> first = body(URL + "kbs-1");
        first.put("pressSourceId", "ingest153_kbs_kr");
        first.put("pressName", "Kbs 뉴스");
        Map<String, Object> second = body(URL + "kbs-2");
        second.put("pressSourceId", "ingest153_kbs_kr");
        second.put("pressName", "KBS");

        long one = created(b2(first, BATCH_KEY));
        long two = created(b2(second, BATCH_KEY));

        assertThat(jdbc.sql("select name from press where code = 'ingest153_kbs_kr'")
                        .query(String.class)
                        .list())
                .containsExactly("Kbs 뉴스");
        assertThat(jdbc.sql("""
                        select press_code from press_mapping
                        where source = 'NEWSDATA' and source_value = 'ingest153_kbs_kr'
                        """).query(String.class).list()).containsExactly("ingest153_kbs_kr");
        assertThat(pressOf(one)).isEqualTo("ingest153_kbs_kr");
        assertThat(pressOf(two)).isEqualTo("ingest153_kbs_kr");
    }

    // AC-3 같은 코드의 언론사만 있고 대응 행이 없으면(11-15 덤프 · 11-02 시험 언론사) 대응만 붙고 이름은 그대로다
    @Test
    void existingPressCodeGetsOnlyAMapping() throws Exception {
        jdbc.sql("insert into press values ('ingest153_newsis', '뉴시스')").update();
        Map<String, Object> body = body(URL + "newsis");
        body.put("pressSourceId", "ingest153_newsis");
        body.put("pressName", "Newsis");

        long id = created(b2(body, BATCH_KEY));

        assertThat(pressOf(id)).isEqualTo("ingest153_newsis");
        assertThat(jdbc.sql("select name from press where code = 'ingest153_newsis'")
                        .query(String.class)
                        .single())
                .isEqualTo("뉴시스");
        assertThat(count(
                        "select count(*) from press_mapping where source = 'NEWSDATA' and source_value = :v",
                        "ingest153_newsis"))
                .isEqualTo(1);
    }

    // AC-3 대응 행이 있으면 그 행의 언론사를 쓴다 — 사람이 같은 언론사로 묶어 둔 표기를 source_id 로 짐작하지 않는다
    @Test
    void mappedPressWinsOverSourceId() throws Exception {
        jdbc.sql("insert into press values ('ingest153_main', '본사신문')").update();
        jdbc.sql("insert into press_mapping values ('NEWSDATA', 'ingest153_alias', 'ingest153_main')")
                .update();
        Map<String, Object> body = body(URL + "alias");
        body.put("pressSourceId", "ingest153_alias");
        body.put("pressName", "별칭신문");

        long id = created(b2(body, BATCH_KEY));

        assertThat(pressOf(id)).isEqualTo("ingest153_main");
        assertThat(count("select count(*) from press where code = :v", "ingest153_alias"))
                .isZero();
    }

    // AC-4 오프셋이 없는 시각은 400 — NewsData pubDate 를 그대로 보내면 몇 시인지 모른다(배치가 Z 를 붙여 보낸다)
    @ParameterizedTest
    @ValueSource(strings = {"2026-11-02T23:15:46", "2026-11-02 23:15:46"})
    void publishedAtWithoutOffsetIs400(String publishedAt) throws Exception {
        Map<String, Object> body = body(URL + "no-offset");
        body.put("publishedAt", publishedAt);

        b2(body, BATCH_KEY)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", hasItem("publishedAt")));
        assertThat(count("select count(*) from article where url = :v", URL + "no-offset"))
                .isZero();
    }

    static Stream<Arguments> invalidFields() {
        return Stream.of(
                invalid("url", body -> body.remove("url")),
                invalid("url", body -> body.put("url", " ")),
                invalid("url", body -> body.put("url", URL + "x".repeat(2049 - URL.length()))),
                invalid("pressSourceId", body -> body.remove("pressSourceId")),
                invalid("pressSourceId", body -> body.put("pressSourceId", " ")),
                invalid("pressSourceId", body -> body.put("pressSourceId", "p".repeat(101))),
                invalid("pressName", body -> body.remove("pressName")),
                invalid("pressName", body -> body.put("pressName", "  ")),
                invalid("pressName", body -> body.put("pressName", "이".repeat(101))),
                invalid("title", body -> body.remove("title")),
                invalid("title", body -> body.put("title", "")),
                invalid("title", body -> body.put("title", "제".repeat(301))),
                invalid("reporter", body -> body.put("reporter", "기".repeat(201))),
                invalid("body", body -> body.put("body", null)), // NewsData content 가 null 인 기사
                invalid("body", body -> body.put("body", "")),
                invalid("body", body -> body.put("body", "  \n ")),
                invalid("body", body -> body.put("body", "본".repeat(100_001))),
                invalid("publishedAt", body -> body.remove("publishedAt")),
                invalid("sourceCategories", body -> body.put("sourceCategories", Collections.nCopies(21, "top"))),
                invalid("sourceCategories[1]", body -> body.put("sourceCategories", List.of("top", " "))),
                invalid("sourceCategories[0]", body -> body.put("sourceCategories", List.of("c".repeat(101)))),
                invalid("sourceTags", body -> body.put("sourceTags", Collections.nCopies(21, "economy"))),
                invalid("sourceTags[0]", body -> body.put("sourceTags", List.of(""))),
                invalid("sourceTags[0]", body -> body.put("sourceTags", List.of("t".repeat(101)))));
    }

    // AC-5 필수 값이 없거나 비었거나 길이 · 개수를 넘으면 400 과 그 칸. 아무것도 저장하지 않는다
    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidFields")
    void invalidFieldIs400AndStoresNothing(String field, Consumer<Map<String, Object>> breakIt) throws Exception {
        Map<String, Object> body = body(URL + "invalid");
        breakIt.accept(body);

        b2(body, BATCH_KEY)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", hasItem(field)));
        assertThat(count("select count(*) from article where url like :v", URL + "%"))
                .isZero();
        assertThat(count("select count(*) from press where code = :v", "ingest153_news1"))
                .isZero();
    }

    // AC-6 원문 링크는 A8 화면에 그대로 나간다 — http · https 이고 호스트가 있어야 한다
    @ParameterizedTest
    @ValueSource(
            strings = {
                "ftp://fixture.invalid/ingest153/ftp",
                "javascript:alert(1)",
                "https:///ingest153/no-host",
                "https://",
                "/ingest153/relative",
                "fixture.invalid/ingest153/no-scheme",
                "mailto:someone@fixture.invalid"
            })
    void nonHttpUrlIs400(String url) throws Exception {
        b2(body(url), BATCH_KEY)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", hasItem("url")));
        assertThat(count("select count(*) from article where url = :v", url)).isZero();
    }

    // AC-6 퍼센트 인코딩 안 된 한글 경로 · 대문자 scheme 도 실제 링크로 온다 — 받는다
    @ParameterizedTest
    @ValueSource(strings = {URL + "한글기사?q=값", "HTTPS://fixture.invalid/ingest153/upper"})
    void realWorldLinksAreAccepted(String url) throws Exception {
        long id = created(b2(body(url), BATCH_KEY));
        assertThat(jdbc.sql("select url from article where id = :id")
                        .param("id", id)
                        .query(String.class)
                        .single())
                .isEqualTo(url);
        jdbc.sql("delete from article where id = :id").param("id", id).update();
    }

    static Stream<Arguments> nulFields() {
        return Stream.of(
                invalid("url", body -> body.put("url", URL + "nul\u0000")),
                invalid("pressSourceId", body -> body.put("pressSourceId", "ingest153\u0000")),
                invalid("pressName", body -> body.put("pressName", "뉴스\u00001")),
                invalid("title", body -> body.put("title", "제목\u0000")),
                invalid("reporter", body -> body.put("reporter", "기자\u0000")),
                invalid("body", body -> body.put("body", "본문\u0000끝")),
                invalid("sourceCategories[0]", body -> body.put("sourceCategories", List.of("top\u0000"))),
                invalid("sourceTags[1]", body -> body.put("sourceTags", List.of("economy", "\u0000"))));
    }

    // AC-7 U+0000 은 PostgreSQL 이 글자로 받지 못해 저장하면 500 이다 — DB 에 닿기 전에 400
    @ParameterizedTest(name = "{0}")
    @MethodSource("nulFields")
    void nulIs400(String field, Consumer<Map<String, Object>> breakIt) throws Exception {
        Map<String, Object> body = body(URL + "nul");
        breakIt.accept(body);

        b2(body, BATCH_KEY)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", hasItem(field)));
        assertThat(count("select count(*) from article where url like :v", URL + "%"))
                .isZero();
    }

    // AC-8 대표 카테고리 — 원본 값이 모두 대응 표에 있으면 칸이 찬 행 중 priority 가 가장 작은 것, 같으면 카테고리 순서.
    // 표에 없는 값이 하나라도 있으면 비운다(아직 아무도 대응을 정하지 않은 값이라). 칸이 빈 행(top 같은 값)은 건너뛴다
    @Test
    void categoryIsChosenOnlyWhenEveryValueIsKnown() throws Exception {
        jdbc.sql("""
                insert into category_mapping values
                    ('NEWSDATA', 'ingest153-top', null, 1),
                    ('NEWSDATA', 'ingest153-business', 'economy', 2),
                    ('NEWSDATA', 'ingest153-politics', 'politics', 2),
                    ('NEWSDATA', 'ingest153-world', 'world', 3)
                """).update();

        assertThat(categoryFor("top-business", "ingest153-top", "ingest153-business"))
                .isEqualTo("economy");
        assertThat(categoryFor("tie", "ingest153-world", "ingest153-business", "ingest153-politics"))
                .isEqualTo("politics"); // priority 2 둘 — 정치(1번)가 경제(2번)보다 먼저
        assertThat(categoryFor("unknown", "ingest153-business", "ingest153-unknown"))
                .isNull();
        assertThat(categoryFor("only-skipped", "ingest153-top")).isNull();
        assertThat(categoryFor("none")).isNull();
    }

    // V11 의 실제 NewsData 대응 행으로 — CategoryMappingMigrationTest 의 다시 계산(SQL)과 같은 조합이 같은 대표가 된다(Jira 170)
    // 구체적인 것 먼저: 국제 1 · IT·과학 2 · 정치 3 · 경제 4 · 사회 5
    @Test
    void newsDataValuesFromV11PickTheMostSpecificCategory() throws Exception {
        assertThat(categoryFor("v11-it", "top", "business", "technology")).isEqualTo("it_science");
        assertThat(categoryFor("v11-politics", "crime", "politics", "top")).isEqualTo("politics");
        assertThat(categoryFor("v11-world", "world", "politics")).isEqualTo("world");
        assertThat(categoryFor("v11-domestic", "domestic")).isEqualTo("society");
        assertThat(categoryFor("v11-economy", "environment", "business")).isEqualTo("economy");
        assertThat(categoryFor("v11-top", "top")).isNull();
        assertThat(categoryFor("v11-unknown", "business", "ingest153-newcat")).isNull();
    }

    // AC-11 대표를 정치로 고른 기사만 제목 규칙으로 국제에 옮긴다 (Jira 171)
    @Test
    void foreignPoliticsTitleMovesOnlyArticlesChosenAsPolitics() throws Exception {
        assertThat(categoryForTitle("v12-foreign", "트럼프, 이란 공습 시사", "politics", "top"))
                .isEqualTo("world");
        assertThat(categoryForTitle("v12-domestic", "국민의힘 \"美 관세 대책 내놔라\"", "politics"))
                .isEqualTo("politics");
        assertThat(categoryForTitle("v12-not-politics", "뉴욕증시, 美 중간선거에 약세", "politics"))
                .isEqualTo("politics");
        assertThat(categoryForTitle("v12-north", "北, 단거리 탄도미사일 발사", "politics")).isEqualTo("politics");
        assertThat(categoryForTitle("v12-economy", "트럼프 관세에 수입 물가 들썩", "business", "top"))
                .isEqualTo("economy");
        assertThat(categoryForTitle("v12-empty", "트럼프, 이란 공습 시사", "top")).isNull();
        assertThat(categoryForTitle("v12-unknown", "트럼프, 이란 공습 시사", "politics", "ingest153-newcat"))
                .isNull();
    }

    // AC-12 제목의 HTML 조각은 글자로 되돌려 저장한다. 본문은 그대로다
    @Test
    void htmlFragmentsInTitleAreRestoredOnIngest() throws Exception {
        Map<String, Object> body = body(URL + "title-fragments");
        body.put("title", "홍길동 quot;대표 나설 생각quot;hellip; Ramp;D");
        body.put("body", "quot;본문quot;");

        long id = created(b2(body, BATCH_KEY));

        assertThat(jdbc.sql("select title from article where id = :id")
                        .param("id", id)
                        .query(String.class)
                        .single())
                .isEqualTo("홍길동 \"대표 나설 생각\"… R&D");
        assertThat(jdbc.sql("select body from article where id = :id")
                        .param("id", id)
                        .query(String.class)
                        .single())
                .isEqualTo("quot;본문quot;");
    }

    // AC-9 B2 는 배치 출입증으로만 연다. 워커 출입증은 403, 출입증이 없으면 401. 아무것도 저장하지 않는다
    @Test
    void onlyTheBatchKeyCanIngest() throws Exception {
        b2(body(URL + "worker"), "worker-key-for-release-test")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(post("/internal/v1/articles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonMapper.writeValueAsString(body(URL + "nokey"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        assertThat(count("select count(*) from article where url like :v", URL + "%"))
                .isZero();
    }

    // AC-10 저장이 URL 이 아닌 까닭(기본 키 충돌 — 정한 id 로 넣고 시퀀스를 안 맞춘 덤프)으로 실패하면 같은 URL 로 잘못
    // 읽지 않는다. 다시 찾아도 그 URL 이 없으니 원래 오류 그대로 500 이다
    @Test
    void primaryKeyCollisionIsNotReadAsSameUrl() throws Exception {
        long next = jdbc.sql("select nextval(pg_get_serial_sequence('article', 'id'))")
                .query(Long.class)
                .single();
        jdbc.sql("insert into press values ('ingest153_pk', '자리신문')").update();
        jdbc.sql("""
                insert into article(id, source, url, press_code, title, body, published_at, created_at)
                values (:id, 'NEWSDATA', :url, 'ingest153_pk', '자리 차지', '본문', now(), now())
                """).param("id", next + 1).param("url", URL + "pk-taken").update();

        b2(body(URL + "pk-new"), BATCH_KEY)
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
        assertThat(count("select count(*) from article where url = :v", URL + "pk-new"))
                .isZero();
    }

    private static Arguments invalid(String field, Consumer<Map<String, Object>> breakIt) {
        return Arguments.of(field, breakIt);
    }

    // 11-03 NewsData 응답 한 건을 B2 칸으로 옮긴 모양(배치가 보낼 것)
    private static Map<String, Object> body(String url) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("url", url);
        body.put("pressSourceId", "ingest153_news1");
        body.put("pressName", "뉴스1");
        body.put("title", "적재 시험 기사");
        body.put("reporter", "홍길동 기자");
        body.put("body", "본문 첫 문장. 둘째 문장.");
        body.put("publishedAt", "2026-11-02T23:15:46Z");
        // 원본 분류는 시험용 값 — 실제 NewsData 값(top · business)의 대응 행이 나중에 생겨도 「행이 없으면 비운다」가 그대로 맞게
        body.put("sourceCategories", new ArrayList<>(List.of("ingest153-top", "ingest153-business")));
        body.put("sourceTags", new ArrayList<>(List.of("economy", "corporate news")));
        return body;
    }

    private ResultActions b2(Map<String, Object> body, String key) throws Exception {
        return mvc.perform(post("/internal/v1/articles")
                .header("X-Internal-Key", key)
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonMapper.writeValueAsString(body)));
    }

    private long created(ResultActions result) throws Exception {
        JsonNode json = json(result.andExpect(status().isCreated()));
        assertThat(json.get("created").asBoolean()).isTrue();
        return json.get("articleId").asLong();
    }

    private JsonNode json(ResultActions result) throws Exception {
        return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private String categoryFor(String name, String... sourceCategories) throws Exception {
        return categoryForTitle(name, "적재 시험 기사", sourceCategories);
    }

    private String categoryForTitle(String name, String title, String... sourceCategories) throws Exception {
        Map<String, Object> body = body(URL + "category-" + name);
        body.put("title", title);
        body.put("sourceCategories", List.of(sourceCategories));
        long id = created(b2(body, BATCH_KEY));
        return jdbc.sql("select category_code from article where id = :id")
                .param("id", id)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    private String pressOf(long articleId) {
        return jdbc.sql("select press_code from article where id = :id")
                .param("id", articleId)
                .query(String.class)
                .single();
    }

    private long count(String sql, String value) {
        return jdbc.sql(sql).param("v", value).query(Long.class).single();
    }
}
