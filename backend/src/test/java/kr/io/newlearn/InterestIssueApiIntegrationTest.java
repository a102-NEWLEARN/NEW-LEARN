package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.servlet.http.Cookie;
import java.util.List;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class InterestIssueApiIntegrationTest {
    @Autowired
    MockMvc mvc;

    @MockitoSpyBean
    JdbcClient jdbc;

    @Autowired
    EntityManager em;

    @Autowired
    EntityManagerFactory emf;

    @BeforeEach
    void fixtures() {
        CategoryIssueFixtures.insert(jdbc);
        jdbc.sql("insert into issue(id,title,created_at,updated_at) values (6400,'빈 이슈',now(),now())")
                .update();
    }

    Cookie join(String loginId) throws Exception {
        return sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody(loginId, "password1", "독자", "economy")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
    }

    long memberId(String loginId) {
        return jdbc.sql("select id from member where login_id=:login")
                .param("login", loginId)
                .query(Long.class)
                .single();
    }

    ResultActions add(Cookie session, long id) throws Exception {
        return mvc.perform(
                put("/api/v1/members/me/interest-issues/" + id).cookie(session).with(csrfToken()));
    }

    ResultActions remove(Cookie session, long id) throws Exception {
        return mvc.perform(delete("/api/v1/members/me/interest-issues/" + id)
                .cookie(session)
                .with(csrfToken()));
    }

    ResultActions list(Cookie session) throws Exception {
        return mvc.perform(get("/api/v1/members/me/interest-issues").cookie(session));
    }

    @Test
    void repeatedSaveKeepsFirstTimeAndRemovalIsIdempotentEvenForMissingIssue() throws Exception {
        Cookie mine = join("interest64_state");
        add(mine, 4102)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueId").value(4102))
                .andExpect(jsonPath("$.interested").value(true))
                .andExpect(jsonPath("$.interestedAt", endsWith("+09:00")));
        jdbc.sql("update interest_issue set created_at='2020-01-01T00:00:00Z' where member_id=:id")
                .param("id", memberId("interest64_state"))
                .update();
        // 실제 HTTP 요청마다 새 영속성 문맥이 열린다. JDBC로 바꾼 시험 시각도 다시 읽게 한다.
        em.clear();
        for (int n = 0; n < 2; n++)
            add(mine, 4102)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.interestedAt").value("2020-01-01T09:00:00+09:00"));
        // 이 회원 것만 센다 — 표에 커밋하는 다른 시험이 생겨도 순서에 흔들리지 않게
        assertThat(jdbc.sql("select count(*) from interest_issue where member_id=:id")
                        .param("id", memberId("interest64_state"))
                        .query(Long.class)
                        .single())
                .isEqualTo(1);
        for (long id : new long[] {4102, 4102, 999999})
            remove(mine, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.interested").value(false))
                    .andExpect(jsonPath("$", hasKey("interestedAt")))
                    .andExpect(jsonPath("$.interestedAt").value(nullValue()));
        add(mine, 4102)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interestedAt", not("2020-01-01T09:00:00+09:00")));
    }

    // 다시 저장해도 표를 한 문장으로만 건드린다. 넣기와 시각 읽기를 두 문장으로 나누면 그 사이에 해제가 끼어들어
    // 있는 이슈인데도 404 가 난다(PUT · DELETE 경합) — 북마크 담기(BookmarkRepository.add)와 같은 까닭
    @Test
    void savingAnExistingInterestTouchesTheTableOnce() throws Exception {
        Cookie mine = join("interest64_once");
        add(mine, 4102).andExpect(status().isOk());
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        em.flush();
        em.clear();
        stats.clear();
        add(mine, 4102)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interested").value(true));
        // 이슈 있는지 보기 · 넣기 · 시각 읽기가 한 문장
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void listsFlatCardsInSavedOrderAndKeepsEmptyIssueAndOtherMemberPrivate() throws Exception {
        Cookie mine = join("interest64_list"), other = join("interest64_other");
        list(mine)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.page").doesNotExist());
        for (long id : new long[] {4102, 4101, 6400}) add(mine, id).andExpect(status().isOk());
        add(other, 4103).andExpect(status().isOk());
        jdbc.sql("update interest_issue set created_at='2020-01-01T00:00:00Z' where member_id=:id")
                .param("id", memberId("interest64_list"))
                .update();
        jdbc.sql("update interest_issue set created_at='2021-01-01T00:00:00Z' where member_id=:id and issue_id=4102")
                .param("id", memberId("interest64_list"))
                .update();
        em.clear();
        list(mine)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains(4102, 6400, 4101)))
                .andExpect(jsonPath("$.items[0].categories[*].code", contains("politics", "economy")))
                .andExpect(jsonPath("$.items[0].articleCount").value(2))
                .andExpect(jsonPath("$.items[0].publisherCount").value(1))
                .andExpect(jsonPath("$.items[0].lastEvent.id").value(4123))
                .andExpect(jsonPath("$.items[*].interested", everyItem(is(true))))
                .andExpect(jsonPath("$.items[0].interestedAt").value("2021-01-01T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[1].eventCount").value(0))
                .andExpect(jsonPath("$.items[1].articleCount").value(0))
                .andExpect(jsonPath("$.items[1].publisherCount").value(0))
                .andExpect(jsonPath(
                        "$.items[1]", allOf(hasKey("firstEventAt"), hasKey("lastEventAt"), hasKey("lastEvent"))))
                .andExpect(jsonPath("$.items[1].firstEventAt").value(nullValue()))
                .andExpect(jsonPath("$.items[1].lastEventAt").value(nullValue()))
                .andExpect(jsonPath("$.items[1].lastEvent").value(nullValue()))
                .andExpect(jsonPath("$.items[0].card").doesNotExist());
        remove(other, 4102).andExpect(status().isOk());
        list(mine).andExpect(jsonPath("$.items", hasSize(3)));
        list(other).andExpect(jsonPath("$.items[*].id", contains(4103)));
    }

    @Test
    void publicCardsAndHeadersOnlyReflectTheRequestingMember() throws Exception {
        Cookie mine = join("interest64_public"), other = join("interest64_guest");
        for (Cookie[] cookies : List.of(new Cookie[0], new Cookie[] {mine}, new Cookie[] {other})) {
            var request = get("/api/v1/issues/4102");
            if (cookies.length > 0) request.cookie(cookies);
            mvc.perform(request)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.interested").value(false))
                    .andExpect(jsonPath("$.lastEvent").doesNotExist());
        }
        add(mine, 4102).andExpect(status().isOk());
        for (boolean own : new boolean[] {true, false}) {
            Cookie session = own ? mine : other;
            mvc.perform(get("/api/v1/issues/4102").cookie(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.interested").value(own));
            mvc.perform(get("/api/v1/issues").cookie(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[?(@.id == 4102)].interested", contains(own)));
        }
        mvc.perform(get("/api/v1/issues")).andExpect(jsonPath("$.items[*].interested", everyItem(is(false))));
        mvc.perform(get("/api/v1/issues/6400").cookie(mine))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(0))
                .andExpect(jsonPath("$.lastEvent").doesNotExist());
    }

    @Test
    void missingAndMalformedIdsFollowTheContract() throws Exception {
        Cookie mine = join("interest64_errors");
        add(mine, 999999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
        for (String method : new String[] {"PUT", "DELETE"}) {
            mvc.perform(request(
                                    org.springframework.http.HttpMethod.valueOf(method),
                                    "/api/v1/members/me/interest-issues/no")
                            .cookie(mine)
                            .with(csrfToken()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }

    @Test
    void csrfPrecedesAuthenticationAndFailedRequestsDoNotSave() throws Exception {
        mvc.perform(get("/api/v1/members/me/interest-issues"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        Cookie mine = join("interest64_csrf");
        for (String method : new String[] {"PUT", "DELETE"}) {
            var verb = org.springframework.http.HttpMethod.valueOf(method);
            mvc.perform(request(verb, "/api/v1/members/me/interest-issues/4102").with(csrfToken()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
            for (Cookie[] cookies : List.of(new Cookie[0], new Cookie[] {mine})) {
                var request = request(verb, "/api/v1/members/me/interest-issues/4102");
                if (cookies.length > 0) request.cookie(cookies);
                mvc.perform(request)
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
            }
            mvc.perform(request(verb, "/api/v1/members/me/interest-issues/4102")
                            .cookie(mine, new Cookie("XSRF-TOKEN", "one"))
                            .header("X-XSRF-TOKEN", "different"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        list(mine).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
        add(mine, 4102).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/members/me/interest-issues/4102").cookie(mine))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        list(mine).andExpect(status().isOk()).andExpect(jsonPath("$.items[*].id", contains(4102)));
    }

    @Test
    void returnsMoreThanOneHundredSavedIssuesWithoutPagination() throws Exception {
        Cookie mine = join("interest64_many");
        list(mine).andExpect(status().isOk());
        jdbc.sql(
                        "insert into issue(id,title,created_at,updated_at) select n,'이슈',now(),now() from generate_series(64100,64204) n")
                .update();
        jdbc.sql(
                        "insert into interest_issue(member_id,issue_id,created_at) select :member,id,'2020-01-01T00:00:00Z' from issue where id between 64100 and 64204")
                .param("member", memberId("interest64_many"))
                .update();
        list(mine)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(105)))
                .andExpect(jsonPath("$.items[0].id").value(64204))
                .andExpect(jsonPath("$.items[104].id").value(64100))
                .andExpect(jsonPath("$.page").doesNotExist())
                .andExpect(jsonPath("$.totalElements").doesNotExist());
    }

    @Test
    void jdbcAndHibernateQueriesStayConstantAndGuestsNeverReadInterest() throws Exception {
        Cookie mine = join("interest64_sql");
        list(mine).andExpect(status().isOk());
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        for (int size : new int[] {2, 8}) {
            jdbc.sql("delete from interest_issue where member_id=:id")
                    .param("id", memberId("interest64_sql"))
                    .update();
            jdbc.sql(
                            "insert into issue(id,title,created_at,updated_at) select n,'이슈',now(),now() from generate_series(:lo,:hi) n on conflict (id) do nothing")
                    .param("lo", 64500)
                    .param("hi", 64500 + size - 1)
                    .update();
            jdbc.sql(
                            "insert into interest_issue(member_id,issue_id,created_at) select :member,id,now() from issue where id between :lo and :hi")
                    .param("member", memberId("interest64_sql"))
                    .param("lo", 64500)
                    .param("hi", 64500 + size - 1)
                    .update();
            em.flush();
            em.clear();
            stats.clear();
            clearInvocations(jdbc);
            mvc.perform(get("/api/v1/issues").param("size", String.valueOf(size)))
                    .andExpect(status().isOk());
            verify(jdbc, times(4)).sql(anyString());
            assertThat(stats.getPrepareStatementCount()).isZero();
            em.clear();
            stats.clear();
            clearInvocations(jdbc);
            mvc.perform(get("/api/v1/issues")
                            .param("size", String.valueOf(size))
                            .cookie(mine))
                    .andExpect(status().isOk());
            verify(jdbc, times(4)).sql(anyString());
            assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
            em.clear();
            stats.clear();
            clearInvocations(jdbc);
            list(mine).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(size)));
            verify(jdbc, times(3)).sql(anyString());
            assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        }
        em.clear();
        stats.clear();
        clearInvocations(jdbc);
        mvc.perform(get("/api/v1/issues/4102")).andExpect(status().isOk());
        verify(jdbc, times(2)).sql(anyString());
        assertThat(stats.getPrepareStatementCount()).isZero();
        em.clear();
        stats.clear();
        clearInvocations(jdbc);
        mvc.perform(get("/api/v1/issues/4102").cookie(mine)).andExpect(status().isOk());
        verify(jdbc, times(2)).sql(anyString());
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        jdbc.sql("delete from interest_issue where member_id=:id")
                .param("id", memberId("interest64_sql"))
                .update();
        em.clear();
        stats.clear();
        clearInvocations(jdbc);
        list(mine).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
        verifyNoInteractions(jdbc);
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
    }
}
