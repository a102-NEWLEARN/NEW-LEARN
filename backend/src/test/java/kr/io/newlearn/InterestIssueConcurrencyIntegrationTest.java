package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
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
class InterestIssueConcurrencyIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    DataSource dataSource;

    @Test
    void twoPutsWaitForTheSameInsertAndKeepItsFirstTimestamp() throws Exception {
        var session = sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody("interest64_race", "password1", "독자", "economy")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
        long member = jdbc.sql("select id from member where login_id='interest64_race'")
                .query(Long.class)
                .single();
        long issue = jdbc.sql(
                        "insert into issue(title,created_at,updated_at) values ('동시 관심',now(),now()) returning id")
                .query(Long.class)
                .single();
        // 공개 기사가 있는 이슈만 저장할 수 있다(Jira 179)
        long event = jdbc.sql("""
                insert into event(issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:issue,'사건','키워드',now(),'EXTRACTED',now(),now(),'MAIN') returning id
                """).param("issue", issue).query(Long.class).single();
        jdbc.sql("insert into press values ('race64','동시신문')").update();
        long article = jdbc.sql("""
                insert into article(source,url,press_code,title,body,published_at,released_at,created_at)
                values ('NEWSDATA','https://fixture.invalid/64/race','race64','기사','본문',now(),now(),now()) returning id
                """).query(Long.class).single();
        jdbc.sql("insert into article_event values (:article,:event,now())")
                .param("article", article)
                .param("event", event)
                .update();
        try {
            // 기능이 없을 때는 SQL 오류가 아니라 라우트의 404 단언으로 먼저 실패한다.
            mvc.perform(put("/api/v1/members/me/interest-issues/" + issue)
                            .cookie(session)
                            .with(csrfToken()))
                    .andExpect(status().isOk());
            jdbc.sql("delete from interest_issue where member_id=:id")
                    .param("id", member)
                    .update();
            try (var blocker = dataSource.getConnection();
                    var workers = Executors.newFixedThreadPool(2)) {
                blocker.setAutoCommit(false);
                int pid;
                try (var statement = blocker.createStatement();
                        var rows = statement.executeQuery("select pg_backend_pid()")) {
                    rows.next();
                    pid = rows.getInt(1);
                }
                try (var insert =
                        blocker.prepareStatement("insert into interest_issue values (?,?,'2020-01-01T00:00:00Z')")) {
                    insert.setLong(1, member);
                    insert.setLong(2, issue);
                    insert.executeUpdate();
                }
                CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
                Callable<String> put = () -> {
                    ready.countDown();
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    return mvc.perform(put("/api/v1/members/me/interest-issues/" + issue)
                                    .cookie(session)
                                    .with(csrfToken()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.interested").value(true))
                            .andExpect(jsonPath("$.interestedAt").value("2020-01-01T09:00:00+09:00"))
                            .andReturn()
                            .getResponse()
                            .getContentAsString();
                };
                try {
                    var first = workers.submit(put);
                    var second = workers.submit(put);
                    assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
                    start.countDown();
                    List<String> blocked = List.of();
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
                                    .contains("insert into interest_issue", "on conflict"));
                    assertThat(first.isDone()).isFalse();
                    assertThat(second.isDone()).isFalse();
                    blocker.commit();
                    assertThat(first.get(30, TimeUnit.SECONDS)).isEqualTo(second.get(30, TimeUnit.SECONDS));
                    assertThat(jdbc.sql("select count(*) from interest_issue where member_id=:id")
                                    .param("id", member)
                                    .query(Long.class)
                                    .single())
                            .isEqualTo(1);
                } finally {
                    start.countDown();
                    blocker.rollback();
                }
            }
        } finally {
            jdbc.sql("delete from member_category where member_id=:id")
                    .param("id", member)
                    .update();
            jdbc.sql("delete from member where id=:id").param("id", member).update();
            jdbc.sql("delete from article_event where article_id=:id")
                    .param("id", article)
                    .update();
            jdbc.sql("delete from article where id=:id").param("id", article).update();
            jdbc.sql("delete from press where code='race64'").update();
            jdbc.sql("delete from event where id=:id").param("id", event).update();
            jdbc.sql("delete from issue where id=:id").param("id", issue).update();
        }
    }
}
