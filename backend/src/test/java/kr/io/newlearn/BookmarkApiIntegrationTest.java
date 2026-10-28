package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class BookmarkApiIntegrationTest {
    @Autowired
    jakarta.persistence.EntityManager em;

    @Autowired
    jakarta.persistence.EntityManagerFactory emf;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        ArticleApiFixtures.insert(jdbc);
    }

    Cookie join(String name) throws Exception {
        return sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody(name, "password1", "독자", "economy")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
    }

    ResultActions add(Cookie session, long id) throws Exception {
        return mvc.perform(
                put("/api/v1/members/me/bookmarks/" + id).cookie(session).with(csrfToken()));
    }

    @Test
    void addIsIdempotentAndRemoveKeepsNullKey() throws Exception {
        Cookie session = join("bookmark63_same");
        String first = add(session, 4201)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookmarked").value(true))
                .andExpect(jsonPath("$.bookmarkedAt", endsWith("+09:00")))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(add(session, 4201)
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .isEqualTo(first);
        assertThat(jdbc.sql("select count(*) from bookmark").query(Long.class).single())
                .isEqualTo(1);
        for (long id : new long[] {4201, 4201, 999999}) {
            mvc.perform(delete("/api/v1/members/me/bookmarks/" + id)
                            .cookie(session)
                            .with(csrfToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.articleId").value(id))
                    .andExpect(jsonPath("$.bookmarked").value(false))
                    .andExpect(jsonPath("$.bookmarkedAt").hasJsonPath())
                    .andExpect(jsonPath("$.bookmarkedAt").isEmpty());
        }
    }

    @Test
    void listIsFlatSortedAndIsolatedAndPublicApisUseOwnState() throws Exception {
        Cookie mine = join("bookmark63_mine"), other = join("bookmark63_other");
        mvc.perform(get("/api/v1/members/me/bookmarks").cookie(other))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
        add(mine, 4201).andExpect(status().isOk());
        add(mine, 4203).andExpect(status().isOk());
        jdbc.sql("update bookmark set created_at='2026-10-27T00:00:00Z'").update();
        em.clear();
        mvc.perform(get("/api/v1/members/me/bookmarks").cookie(mine))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains(4203, 4201)))
                .andExpect(jsonPath("$.items[0].category").isEmpty())
                .andExpect(jsonPath("$.items[1].summary").value("우리 요약"))
                .andExpect(jsonPath("$.items[1].mindmapStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.items[1].bookmarked").value(true))
                .andExpect(jsonPath("$.items[1].bookmarkedAt").value("2026-10-27T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[1].article").doesNotExist())
                .andExpect(jsonPath("$.totalPages").doesNotExist());
        jdbc.sql("update bookmark set created_at='2026-10-28T00:00:00Z' where article_id=4201")
                .update();
        em.clear();
        mvc.perform(get("/api/v1/members/me/bookmarks").cookie(mine))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains(4201, 4203)));
        for (String path : new String[] {"/api/v1/articles/4201", "/api/v1/articles", "/api/v1/events/4200/articles"}) {
            String field = path.endsWith("/4201") ? "$.bookmarked" : "$.items[0].bookmarked";
            mvc.perform(get(path).cookie(mine))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath(field).value(true));
            mvc.perform(get(path).cookie(other))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath(field).value(false));
            mvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath(field).value(false));
        }
        mvc.perform(get("/api/v1/members/me/bookmarks").cookie(other))
                .andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void missingUnreleasedAndMalformedIdsFollowContract() throws Exception {
        Cookie session = join("bookmark63_bad");
        for (long id : new long[] {4210, 999999})
            add(session, id)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("ARTICLE_NOT_FOUND"));
        mvc.perform(put("/api/v1/members/me/bookmarks/no").cookie(session).with(csrfToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(delete("/api/v1/members/me/bookmarks/no").cookie(session).with(csrfToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void csrfPrecedesAuthentication() throws Exception {
        mvc.perform(get("/api/v1/members/me/bookmarks")).andExpect(status().isUnauthorized());
        for (var request : java.util.List.of(
                put("/api/v1/members/me/bookmarks/4201"), delete("/api/v1/members/me/bookmarks/4201"))) {
            mvc.perform(request)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
            mvc.perform(request.with(csrfToken()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        }
    }

    @Test
    void readdingUsesNewTimeAndDeleteCannotTouchAnotherMember() throws Exception {
        Cookie mine = join("bookmark63_readd"), other = join("bookmark63_keep");
        add(mine, 4201).andExpect(status().isOk());
        add(other, 4201).andExpect(status().isOk());
        jdbc.sql("update bookmark set created_at='2020-01-01T00:00:00Z'").update();
        em.clear();
        mvc.perform(delete("/api/v1/members/me/bookmarks/4201").cookie(mine).with(csrfToken()))
                .andExpect(status().isOk());
        add(mine, 4201).andExpect(status().isOk()).andExpect(jsonPath("$.bookmarkedAt", not(startsWith("2020-"))));
        mvc.perform(get("/api/v1/members/me/bookmarks").cookie(other))
                .andExpect(jsonPath("$.items[0].bookmarkedAt").value("2020-01-01T09:00:00+09:00"));
    }

    @Test
    void listQueriesStayConstantAndGuestsNeverReadBookmarks() throws Exception {
        Cookie mine = join("bookmark63_sql");
        add(mine, 4201).andExpect(status().isOk());
        jdbc.sql(
                        "insert into article_event select id,4200,now() from article where id between 4202 and 4209 and id <> 4206")
                .update();
        var stats = emf.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        for (String path : new String[] {"/api/v1/articles", "/api/v1/events/4200/articles"}) {
            long expected = path.contains("events") ? 5 : 4;
            for (String size : new String[] {"2", "8"}) {
                em.flush();
                em.clear();
                stats.clear();
                mvc.perform(get(path).param("size", size)).andExpect(status().isOk());
                assertThat(stats.getPrepareStatementCount()).isEqualTo(expected);
                em.clear();
                stats.clear();
                mvc.perform(get(path).param("size", size).cookie(mine)).andExpect(status().isOk());
                assertThat(stats.getPrepareStatementCount()).isEqualTo(expected + 1);
            }
        }
        for (long id : new long[] {4202, 4203, 4204, 4205}) add(mine, id).andExpect(status().isOk());
        em.flush();
        em.clear();
        stats.clear();
        mvc.perform(get("/api/v1/members/me/bookmarks").cookie(mine)).andExpect(jsonPath("$.items", hasSize(5)));
        assertThat(stats.getPrepareStatementCount()).isEqualTo(3);
    }
}
