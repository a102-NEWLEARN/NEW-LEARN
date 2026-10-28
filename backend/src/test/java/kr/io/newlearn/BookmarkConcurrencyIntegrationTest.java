package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class BookmarkConcurrencyIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    DataSource dataSource;

    @Test
    void overlappingPutsWaitOnUniqueKeyAndKeepStoredTime() throws Exception {
        var session = sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody("bookmark63_race", "password1", "독자", "economy")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
        long memberId = jdbc.sql("select id from member where login_id='bookmark63_race'")
                .query(Long.class)
                .single();
        jdbc.sql("insert into press values ('bookmark63','시험신문')").update();
        long articleId = jdbc.sql("""
                insert into article(source,url,press_code,title,body,published_at,released_at,created_at)
                values ('NEWSDATA','https://fixture.invalid/bookmark63/race','bookmark63','동시 담기','본문',now(),now(),now()) returning id
                """).query(Long.class).single();
        // 연결 4개를 한꺼번에 쓴다(막는 연결 1 + 막힌 PUT 2 + 대기 확인 1) — 시험 설정의 연결 상한 4(config/application.yaml)와 맞물린다
        try (var blocker = dataSource.getConnection();
                var workers = Executors.newFixedThreadPool(2)) {
            blocker.setAutoCommit(false);
            int pid;
            try (var statement = blocker.createStatement();
                    var result = statement.executeQuery("select pg_backend_pid()")) {
                result.next();
                pid = result.getInt(1);
            }
            try (var statement = blocker.prepareStatement("insert into bookmark values (?,?,'2020-01-01T00:00:00Z')")) {
                statement.setLong(1, memberId);
                statement.setLong(2, articleId);
                statement.executeUpdate();
            }
            CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
            Callable<String> request = () -> {
                ready.countDown();
                assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                return mvc.perform(put("/api/v1/members/me/bookmarks/" + articleId)
                                .cookie(session)
                                .with(csrfToken()))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.bookmarkedAt").value("2020-01-01T09:00:00+09:00"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
            };
            try {
                var first = workers.submit(request);
                var second = workers.submit(request);
                assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
                start.countDown();
                java.util.List<String> blocked = java.util.List.of();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                while (System.nanoTime() < deadline) {
                    blocked = jdbc.sql(
                                    "select query from pg_stat_activity where :pid=any(pg_blocking_pids(pid)) and datname=current_database()")
                            .param("pid", pid)
                            .query(String.class)
                            .list();
                    if (blocked.size() == 2) break;
                    Thread.sleep(20);
                }
                assertThat(blocked)
                        .hasSize(2)
                        .allSatisfy(sql -> assertThat(sql.toLowerCase(java.util.Locale.ROOT))
                                .contains("insert into bookmark", "on conflict"));
                assertThat(first.isDone()).isFalse();
                assertThat(second.isDone()).isFalse();
                blocker.commit();
                assertThat(first.get(30, TimeUnit.SECONDS)).isEqualTo(second.get(30, TimeUnit.SECONDS));
                assertThat(jdbc.sql("select count(*) from bookmark where member_id=:id")
                                .param("id", memberId)
                                .query(Long.class)
                                .single())
                        .isEqualTo(1);
            } finally {
                start.countDown();
                blocker.rollback();
            }
        } finally {
            jdbc.sql("delete from member_category where member_id=:id")
                    .param("id", memberId)
                    .update();
            jdbc.sql("delete from member where id=:id").param("id", memberId).update();
            jdbc.sql("delete from article where id=:id").param("id", articleId).update();
            jdbc.sql("delete from press where code='bookmark63'").update();
        }
    }
}
