package kr.io.newlearn;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class IssueTimelineApiIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        CategoryIssueFixtures.insert(jdbc);
        jdbc.sql("insert into issue(id,title,created_at,updated_at) values (4800,'빈 이슈',now(),now())")
                .update();
        jdbc.sql("update event set occurred_at_basis='FIRST_PUBLISHED' where id=4122")
                .update();
    }

    @Test
    void headerReusesCardAggregatesWithoutLastEvent() throws Exception {
        mvc.perform(get("/api/v1/issues/4102"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(4102))
                .andExpect(jsonPath("$.summary").hasJsonPath())
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.categories", hasSize(2)))
                .andExpect(jsonPath("$.categories[0].code").value("politics"))
                .andExpect(jsonPath("$.categories[1].code").value("economy"))
                .andExpect(jsonPath("$.eventCount").value(3))
                .andExpect(jsonPath("$.articleCount").value(2))
                .andExpect(jsonPath("$.publisherCount").value(1))
                .andExpect(jsonPath("$.firstEventAt").value("2026-10-20T09:00:00+09:00"))
                .andExpect(jsonPath("$.lastEventAt").value("2026-10-22T09:00:00+09:00"))
                .andExpect(jsonPath("$.createdAt").value("2026-10-01T09:00:00+09:00"))
                .andExpect(jsonPath("$.lastEvent").doesNotExist());
    }

    @Test
    void timelineKeepsZeroArticleEventsAndSortsByOccurrenceThenId() throws Exception {
        mvc.perform(get("/api/v1/issues/4102/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueId").value(4102))
                .andExpect(jsonPath("$.events", hasSize(3)))
                .andExpect(jsonPath("$.events[0].id").value(4121))
                .andExpect(jsonPath("$.events[1].id").value(4122))
                .andExpect(jsonPath("$.events[2].id").value(4123))
                .andExpect(jsonPath("$.events[0].label").value("키워드"))
                .andExpect(jsonPath("$.events[0].occurredAt").value("2026-10-20T09:00:00+09:00"))
                .andExpect(jsonPath("$.events[0].occurredAtBasis").value("EXTRACTED"))
                .andExpect(jsonPath("$.events[1].occurredAtBasis").value("FIRST_PUBLISHED"))
                .andExpect(jsonPath("$.events[0].articleCount").value(2))
                .andExpect(jsonPath("$.events[0].publisherCount").value(1))
                .andExpect(jsonPath("$.events[1].articleCount").value(0))
                .andExpect(jsonPath("$.events[2].articleCount").value(0))
                .andExpect(jsonPath("$.events[2].publisherCount").value(0))
                .andExpect(jsonPath("$.events[0].lane").value("MAIN"))
                .andExpect(jsonPath("$.relations").doesNotExist())
                .andExpect(jsonPath("$.events[0].relations").doesNotExist())
                .andExpect(jsonPath("$.page").doesNotExist());
    }

    // 레인은 사건 역할로 계산한다 — MAIN 은 메인 흐름, REACTION 은 서브 흐름. 반응 대상 한 줄은 내보내지 않는다
    // (docs/api-screen.md A4, Jira 130)
    @Test
    void laneFollowsTheEventRole() throws Exception {
        jdbc.sql("update event set role='REACTION', reacts_to='이슈 전반' where id=4123")
                .update();

        mvc.perform(get("/api/v1/issues/4102/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events[0].lane").value("MAIN"))
                .andExpect(jsonPath("$.events[1].lane").value("MAIN"))
                .andExpect(jsonPath("$.events[2].lane").value("SUB"))
                .andExpect(jsonPath("$.events[2].reactsTo").doesNotExist());
    }

    // 반응 대상 사건 번호는 대상이 같은 이슈의 사건일 때만 싣는다 — 화면이 같은 타임라인 안에서 반응 점선을 그린다.
    // 다른 이슈 · 이슈 밖 사건이면 null. 칸은 늘 있다 (docs/api-screen.md A4, 2026-10-28)
    @Test
    void reactsToEventIdIsSentOnlyForATargetInTheSameIssue() throws Exception {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (4199,null,'이슈 밖 사건','독립','2026-10-19T00:00:00Z','EXTRACTED',now(),now(),'MAIN')
                """).update();
        reactsTo(4121, 4199); // 이슈 밖
        reactsTo(4122, 4111); // 다른 이슈(4101)
        reactsTo(4123, 4121); // 같은 이슈

        mvc.perform(get("/api/v1/issues/4102/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events[0].reactsToEventId").hasJsonPath())
                .andExpect(jsonPath("$.events[0].reactsToEventId").isEmpty())
                .andExpect(jsonPath("$.events[1].reactsToEventId").hasJsonPath())
                .andExpect(jsonPath("$.events[1].reactsToEventId").isEmpty())
                .andExpect(jsonPath("$.events[2].reactsToEventId").value(4121));
        mvc.perform(get("/api/v1/issues/4101/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events[0].reactsToEventId").hasJsonPath())
                .andExpect(jsonPath("$.events[0].reactsToEventId").isEmpty());
    }

    private void reactsTo(long eventId, long targetId) {
        jdbc.sql("update event set role='REACTION', reacts_to_event_id=:target where id=:id")
                .param("target", targetId)
                .param("id", eventId)
                .update();
    }

    @Test
    void existingEmptyIssueReturnsZeroHeaderAndEmptyTimeline() throws Exception {
        mvc.perform(get("/api/v1/issues/4800"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(0))
                .andExpect(jsonPath("$.articleCount").value(0))
                .andExpect(jsonPath("$.publisherCount").value(0))
                .andExpect(jsonPath("$.categories", hasSize(0)))
                .andExpect(jsonPath("$.firstEventAt").hasJsonPath())
                .andExpect(jsonPath("$.firstEventAt").isEmpty())
                .andExpect(jsonPath("$.lastEventAt").hasJsonPath())
                .andExpect(jsonPath("$.lastEventAt").isEmpty())
                .andExpect(jsonPath("$.lastEvent").doesNotExist());
        mvc.perform(get("/api/v1/issues/4800/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueId").value(4800))
                .andExpect(jsonPath("$.events", hasSize(0)));
    }

    @Test
    void missingAndInvalidIssueIdsUseCommonErrors() throws Exception {
        for (String path : new String[] {"/api/v1/issues/999999", "/api/v1/issues/999999/timeline"}) {
            mvc.perform(get(path))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
        }
        for (String path : new String[] {"/api/v1/issues/invalid", "/api/v1/issues/invalid/timeline"}) {
            mvc.perform(get(path))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }
}
