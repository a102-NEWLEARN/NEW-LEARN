package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import javax.sql.DataSource;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@Transactional
class MemberCategoriesApiIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    EntityManager em;

    @Autowired
    EntityManagerFactory emf;

    @Autowired
    DataSource dataSource;

    Cookie join(String loginId, String... codes) throws Exception {
        return sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody(loginId, "password1", "독자", codes)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
    }

    ResultActions me(Cookie session) throws Exception {
        return mvc.perform(get("/api/v1/members/me").cookie(session));
    }

    ResultActions change(Cookie session, String body) throws Exception {
        return mvc.perform(put("/api/v1/members/me/categories")
                .cookie(session)
                .with(csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void meUsesExistingMemberResponseAndCategoryTabOrder() throws Exception {
        Cookie session = join("profile65_me", "it_science", "economy", "politics");
        me(session)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.loginId").value("profile65_me"))
                .andExpect(jsonPath("$.name").value("독자"))
                .andExpect(jsonPath("$.categories[*].code", contains("politics", "economy", "it_science")))
                .andExpect(jsonPath("$.categories[0].name").value("정치"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void replacesOnlyCurrentMemberAndDeduplicatesBeforeCounting() throws Exception {
        Cookie mine = join("profile65_self", "economy", "world");
        Cookie other = join("profile65_other", "it_science");
        long otherId = jdbc.sql("select id from member where login_id='profile65_other'")
                .query(Long.class)
                .single();
        String body = """
                {"categoryCodes":["society","politics","society","society","society","society","society"],"memberId":%d}
                """.formatted(otherId);
        for (int repeat = 0; repeat < 2; repeat++) {
            change(mine, body)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.loginId").value("profile65_self"))
                    .andExpect(jsonPath("$.categories[*].code", contains("politics", "society")));
        }
        me(mine).andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[*].code", contains("politics", "society")));
        me(other).andExpect(status().isOk()).andExpect(jsonPath("$.categories[*].code", contains("it_science")));
        assertThat(jdbc.sql(
                                "select count(*) from member_category mc join member m on mc.member_id=m.id where m.login_id='profile65_self'")
                        .query(Long.class)
                        .single())
                .isEqualTo(2);
    }

    @Test
    void rejectsInvalidCodesAndEmptyValuesWithoutChangingStoredCategories() throws Exception {
        Cookie session = join("profile65_bad", "economy", "world");
        for (String body : List.of(
                "{}",
                "{\"categoryCodes\":null}",
                "{\"categoryCodes\":[]}",
                "{\"categoryCodes\":[null]}",
                "{\"categoryCodes\":[\"\"]}",
                "{\"categoryCodes\":[\" \" ]}",
                "{\"categoryCodes\":[\"sports\"]}",
                "{\"categoryCodes\":[\"economy\",\"sports\"]}")) {
            change(session, body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors[0].field", startsWith("categoryCodes")))
                    .andExpect(jsonPath("$.errors[0].reason", containsString("관심 분야")));
            me(session)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.categories[*].code", contains("economy", "world")));
        }
    }

    // U+0000 이 든 코드는 없는 코드와 같은 답이다. PostgreSQL 이 이 글자를 받지 못해 전에는 500 이었다 (Jira 43 후속)
    @Test
    void nulInCodeIsAnUnknownCodeWithoutChangingStoredCategories() throws Exception {
        Cookie session = join("profile65_nul", "economy", "world");

        change(session, "{\"categoryCodes\":[\"economy\\u0000\"]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("categoryCodes"))
                .andExpect(jsonPath("$.errors[0].reason").value("없는 관심 분야가 있어요"));
        me(session)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[*].code", contains("economy", "world")));
    }

    // 서로 다른 코드를 아주 많이 보내도 500 이 아니라 400 이다. 끊지 않으면 findAllById 가 PostgreSQL 매개변수 한도
    // (65,535)를 넘어 INTERNAL_ERROR 가 났다 — 분야 수보다 많으면 DB 를 부르기 전에 끊는다 (Jira 65 리뷰, 가입 A14 도 같은 도우미)
    @Test
    void tooManyDistinctCodesAre400BeforeQueryingCategories() throws Exception {
        Cookie session = join("profile65_many", "economy", "world");
        String codes =
                IntStream.range(0, 70_000).mapToObj(i -> "\"c" + i + "\"").collect(Collectors.joining(","));

        change(session, "{\"categoryCodes\":[" + codes + "]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field", startsWith("categoryCodes")));
        me(session)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[*].code", contains("economy", "world")));
    }

    @Test
    void followsAuthSessionAndCsrfContractWithoutChangingPreferences() throws Exception {
        mvc.perform(get("/api/v1/members/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(put("/api/v1/members/me/categories")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCodes\":[\"world\"]}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(put("/api/v1/members/me/categories"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        Cookie session = join("profile65_csrf", "economy");
        mvc.perform(put("/api/v1/members/me/categories")
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCodes\":[\"world\"]}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(put("/api/v1/members/me/categories")
                        .cookie(session, new Cookie("XSRF-TOKEN", "one"))
                        .header("X-XSRF-TOKEN", "different")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCodes\":[\"world\"]}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        me(session).andExpect(status().isOk()).andExpect(jsonPath("$.categories[*].code", contains("economy")));
    }

    @Test
    void existingSessionsAndLaterLoginReadFreshCategories() throws Exception {
        Cookie first = join("profile65_fresh", "economy");
        Cookie second = sessionCookie(mvc.perform(post("/api/v1/auth/login")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("profile65_fresh", "password1")))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse());
        change(first, "{\"categoryCodes\":[\"it_science\",\"world\"]}").andExpect(status().isOk());
        for (Cookie session : new Cookie[] {first, second}) {
            me(session)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.categories[*].code", contains("world", "it_science")));
        }
        mvc.perform(post("/api/v1/auth/login")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("profile65_fresh", "password1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[*].code", contains("world", "it_science")));
    }

    @Test
    void profileQueriesDoNotGrowWithCategoryCount() throws Exception {
        Cookie session = join("profile65_sql", "economy");
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        for (String codes :
                new String[] {"\"economy\"", "\"politics\",\"economy\",\"society\",\"world\",\"it_science\""}) {
            change(session, "{\"categoryCodes\":[" + codes + "]}").andExpect(status().isOk());
            em.flush();
            em.clear();
            statistics.clear();
            me(session).andExpect(status().isOk());
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        }
    }

    // 요청을 둘러싼 테스트 트랜잭션 없이 서비스 자체의 rollback을 실제 DB에서 확인한다.
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void insertFailureRollsBackDeletionOfExistingCategories() throws Exception {
        Cookie session = join("profile65_tx", "economy", "world");
        long id = jdbc.sql("select id from member where login_id='profile65_tx'")
                .query(Long.class)
                .single();
        try {
            jdbc.sql("""
                    create function test_fail_member65() returns trigger language plpgsql as $$
                    begin raise exception '65 rollback fixture'; return NEW; end $$
                    """).update();
            jdbc.sql(
                            "create trigger test_fail_member65 before insert on member_category for each row when (NEW.member_id="
                                    + id + " and NEW.category_code='society') execute function test_fail_member65()")
                    .update();
            change(session, "{\"categoryCodes\":[\"politics\",\"society\"]}")
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
            me(session)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.categories[*].code", contains("economy", "world")));
        } finally {
            jdbc.sql("drop trigger if exists test_fail_member65 on member_category")
                    .update();
            jdbc.sql("drop function if exists test_fail_member65()").update();
            removeMember(id);
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void concurrentReplacementsRemainWholeLists() throws Exception {
        Cookie session = join("profile65_race", "economy");
        long id = jdbc.sql("select id from member where login_id='profile65_race'")
                .query(Long.class)
                .single();
        try (var blocker = dataSource.getConnection();
                var workers = Executors.newFixedThreadPool(2)) {
            blocker.setAutoCommit(false);
            int blockerPid;
            try (var statement = blocker.createStatement();
                    var result = statement.executeQuery("select pg_backend_pid()")) {
                result.next();
                blockerPid = result.getInt(1);
            }
            try (var statement = blocker.prepareStatement("select id from member where id = ? for update")) {
                statement.setLong(1, id);
                statement.executeQuery().close();
            }
            CountDownLatch ready = new CountDownLatch(2);
            CountDownLatch start = new CountDownLatch(1);
            try {
                var first = workers.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    return change(session, "{\"categoryCodes\":[\"politics\",\"society\"]}")
                            .andExpect(jsonPath("$.categories[*].code", contains("politics", "society")))
                            .andReturn()
                            .getResponse()
                            .getStatus();
                });
                var second = workers.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    return change(session, "{\"categoryCodes\":[\"world\",\"it_science\"]}")
                            .andExpect(jsonPath("$.categories[*].code", contains("world", "it_science")))
                            .andReturn()
                            .getResponse()
                            .getStatus();
                });
                assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
                start.countDown();

                // 두 HTTP 요청이 실제로 겹치고 회원 행의 SELECT 잠금에서 기다리는지 DB에서 확인한다.
                List<String> blocked = List.of();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                while (System.nanoTime() < deadline) {
                    blocked = blockedQueries(blockerPid);
                    if (blocked.size() == 2) {
                        break;
                    }
                    Thread.sleep(20);
                }
                assertThat(blocked)
                        .hasSize(2)
                        .allSatisfy(
                                sql -> assertThat(sql).containsPattern("(?is)from member\\b.*for (no key )?update"));
                assertThat(first.isDone()).isFalse();
                assertThat(second.isDone()).isFalse();
                // 잠금 대기 중에는 이전 목록이 그대로 보인다.
                me(session).andExpect(jsonPath("$.categories[*].code", contains("economy")));
                blocker.commit();

                assertThat(first.get(30, TimeUnit.SECONDS)).isEqualTo(200);
                assertThat(second.get(30, TimeUnit.SECONDS)).isEqualTo(200);
                List<String> stored = jdbc.sql(
                                "select category_code from member_category where member_id=:id order by category_code")
                        .param("id", id)
                        .query(String.class)
                        .list();
                assertThat(stored).isIn(List.of("politics", "society"), List.of("it_science", "world"));
            } finally {
                start.countDown();
                // 단언 실패 시에도 요청이 잡힌 채 executor 종료를 기다리지 않게 잠금을 먼저 푼다.
                blocker.rollback();
            }
        } finally {
            removeMember(id);
        }
    }

    List<String> blockedQueries(int blockerPid) {
        return jdbc.sql("""
                        with recursive waiters(pid) as (
                            select pid from pg_stat_activity where :blocker = any(pg_blocking_pids(pid))
                            union
                            select a.pid from pg_stat_activity a
                            join waiters w on w.pid = any(pg_blocking_pids(a.pid))
                        )
                        select a.query from pg_stat_activity a join waiters w using (pid)
                        where a.datname = current_database() and a.wait_event_type = 'Lock'
                        """).param("blocker", blockerPid).query(String.class).list();
    }

    void removeMember(long id) {
        jdbc.sql("delete from member_category where member_id=:id")
                .param("id", id)
                .update();
        jdbc.sql("delete from member where id=:id").param("id", id).update();
    }
}
